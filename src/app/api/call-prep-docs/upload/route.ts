import { NextRequest, NextResponse } from 'next/server'
import { rawService } from '@/lib/tenant-db'
import { getFamilyContext } from '@/lib/require-family'

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export async function POST(req: NextRequest) {
  // Auth + family (T1)
  const fam = await getFamilyContext()
  if (!fam.ok) return NextResponse.json({ error: fam.status === 401 ? 'Unauthorized' : 'No family' }, { status: fam.status })
  const { familyId, supabase } = fam.ctx

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const schoolId = formData.get('schoolId') as string
  const coachId = formData.get('coachId') as string
  const coachName = formData.get('coachName') as string
  const date = formData.get('date') as string
  const notes = (formData.get('notes') as string) || null

  if (!file || !schoolId || !coachId || !coachName || !date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File exceeds 25 MB limit' }, { status: 400 })
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Only .docx and .pdf files are accepted.' },
      { status: 400 }
    )
  }

  const admin = supabase // T1: user client for rows — RLS enforces; storage via rawService

  const docId = crypto.randomUUID()
  const ext = file.name.endsWith('.pdf') ? '.pdf' : '.docx'
  const storagePath = `${familyId}/call-prep/${schoolId}/${docId}${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: storageError } = await rawService().storage /* T1: writes stay service-role; path is family-prefixed */
    .from('assets')
    .upload(storagePath, Buffer.from(arrayBuffer), {
      contentType: file.type,
      upsert: false,
    })

  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 500 })
  }

  const { data: doc, error: dbError } = await admin
    .from('prep_docs')
    .insert({
      id: docId,
      school_id: schoolId,
      coach_id: coachId,
      coach_name_snapshot: coachName,
      framing_notes: notes,
      storage_path: storagePath,
      tool_call_count: null,
      source: 'uploaded',
      generated_at: new Date(date + 'T12:00:00-07:00').toISOString(),
    })
    .select()
    .single()

  if (dbError) {
    await rawService().storage.from('assets').remove([storagePath])
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ doc }, { status: 201 })
}
