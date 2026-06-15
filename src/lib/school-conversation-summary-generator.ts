/**
 * school-conversation-summary-generator.ts
 *
 * Generates a short Gmail-style conversation summary + recommended next action
 * for a school's conversation state. Cached in school_conversation_summary.
 *
 * Regenerated on every contact_log insert (fire-and-forget from gmail-sync
 * and sendgrid-inbound). Idempotency: skips if last_contact_log_id already
 * matches the most recent contact_log row for the school.
 *
 * Model: Opus 4.7. Max output: 600 tokens.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Message, RecommendedAction } from '@/lib/types'
import { fetchSchoolContext } from '@/lib/school-context'

// ─── Types ──────────────────────────────────────────────────────────────────

interface GenerateResult {
  summary: string
  recommended_action: RecommendedAction
  input_tokens: number
  output_tokens: number
}

// ─── JSON parsing (matches call-prep-research.ts pattern) ───────────────────

function extractJson(raw: string): Record<string, unknown> {
  // Strip markdown code fences (non-anchored)
  let text = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()

  try {
    return JSON.parse(text)
  } catch {
    // Balanced-brace extraction with string-boundary tracking
    const start = text.indexOf('{')
    if (start >= 0) {
      let depth = 0
      let end = -1
      let inString = false
      let escaped = false
      for (let i = start; i < text.length; i++) {
        const c = text[i]
        if (escaped) { escaped = false; continue }
        if (c === '\\' && inString) { escaped = true; continue }
        if (c === '"') { inString = !inString; continue }
        if (inString) continue
        if (c === '{') depth++
        else if (c === '}') { depth--; if (depth === 0) { end = i; break } }
      }
      if (end > start) {
        return JSON.parse(text.slice(start, end + 1))
      }
    }
    throw new Error(`JSON extraction failed. First 500 chars: ${text.slice(0, 500)}`)
  }
}

// ─── Prompt builder ─────────────────────────────────────────────────────────

function buildPrompt(
  school: NonNullable<Awaited<ReturnType<typeof fetchSchoolContext>>['school']>,
  coaches: Awaited<ReturnType<typeof fetchSchoolContext>>['coaches'],
  contactLog: Awaited<ReturnType<typeof fetchSchoolContext>>['contactLog'],
  upcomingCamps: Awaited<ReturnType<typeof fetchSchoolContext>>['upcomingCamps'],
  declineHistory: Awaited<ReturnType<typeof fetchSchoolContext>>['declineHistory'],
  strategicNotes: string | null,
  uncoveredMessages: Message[],
  coveredMessages: Message[],
  currentDate: string,
): { system: string; user: string } {

  const system = `You are a conversation analyst for Finn Almond, a 2027 left wingback (Albion SC Boulder County MLS NEXT Academy U19) recruiting to play college soccer.

Your job is to read the full conversation history between Finn and a college coaching staff and produce:
1. A short summary (2-3 sentences max) of the conversation state
2. A recommended next action

SUMMARY STYLE:
- Model after Gmail's thread summaries: short, factual, conversation-focused.
- Describe what the conversation has covered, current open threads, who has the next move.
- Use the coach's last name only ("Streb invited Finn to visit" not "Coach Streb at the University of Rochester invited...").
- Do NOT editorialize ("great conversation", "strong interest", "promising lead"). Describe the state, not vibes.
- If no conversation exists, say so plainly.

RECOMMENDED ACTION:
- One concrete next step Finn should take (or "wait" if the ball is in the coach's court).
- category must be one of: reply, follow_up, check_in, wait, introduce, new_topic
  - reply: there's an unanswered inbound from a coach that needs a response
  - follow_up: continue an existing thread or circle back on something discussed
  - check_in: re-engage after a gap with no specific thread to continue
  - wait: a recent outbound is awaiting coach response — don't pile on
  - introduce: no prior contact — first outreach
  - new_topic: conversation is active but stale topics are exhausted; surface something new from inventory
- source_message_ids: populate ONLY when the recommendation specifically draws from the UNCOVERED INVENTORY MESSAGES list below. Otherwise omit or use empty array.
- rationale: one sentence explaining why this is the next move.
- If Finn's strategic notes mention something specific to do, that takes precedence over your own analysis.

DATE AWARENESS:
Today's date is ${currentDate}. Do not reference past events as if they are still actionable.

OUTPUT FORMAT:
Return a single JSON object with exactly two keys: "summary" and "recommended_action".
Example:
{
  "summary": "Streb invited Finn to Rochester's prospect day on Oct 12. Finn confirmed attendance but hasn't heard back about logistics. Last exchange was 3 days ago.",
  "recommended_action": {
    "description": "Wait for Streb's logistics details before following up",
    "rationale": "Finn's last message confirmed attendance 3 days ago — give the coach time to reply with details.",
    "category": "wait",
    "source_message_ids": []
  }
}

Return ONLY the JSON object. No commentary before or after.`

  const parts: string[] = []

  // School context
  parts.push(`SCHOOL: ${school.name}`)
  parts.push(`Tier: ${school.category} | Division: ${school.division} | Conference: ${school.conference ?? 'N/A'} | Location: ${school.location ?? 'N/A'}`)
  parts.push(`Status: ${school.status}`)
  if (school.admit_likelihood) parts.push(`Admit likelihood: ${school.admit_likelihood}`)
  if (school.notes) parts.push(`School notes: ${school.notes}`)
  parts.push('')

  // Coaches
  if (coaches.length > 0) {
    parts.push('COACHES:')
    for (const c of coaches) {
      const flags = [c.is_primary ? 'primary' : null, c.needs_review ? 'needs_review' : null].filter(Boolean).join(', ')
      parts.push(`- ${c.name} (${c.role ?? 'unknown role'})${flags ? ` [${flags}]` : ''}`)
    }
    parts.push('')
  }

  // Decline history
  if (declineHistory.length > 0) {
    parts.push('DECLINE HISTORY:')
    for (const d of declineHistory) {
      parts.push(`- ${d.date}: ${d.coach_name ?? 'unknown'} — ${(d.summary ?? '').slice(0, 200)}`)
    }
    parts.push('')
  }

  // Upcoming camps
  if (upcomingCamps.length > 0) {
    parts.push('UPCOMING CAMPS AT THIS SCHOOL:')
    for (const c of upcomingCamps) {
      parts.push(`- ${c.name}: ${c.start_date} to ${c.end_date} (${c.status})${c.registration_deadline ? `, deadline: ${c.registration_deadline}` : ''}`)
    }
    parts.push('')
  }

  // Strategic notes
  if (strategicNotes) {
    parts.push(`FINN'S STRATEGIC NOTES (takes precedence):`)
    parts.push(strategicNotes)
    parts.push('')
  }

  // Uncovered inventory messages
  if (uncoveredMessages.length > 0) {
    parts.push('UNCOVERED INVENTORY MESSAGES (not yet communicated to this school):')
    for (const m of uncoveredMessages) {
      parts.push(`- [${m.id}] (${m.type}) ${m.title}${m.notes ? ': ' + m.notes.slice(0, 150) : ''}`)
    }
    parts.push('')
  }

  // Covered inventory messages (for context)
  if (coveredMessages.length > 0) {
    parts.push('ALREADY COVERED MESSAGES (for context — do not re-suggest):')
    for (const m of coveredMessages) {
      parts.push(`- (${m.type}) ${m.title}`)
    }
    parts.push('')
  }

  // Full conversation history
  if (contactLog.length > 0) {
    parts.push('FULL CONVERSATION HISTORY (oldest first):')
    for (const row of contactLog) {
      const who = row.direction === 'Inbound'
        ? `${row.coach_name ?? 'Coach'} → Finn`
        : `Finn → ${row.coach_name ?? 'Coach'}`
      const meta = [row.date, row.channel, row.direction].join(' | ')
      parts.push(`[${meta}] ${who}:`)
      if (row.summary) parts.push(row.summary)
      parts.push('')
    }
  } else {
    parts.push('CONVERSATION HISTORY: None — no contact with this school yet.')
    parts.push('')
  }

  return { system, user: parts.join('\n') }
}

// ─── Generator ──────────────────────────────────────────────────────────────

export async function generateConversationSummary(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  schoolId: string,
): Promise<GenerateResult | null> {
  const currentDate = new Date().toISOString().split('T')[0]

  // Fetch context in parallel
  const [
    ctx,
    { data: activeMessages },
    { data: coverageRows },
  ] = await Promise.all([
    fetchSchoolContext(admin, schoolId, { includeActionItems: true }),
    admin.from('messages').select('*').eq('status', 'active'),
    admin.from('school_message_log')
      .select('message_id')
      .eq('school_id', schoolId),
  ])

  const { school, coaches, contactLog, upcomingCamps, declineHistory, strategicNotes } = ctx
  if (!school) return null

  // Skip non-target tiers
  if (!['A', 'B', 'C'].includes(school.category)) return null

  // Compute uncovered/covered
  const messages = (activeMessages ?? []) as Message[]
  const coveredIds = new Set((coverageRows ?? []).map((c: Record<string, unknown>) => c.message_id as string))
  const uncoveredMessages = messages.filter(m => !coveredIds.has(m.id))
  const coveredMessages = messages.filter(m => coveredIds.has(m.id))

  const { system, user } = buildPrompt(
    school, coaches, contactLog, upcomingCamps, declineHistory,
    strategicNotes, uncoveredMessages, coveredMessages, currentDate,
  )

  const client = new Anthropic()
  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 600,
    system,
    messages: [{ role: 'user', content: user }],
  })

  // Extract text
  let rawText = ''
  for (const block of response.content) {
    if (block.type === 'text') rawText += block.text
  }

  const parsed = extractJson(rawText) as {
    summary?: string
    recommended_action?: RecommendedAction
  }

  if (!parsed.summary || !parsed.recommended_action) {
    console.error('[conv-summary] Missing required fields in response:', JSON.stringify(parsed).slice(0, 500))
    return null
  }

  return {
    summary: parsed.summary,
    recommended_action: parsed.recommended_action,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  }
}

// ─── Generate + store (idempotent, fire-and-forget safe) ────────────────────

export async function generateAndStoreConversationSummary(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  schoolId: string,
): Promise<void> {
  try {
    // Find most recent contact_log id for this school
    const { data: latestRow } = await admin
      .from('contact_log')
      .select('id')
      .eq('school_id', schoolId)
      .not('parse_status', 'in', '("orphan","non_coach")')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const latestContactLogId = latestRow?.id ?? null

    // Idempotency check: skip if summary already reflects the latest contact_log row
    if (latestContactLogId) {
      const { data: existing } = await admin
        .from('school_conversation_summary')
        .select('last_contact_log_id')
        .eq('school_id', schoolId)
        .maybeSingle()

      if (existing?.last_contact_log_id === latestContactLogId) {
        return // Already up to date
      }
    }

    const result = await generateConversationSummary(admin, schoolId)
    if (!result) return

    await admin
      .from('school_conversation_summary')
      .upsert({
        school_id: schoolId,
        summary: result.summary,
        recommended_action: result.recommended_action,
        last_contact_log_id: latestContactLogId,
        generated_at: new Date().toISOString(),
        model_used: 'claude-opus-4-7',
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
      }, { onConflict: 'school_id' })

  } catch (err) {
    console.error(`[conv-summary] generateAndStore failed for school ${schoolId}:`, err)
    // Never throws — fire-and-forget safe
  }
}
