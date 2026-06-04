import { NextRequest } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { fetchSchoolContext } from '@/lib/school-context'
import { runAgenticResearch } from '@/lib/call-prep-research'
import { buildCallPrepSystemPrompt, buildCallPrepUserPrompt } from '@/lib/call-prep-prompt'
import { generateCallPrepPdf } from '@/lib/call-prep-pdf'

export const maxDuration = 300

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  // Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

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
        const admin = serviceClient()

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
          .select('name, role, email, is_primary, needs_review')
          .eq('id', coachId)
          .single()

        if (!coachData) {
          send('error', { message: 'Coach not found' })
          controller.close()
          return
        }

        const targetCoach = coachData as {
          name: string
          role: string | null
          email: string | null
          is_primary: boolean
          needs_review: boolean
        }

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
          .from('call_prep_docs')
          .select('id, coach_name_snapshot, generated_at')
          .eq('school_id', schoolId)
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

        const systemPrompt = buildCallPrepSystemPrompt()
        const userPrompt = buildCallPrepUserPrompt({
          school: ctx.school,
          targetCoach,
          coaches: ctx.coaches,
          contactHistory: ctx.contactLog,
          camps: ctx.upcomingCamps,
          declineHistory: ctx.declineHistory,
          strategicNotes: ctx.strategicNotes,
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

        // ── Step 5: Upload PDF + insert call_prep_docs row ──────────────

        send('progress', { stage: 'upload', message: 'Saving prep document...' })

        const docId = crypto.randomUUID()
        const storagePath = `call-prep/${schoolId}/${docId}.pdf`

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
          .from('call_prep_docs')
          .insert({
            id: docId,
            school_id: schoolId,
            coach_id: coachId,
            coach_name_snapshot: targetCoach.name,
            framing_notes: framingNotes?.trim() || null,
            docx_storage_path: storagePath,
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
