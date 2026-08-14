/**
 * POST /api/school-research/generate
 *
 * Standalone research generator that populates school_research. Its OWN endpoint
 * (not called inline from doc generation — two agentic loops in one 300s function
 * would time out). SSE progress; Sonnet-driven; grounding-validated before persist.
 *
 * Lifecycle: insert pending (is_current=false) -> run loop -> validate -> update to
 * complete|partial|failed -> on success flip is_current atomically (set_current_research)
 * -> on failure leave the previous current row untouched.
 */

import { NextRequest } from 'next/server'
import { familyAdmin } from '@/lib/tenant-db'
import { getFamilyContext } from '@/lib/require-family'
import { createClient } from '@/lib/supabase/server'
import {
  runSchoolResearch, validateResearch, PENDING_TIMEOUT_MS,
  type ResearchSeed,
} from '@/lib/school-research'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const fam = await getFamilyContext()
  if (!fam.ok) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  const familyId = fam.ctx.familyId

  const { schoolId } = (await req.json()) as { schoolId?: string }
  if (!schoolId) return new Response(JSON.stringify({ error: 'Missing schoolId' }), { status: 400 })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))

      const admin = familyAdmin(familyId) // T1: service role, family-scoped (SSE/LLM path)
      let ourId: string | null = null

      try {
        // ── Seed context ────────────────────────────────────────────────
        send('progress', { stage: 'context', message: 'Loading program details...' })

        const { data: school } = await admin
          .from('schools')
          .select('id, name, division, conference, location, head_coach, coach_page_url')
          .eq('id', schoolId)
          .single()
        if (!school) { send('error', { message: 'School not found' }); controller.close(); return }

        const { data: profile } = await admin
          .from('players') // T1: players by family (wrapper-scoped); T2 decides whose grad year anchors shared research
          .select('grad_year')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()

        const seed: ResearchSeed = {
          schoolId,
          name: school.name,
          division: school.division,
          conference: school.conference,
          location: school.location,
          headCoach: school.head_coach,
          coachPageUrl: school.coach_page_url,
          gradYear: (profile?.grad_year as number | null) ?? null,
        }

        // ── Concurrency guard: insert pending, back off if an earlier run exists ──
        const cutoff = new Date(Date.now() - PENDING_TIMEOUT_MS).toISOString()

        const { data: inserted, error: insErr } = await admin
          .from('school_research')
          .insert({ school_id: schoolId, status: 'pending', is_current: false })
          .select('id, generated_at')
          .single()
        if (insErr || !inserted) {
          send('error', { message: `Could not start: ${insErr?.message ?? 'insert failed'}` })
          controller.close(); return
        }
        ourId = inserted.id

        const { data: otherPending } = await admin
          .from('school_research')
          .select('id, generated_at')
          .eq('school_id', schoolId)
          .eq('status', 'pending')
          .neq('id', ourId)
          .gte('generated_at', cutoff)

        const earlierExists = (otherPending ?? []).some(r =>
          r.generated_at < inserted.generated_at ||
          (r.generated_at === inserted.generated_at && r.id < ourId!)
        )
        if (earlierExists) {
          await admin.from('school_research').delete().eq('id', ourId)
          ourId = null
          send('busy', { message: 'A research run for this school is already in progress. Try again in a moment.' })
          controller.close(); return
        }

        // ── Run the agentic loop ────────────────────────────────────────
        send('progress', { stage: 'research', message: 'Researching the program...' })

        const raw = await runSchoolResearch({
          seed,
          onProgress: (msg) => send('progress', { stage: 'research', message: msg }),
        })

        // ── Grounding validation ────────────────────────────────────────
        send('progress', { stage: 'validate', message: 'Verifying every claim against a fetched source...' })

        const { snapshot, sources, drops, status } =
          validateResearch(raw.rawSnapshot, raw.rawSources, raw.fetchedUrls)

        for (const d of drops) {
          console.warn(`[school-research] DROPPED "${d.claim_key}" (${d.label}) — ${d.reason}${d.offending_urls.length ? ': ' + d.offending_urls.join(', ') : ''}`)
        }

        // ── Persist result on our row ───────────────────────────────────
        send('progress', { stage: 'save', message: 'Saving research...' })

        const { error: updErr } = await admin
          .from('school_research')
          .update({
            status,
            model: raw.model,
            tool_call_count: raw.toolCallCount,
            snapshot,
            sources,
            fetched_urls: raw.fetchedUrls,
            error: null,
          })
          .eq('id', ourId)
        if (updErr) throw new Error(`Persist failed: ${updErr.message}`)

        // ── On success, flip is_current atomically (one statement in the fn) ──
        if (status !== 'failed') {
          const { error: flipErr } = await admin.rpc('set_current_research', {
            p_school_id: schoolId,
            p_id: ourId,
          })
          if (flipErr) throw new Error(`is_current flip failed: ${flipErr.message}`)
        }
        // On 'failed' we leave is_current as-is (false) — the previous current row
        // is untouched, so a failed refresh never destroys usable research.

        send('complete', {
          researchId: ourId,
          status,
          counts: {
            staff: snapshot.staff.length,
            attrition: snapshot.attrition_next_two_cycles.length,
            commits: snapshot.published_commits_for_class.commits.length,
            sources: sources.length,
            fetchedUrls: raw.fetchedUrls.length,
            dropped: drops.length,
          },
          drops: drops.map(d => ({ claim_key: d.claim_key, label: d.label, reason: d.reason })),
          usage: { inputTokens: raw.totalInputTokens, outputTokens: raw.totalOutputTokens, toolCalls: raw.toolCallCount },
        })
        controller.close()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error('[school-research/generate] Error:', err)
        // Mark our pending row failed (do NOT touch the previous current row).
        if (ourId) {
          await admin.from('school_research')
            .update({ status: 'failed', error: msg, is_current: false })
            .eq('id', ourId)
            .then(() => {}, () => {})
        }
        send('error', { message: msg })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
