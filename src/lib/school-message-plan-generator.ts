/**
 * school-message-plan-generator.ts
 *
 * Generates per-school message plan suggestions using Opus 4.7.
 * Analyzes conversation history, covered/uncovered messages, camps,
 * decline history, and Finn's strategic notes to recommend the next
 * 2-3 messages to communicate.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { Message } from '@/lib/types'

// ─── Types ──────────────────────────────────────────────────────────────────

interface SchoolContext {
  name: string
  category: string
  division: string
  conference: string | null
  location: string | null
  status: string
  notes: string | null
}

interface CoachContext {
  name: string
  role: string | null
  is_primary: boolean
  needs_review: boolean
}

interface CampContext {
  name: string
  start_date: string
  end_date: string
  status: string
}

interface ContactRow {
  date: string
  direction: string
  channel: string
  coach_name: string | null
  summary: string | null
}

interface CoverageEntry {
  message: Message
  detected_at: string
}

export interface GenerateInput {
  school: SchoolContext
  coaches: CoachContext[]
  contactHistory: ContactRow[]
  uncoveredMessages: Message[]
  coveredMessages: CoverageEntry[]
  upcomingCamps: CampContext[]
  declineHistory: ContactRow[]
  finnNotes: string | null
}

export interface SuggestionItem {
  message_id: string
  reasoning: string
  timing: 'send_now' | 'after_event' | 'wait'
}

export interface GenerateOutput {
  items: SuggestionItem[]
  inputTokens: number
  outputTokens: number
}

// ─── Generator ──────────────────────────────────────────────────────────────

function formatCurrentDate(): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Denver',
  }).format(new Date())
}

const VALID_TIMINGS = new Set(['send_now', 'after_event', 'wait'])

export async function generateSchoolMessagePlan(
  input: GenerateInput
): Promise<GenerateOutput> {
  if (input.uncoveredMessages.length === 0) {
    return { items: [], inputTokens: 0, outputTokens: 0 }
  }

  const currentDate = formatCurrentDate()
  const client = new Anthropic()

  const systemPrompt = `You are Finn Almond's recruiting strategist. Finn is a 2027 left wingback at Albion SC Boulder County MLS NEXT Academy U19. Your job is to suggest the next 2-3 messages Finn should communicate to a specific college coach, drawing from his inventory of things to say and ask.

Today is ${currentDate}.

Your suggestions should be strategically sequenced: consider what the coach already knows, what would be most relevant to the current state of the relationship, and what timing makes sense.

TIMING GUIDANCE:
- "send_now" — communicate this in the next email
- "after_event" — wait for a specific upcoming event (MLS NEXT Cup, ID camp, etc.) before sending
- "wait" — hold until the relationship develops further or other context emerges

STRATEGIC CONSIDERATIONS:
- Don't suggest messages already covered (those are listed separately for context, not as candidates)
- Consider conversation flow — if Finn last asked the coach a question, suggesting more questions before a response is premature
- Match the relationship state — fresh schools get introductory content, established relationships get deeper engagement
- Respect Finn's notes — if he has strategic notes for this school, defer to them

RULE: Do not suggest topics that reference past dates or completed events as if they are future. Only forward-looking content.

Output: JSON only, no markdown fence.
{"items": [{"message_id": "uuid-from-uncovered-list", "reasoning": "1-2 sentences explaining why this fits", "timing": "send_now"}]}

Return 2-3 items, ordered by priority (most important first). Use ONLY message_ids from the UNCOVERED MESSAGES list — never invent IDs or suggest covered ones.`

  // Build user message
  const usr: string[] = []

  usr.push(`SCHOOL: ${input.school.name}`)
  usr.push(`Tier ${input.school.category}, ${input.school.division}${input.school.conference ? `, ${input.school.conference}` : ''}`)
  usr.push(`Status: ${input.school.status}`)
  usr.push(`Location: ${input.school.location ?? 'unknown'}`)
  if (input.school.notes) usr.push(`Notes: ${input.school.notes}`)
  usr.push('')

  usr.push(`COACHES:`)
  for (const c of input.coaches) {
    const parts = [`${c.name} (${c.role ?? 'unknown role'})`]
    if (c.is_primary) parts.push('— PRIMARY')
    if (c.needs_review) parts.push('— may have departed')
    usr.push(`- ${parts.join(' ')}`)
  }
  usr.push('')

  usr.push(`UPCOMING CAMPS AT THIS SCHOOL:`)
  if (input.upcomingCamps.length > 0) {
    for (const c of input.upcomingCamps) {
      usr.push(`- ${c.name} | ${c.start_date} – ${c.end_date} | Status: ${c.status}`)
    }
  } else {
    usr.push(`- None scheduled`)
  }
  usr.push('')

  usr.push(`DECLINE HISTORY:`)
  if (input.declineHistory.length > 0) {
    for (const d of input.declineHistory) {
      usr.push(`- Declined on ${d.date}${d.coach_name ? ` by ${d.coach_name}` : ''}: ${(d.summary ?? '').slice(0, 300)}`)
    }
    usr.push(`- Note: Finn transitioned from striker to left wingback in November 2025.`)
  } else {
    usr.push(`- None`)
  }
  usr.push('')

  usr.push(`FINN'S STRATEGIC NOTES FOR THIS SCHOOL:`)
  usr.push(input.finnNotes || 'No notes set')
  usr.push('')

  if (input.coveredMessages.length > 0) {
    usr.push(`ALREADY COVERED (for context — do not suggest these):`)
    for (const c of input.coveredMessages) {
      usr.push(`- ${c.message.title} — covered ${new Date(c.detected_at).toLocaleDateString()}`)
    }
    usr.push('')
  }

  usr.push(`UNCOVERED INVENTORY (your candidates):`)
  for (const msg of input.uncoveredMessages) {
    usr.push(`ID: ${msg.id}`)
    usr.push(`Type: ${msg.type}`)
    usr.push(`Title: ${msg.title}`)
    if (msg.notes) usr.push(`Notes: ${msg.notes}`)
    usr.push(`---`)
  }
  usr.push('')

  if (input.contactHistory.length > 0) {
    usr.push(`CONVERSATION HISTORY (${input.contactHistory.length} entries, chronological):`)
    for (const row of input.contactHistory) {
      usr.push(`[${row.date}] ${row.direction} — ${row.channel}${row.coach_name ? ` — ${row.coach_name}` : ''}`)
      usr.push(row.summary ?? '(no body)')
      usr.push('')
    }
  } else {
    usr.push(`CONVERSATION HISTORY: None — no contact yet.`)
    usr.push('')
  }

  usr.push(`Suggest 2-3 next messages with reasoning and timing.`)

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: 'user', content: usr.join('\n') }],
  })

  const raw = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  const validIds = new Set(input.uncoveredMessages.map(m => m.id))

  try {
    const parsed = JSON.parse(raw) as { items?: Array<{ message_id?: string; reasoning?: string; timing?: string }> }
    const items: SuggestionItem[] = (parsed.items ?? [])
      .filter(item => typeof item.message_id === 'string' && validIds.has(item.message_id))
      .map(item => ({
        message_id: item.message_id!,
        reasoning: typeof item.reasoning === 'string' ? item.reasoning : '',
        timing: VALID_TIMINGS.has(item.timing ?? '') ? item.timing as SuggestionItem['timing'] : 'send_now',
      }))

    return { items, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
  } catch {
    console.error('[school-message-plan] Failed to parse response:', raw.slice(0, 200))
    return { items: [], inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
  }
}
