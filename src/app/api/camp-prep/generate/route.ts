/**
 * POST /api/camp-prep/generate
 *
 * Phase 5 — the judgment stage. Consumes a confirmed camp extraction (a prep_docs
 * draft) plus the full CRM thread, the player profile, and the whole-list calibration
 * context, and writes the structured CampDoc to prep_docs.content via Opus. Leaves
 * storage_path null.
 *
 * Phase 5.5 — SCOPE CUT: this endpoint no longer reads school_research at all (no
 * staleness gate, no research_id). Every section now draws only from the CRM, the
 * confirmed extraction, or a family-authored field. The research pipeline still
 * exists and stays useful — it is simply off this document's critical path.
 */

import { NextRequest } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { fetchSchoolContext } from '@/lib/school-context'
import { extractJsonObject } from '@/lib/agentic-research'
import {
  CAMP_DOC_MODEL, buildCampDocSystemPrompt, buildCampDocUserPrompt,
  type CampDoc, type DocPlayerProfile, type DocSchoolListItem, type PreferencesRead,
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

        // Fail-closed guard: fetchSchoolContext swallows query errors (empty thread ==
        // failed fetch). A silent thread-fetch failure must NOT become a confident
        // "cold relationship / nothing has happened yet" in §1/§2. Verify the thread.
        const { count: threadCount, error: threadErr } = await db
          .from('contact_log')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', draft.school_id)
          .not('parse_status', 'in', '("orphan","non_coach")')
        if (threadErr || ((threadCount ?? 0) > 0 && sctx.contactLog.length === 0)) {
          send('error', { message: 'Could not load the coach thread reliably — refusing to generate (the document would misread the relationship).' })
          controller.close(); return
        }

        // ── Player profile (includes the family-authored recruiting_preferences) ──
        const { data: pp, error: ppErr } = await db
          .from('player_profile')
          .select('current_stats, upcoming_schedule, highlights, academic_summary, position, grad_year, home_timezone, preparation_notes, recruiting_preferences')
          .limit(1)
          .maybeSingle()
        // Fail-closed: an EMPTY preferences field (family wrote nothing) is not the
        // same as a FAILED read (profile query errored). Calibration may state absence
        // on 'empty'; on 'failed' it must NOT. Same principle the removed digest held.
        const prefsRaw = (pp?.recruiting_preferences as string | null)?.trim() || ''
        const preferences: PreferencesRead = ppErr
          ? { status: 'failed', value: null, reason: ppErr.message }
          : prefsRaw
            ? { status: 'ok', value: prefsRaw }
            : { status: 'empty', value: null }
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

        // ── Calibration input: the family-authored preferences field (per-generation
        //    status logged so a silent read failure can't masquerade as "no preference") ──
        console.log(`[camp-prep/generate] recruiting-preferences read: status=${preferences.status}${preferences.reason ? ` reason=${preferences.reason}` : ''}`)
        if (preferences.status === 'failed') console.warn(`[camp-prep/generate] preferences READ FAILED — calibration will degrade (no absence assertion): ${preferences.reason}`)

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
          schoolName: sctx.school.name,
          schoolList,
          preferences,
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
        // Phase 5.5: research_id is no longer set (column left in place, now always null).
        const { error: updErr } = await db
          .from('prep_docs')
          .update({ content: doc, generated_at: new Date().toISOString() })
          .eq('id', docId)
        if (updErr) throw new Error(`Persist failed: ${updErr.message}`)

        send('complete', {
          docId,
          recruitingPreferences: { status: preferences.status, reason: preferences.reason ?? null },
          usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
          counts: {
            touchpoints: doc.where_you_stand?.coach_touchpoints?.length ?? 0,
            planDays: doc.the_plan?.length ?? 0,
            staff: doc.the_staff?.length ?? 0,
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
