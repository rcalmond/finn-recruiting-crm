/**
 * GET /api/camp-prep/pdf/[id]
 *
 * Phase 6 — camp prep PDF. Builds the PDF from prep_docs.content via the camp-doc
 * renderer (NOT the call-prep renderer), uploads it to the assets bucket, sets
 * prep_docs.storage_path, and streams it back as an attachment. Building on demand
 * keeps the PDF in lockstep with the current content; the upload satisfies the
 * "write to the bucket + set storage_path" requirement.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rawService } from '@/lib/tenant-db'
import { getFamilyContext } from '@/lib/require-family'
import { generateCampDocPdf } from '@/lib/camp-doc-pdf'
import { validateCampDoc } from '@/lib/camp-doc-validate'
import type { CampDoc } from '@/lib/camp-doc'

export const runtime = 'nodejs'
export const maxDuration = 120

function safe(s: string) { return (s || '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '') || 'camp' }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Auth + family (T1)
  const fam = await getFamilyContext()
  if (!fam.ok) return NextResponse.json({ error: fam.status === 401 ? 'Unauthorized' : 'No family' }, { status: fam.status })
  const { familyId, supabase } = fam.ctx

  const admin = supabase // T1: user client for rows — RLS enforces; storage via rawService
  const { data: doc, error } = await admin
    .from('prep_docs')
    .select('content, school_id, camp_name_snapshot, camp_dates_snapshot, doc_type, generated_at')
    .eq('id', id)
    .single()

  if (error || !doc) return NextResponse.json({ error: 'Doc not found' }, { status: 404 })
  if (doc.doc_type !== 'camp') return NextResponse.json({ error: 'Not a camp document' }, { status: 400 })
  if (!doc.content) return NextResponse.json({ error: 'No document has been generated yet' }, { status: 400 })

  // Defensive: only render a shape-valid document (the endpoint won't persist an
  // invalid one, but a hand-written or legacy row could still be malformed).
  const errs = validateCampDoc(doc.content)
  if (errs.length) return NextResponse.json({ error: `Document is malformed and cannot be rendered: ${errs.slice(0, 4).join('; ')}` }, { status: 422 })

  const generatedDate = doc.generated_at
    ? new Date(doc.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : undefined
  let pdf: Buffer
  try { pdf = await generateCampDocPdf(doc.content as CampDoc, { generatedDate }) }
  catch (err) { return NextResponse.json({ error: `PDF build failed: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 500 }) }

  const storagePath = `${familyId}/camp-prep/${doc.school_id}/${id}.pdf`
  const { error: upErr } = await rawService().storage /* T1: service-role upsert; family-prefixed path */.from('assets').upload(storagePath, pdf, { contentType: 'application/pdf', upsert: true })
  if (upErr) return NextResponse.json({ error: `Storage upload failed: ${upErr.message}` }, { status: 500 })
  await admin.from('prep_docs').update({ storage_path: storagePath }).eq('id', id)

  const fileName = `Camp_Prep_${safe(doc.camp_name_snapshot ?? 'camp')}_${safe(doc.camp_dates_snapshot ?? '')}.pdf`.replace(/_\.pdf$/, '.pdf')
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
