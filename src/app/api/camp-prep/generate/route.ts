/**
 * POST /api/camp-prep/generate
 *
 * Phase 5 — the judgment stage. Consumes a confirmed camp extraction (a prep_docs
 * draft) plus the full CRM thread, current school_research, the player profile, and
 * the whole-list calibration context, and writes the structured CampDoc to
 * prep_docs.content via Opus. Sets research_id; leaves storage_path null.
 *
 * The research staleness GATE is the client's job (confirm before spending). This
 * endpoint uses whatever getCurrentResearch returns and never nests a research run.
 */

import { NextRequest } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { fetchSchoolContext } from '@/lib/school-context'
import { getCurrentResearch } from '@/lib/school-research'
import { extractJsonObject } from '@/lib/agentic-research'
import {
  CAMP_DOC_MODEL, buildCampDocSystemPrompt, buildCampDocUserPrompt,
  type CampDoc, type DocPlayerProfile, type DocSchoolListItem,
} from '@/lib/camp-doc'
import type { CampExtraction, CampPrepInputs } from '@/lib/camp-prep'

export const runtime = 'nodejs'
export const maxDuration = 300

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
function admin() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const { docId } = (await req.json()) as { docId?: string }
  if (!docId) return new Response(JSON.stringify({ error: 'Missing docId' }), { status: 400 })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      const db = admin()

      try {
        send('progress', { stage: 'context', message: 'Assembling context…' })

        // ── The draft ──
        const { data: draft } = await db
          .from('prep_docs')
          .select('id, school_id, camp_id, camp_name_snapshot, camp_dates_snapshot, inputs, extracted_schedule, doc_type')
          .eq('id', docId)
          .single()
        if (!draft || draft.doc_type !== 'camp' || !draft.extracted_schedule) {
          send('error', { message: 'Camp draft not found or has no confirmed extraction.' }); controller.close(); return
        }

        // ── School context (full thread, coaches, offers) ──
        const sctx = await fetchSchoolContext(db, draft.school_id)
        if (!sctx.school) { send('error', { message: 'Host school not found.' }); controller.close(); return }

        // ── Current research ──
        const research = await getCurrentResearch(db, draft.school_id)

        // ── Player profile ──
        const { data: pp } = await db
          .from('player_profile')
          .select('current_stats, upcoming_schedule, highlights, academic_summary, position, grad_year, home_timezone, preparation_notes')
          .limit(1)
          .maybeSingle()
        const player: DocPlayerProfile = {
          name: 'Finn Almond',
          position: (pp?.position as string | null) ?? null,
          grad_year: (pp?.grad_year as number | null) ?? null,
          home_timezone: (pp?.home_timezone as string | null)?.trim() || 'America/Denver',
          preparation_notes: (pp?.preparation_notes as string | null) ?? null,
          current_stats: (pp?.current_stats as string | null) ?? null,
          upcoming_schedule: (pp?.upcoming_schedule as string | null) ?? null,
          highlights: (pp?.highlights as string | null) ?? null,
          academic_summary: (pp?.academic_summary as string | null) ?? null,
        }

        // ── Whole list (calibration) ──
        const { data: allSchools } = await db
          .from('schools')
          .select('id, name, category, recruiting_stage, status')
          .neq('category', 'Nope')
          .neq('status', 'Inactive')
        const { data: allOffers } = await db.from('school_offers').select('school_id')
        const offerSet = new Set((allOffers ?? []).map(o => o.school_id))
        const schoolList: DocSchoolListItem[] = (allSchools ?? []).map(s => ({
          name: s.name, tier: s.category, stage: s.recruiting_stage, status: s.status, has_offer: offerSet.has(s.id),
        }))

        // ── Generate ──
        send('progress', { stage: 'generate', message: 'Regista is writing the document (Opus)…' })

        const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: player.home_timezone })
        const userPrompt = buildCampDocUserPrompt({
          today, player,
          camp: { name: draft.camp_name_snapshot ?? sctx.school.name, dates: draft.camp_dates_snapshot ?? '' },
          extraction: draft.extracted_schedule as CampExtraction,
          inputs: (draft.inputs as CampPrepInputs) ?? { camp_email_raw: '', travel_prose: '', extra_notes: '' },
          contactLog: sctx.contactLog,
          coaches: sctx.coaches,
          offers: sctx.offers,
          research: research?.snapshot ?? null,
          researchStatus: research?.status ?? null,
          schoolName: sctx.school.name,
          schoolList,
        })

        const message = await anthropic.messages.create({
          model: CAMP_DOC_MODEL,
          max_tokens: 16000,
          system: buildCampDocSystemPrompt(),
          messages: [{ role: 'user', content: userPrompt }],
        })
        const raw = message.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
        const doc = extractJsonObject(raw) as CampDoc

        // ── Persist ──
        send('progress', { stage: 'save', message: 'Saving document…' })
        const { error: updErr } = await db
          .from('prep_docs')
          .update({ content: doc, research_id: research?.id ?? null, generated_at: new Date().toISOString() })
          .eq('id', docId)
        if (updErr) throw new Error(`Persist failed: ${updErr.message}`)

        send('complete', {
          docId,
          usedResearch: !!research,
          usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
          counts: {
            quotes: doc.where_you_stand?.quotes?.length ?? 0,
            planDays: doc.the_plan?.length ?? 0,
            staff: doc.the_staff?.length ?? 0,
            hasFit: !!doc.the_fit,
          },
        })
        controller.close()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error('[camp-prep/generate] Error:', err)
        send('error', { message: msg })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  })
}
