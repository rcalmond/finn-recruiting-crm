import { NextRequest } from 'next/server'
import { familyAdmin } from '@/lib/tenant-db'
import { getFamilyContext } from '@/lib/require-family'
import { createClient } from '@/lib/supabase/server'
import { fetchSchoolContext } from '@/lib/school-context'
import { withPrimary } from '@/lib/coach-primary'
import { fetchCoachFamilyState, withFamilyState } from '@/lib/coach-family-state'
import { runAgenticResearch } from '@/lib/call-prep-research'
import { buildCallPrepSystemPrompt, buildCallPrepUserPrompt } from '@/lib/call-prep-prompt'
import { generateCallPrepPdf } from '@/lib/call-prep-pdf'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  // Auth + family (T1)
  const fam = await getFamilyContext()
  if (!fam.ok) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  const familyId = fam.ctx.familyId

  const body = await req.json()
  const { schoolId, coachId, framingNotes } = body as {
    schoolId: string
    coachId: string
    framingNotes?: string
  }

  if (!schoolId || !coachId) {
    return new Response(JSON.stringify({ error: 'Missing schoolId or coachId' }), { status: 400 })
  }

  // SSE stream for progress
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const admin = familyAdmin(familyId) // T1: service role, family-scoped (SSE/LLM path)

        // ── Step 1: Fetch school context ──────────────────────────────────

        send('progress', { stage: 'context', message: 'Loading school context...' })

        const ctx = await fetchSchoolContext(admin, schoolId, { includeActionItems: true })
        if (!ctx.school) {
          send('error', { message: 'School not found' })
          controller.close()
          return
        }

        // Find the target coach
        const { data: coachData } = await admin
          .from('coaches')
          .select('id, name, role, email, is_primary, archived_at, needs_review')
          .eq('id', coachId)
          .single()

        if (!coachData) {
          send('error', { message: 'Coach not found' })
          controller.close()
          return
        }

        // THE SECOND COACH BOUNDARY. ctx.coaches is composed inside
        // fetchSchoolContext, but this single-row fetch is not — it is its own
        // read, and call-prep-prompt renders "Is primary contact:" from it. It
        // has to be composed here or that one line would keep answering from
        // the legacy column after every other surface had moved.
        const targetState = await fetchCoachFamilyState(admin, [coachId])
        const targetCoach = withPrimary(
          ctx.school,
          withFamilyState([coachData as {
            id: string
            name: string
            role: string | null
            email: string | null
            is_primary: boolean
            archived_at: string | null
            needs_review: boolean
          }], targetState),
        )[0]

        // Fetch active inventory messages
        const { data: messages } = await admin
          .from('messages')
          .select('title, type, notes')
          .eq('status', 'active')
          .order('created_at', { ascending: false })

        const inventoryMessages = (messages ?? []) as Array<{ title: string; type: string; notes: string | null }>

        // ── Step 2: Check for recent existing prep doc ────────────────────

        const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()
        const { data: existingDocs } = await admin
          .from('prep_docs')
          .select('id, coach_name_snapshot, generated_at')
          .eq('school_id', schoolId)
          .eq('doc_type', 'call')   // the 14-day reuse rule is call-prep-only; a camp doc must not satisfy it
          .gte('generated_at', fourteenDaysAgo)
          .order('generated_at', { ascending: false })
          .limit(1)

        if (existingDocs && existingDocs.length > 0) {
          send('existing', {
            docId: existingDocs[0].id,
            coachName: existingDocs[0].coach_name_snapshot,
            generatedAt: existingDocs[0].generated_at,
          })
        }

        // ── Step 3: Agentic research + synthesis ─────────────────────────

        send('progress', { stage: 'research', message: 'Starting agentic research with Opus...' })

        // Identity + biography from the family's players row.
        // TODO(multi-player): first player by created_at.
        const { data: prepPlayer } = await admin.from('players')
          .select('name, position, grad_year, club, academic_summary, highlights, current_stats')
          .order('created_at', { ascending: true }).limit(1).maybeSingle()
        const prepPositionNote =
          /\b(transition(ed)?|moved|switch(ed)?|converted)\b/i.test(`${prepPlayer?.highlights ?? ''} ${prepPlayer?.current_stats ?? ''}`)
            ? "the player's profile records a position change; any decline predating it was based on a different position"
            : null

        const systemPrompt = buildCallPrepSystemPrompt(prepPlayer, prepPlayer?.academic_summary, prepPlayer?.current_stats, prepPlayer?.highlights)
        const userPrompt = buildCallPrepUserPrompt({
          positionChangeNote: prepPositionNote,
          school: ctx.school,
          targetCoach,
          coaches: ctx.coaches,
          contactHistory: ctx.contactLog,
          camps: ctx.upcomingCamps,
          declineHistory: ctx.declineHistory,
          currentAssets: ctx.currentAssets,
          framingNotes: framingNotes?.trim() || null,
          inventoryMessages,
        })

        const { prepData, toolCallCount, totalInputTokens, totalOutputTokens } =
          await runAgenticResearch({
            systemPrompt,
            userPrompt,
            onProgress: (msg) => send('progress', { stage: 'research', message: msg }),
          })

        // ── Step 4: Generate PDF ─────────────────────────────────────────

        send('progress', { stage: 'pdf', message: 'Building PDF...' })

        const pdfBuffer = await generateCallPrepPdf(prepData)

        // ── Step 5: Upload PDF + insert prep_docs row ──────────────

        send('progress', { stage: 'upload', message: 'Saving prep document...' })

        const docId = crypto.randomUUID()
        // T1: new writes are family-prefixed (legacy objects stay at their old paths)
        const storagePath = `${familyId}/call-prep/${schoolId}/${docId}.pdf`

        const { error: storageError } = await admin.storage
          .from('assets')
          .upload(storagePath, pdfBuffer, {
            contentType: 'application/pdf',
            upsert: false,
          })

        if (storageError) {
          send('error', { message: `Storage upload failed: ${storageError.message}` })
          controller.close()
          return
        }

        const { data: doc, error: dbError } = await admin
          .from('prep_docs')
          .insert({
            id: docId,
            school_id: schoolId,
            coach_id: coachId,
            coach_name_snapshot: targetCoach.name,
            framing_notes: framingNotes?.trim() || null,
            storage_path: storagePath,
            tool_call_count: toolCallCount,
          })
          .select()
          .single()

        if (dbError) {
          await admin.storage.from('assets').remove([storagePath])
          send('error', { message: `DB insert failed: ${dbError.message}` })
          controller.close()
          return
        }

        // ── Done ─────────────────────────────────────────────────────────

        send('complete', {
          docId: doc.id,
          school: ctx.school.name,
          coach: targetCoach.name,
          questionCount: prepData.part_4_questions.categories.reduce(
            (sum, cat) => sum + cat.questions.length, 0
          ),
          toolCalls: toolCallCount,
          usage: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
          },
        })

        controller.close()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error('[prep-for-call/generate] Error:', err)
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
