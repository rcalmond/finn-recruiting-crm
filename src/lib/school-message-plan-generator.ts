/**
 * school-message-plan-generator.ts
 *
 * Generates per-school message plan suggestions using Opus 4.7.
 * Analyzes conversation history, covered/uncovered messages, camps,
 * decline history, and Finn's strategic notes to recommend a prioritized
 * list of messages to communicate.
 *
 * Returns 3-6 PRIMARY items (main suggestion list) and up to 4 EXTRA
 * items (lower-priority, surfaced via "show me more" in the UI).
 */

import Anthropic from '@anthropic-ai/sdk'
import {
  buildDraftingPersona, personaIdentityLine, type PersonaSource,
} from './drafting-persona'

/** Position-change context is the family's own biography, never a generic fact. */
function derivePositionChangeNote(p: { highlights?: string | null; current_stats?: string | null } | null | undefined): string | null {
  const text = `${p?.highlights ?? ''} ${p?.current_stats ?? ''}`
  if (!/\b(transition(ed)?|moved|switch(ed)?|converted)\b/i.test(text)) return null
  if (!/\b(position|strik|wing|back|mid|keeper|defender|forward)\b/i.test(text)) return null
  return "the player's profile records a position change; any decline predating it was based on a different position"
}
import type { Message } from '@/lib/types'
import { RECRUITING_JUDGMENT } from '@/lib/recruiting-judgment'

// ─── Types ──────────────────────────────────────────────────────────────────

interface SchoolContext {
  name: string
  category: string
  division: string
  conference: string | null
  location: string | null
  status: string
}

interface CoachContext {
  name: string
  role: string | null
  /** COMPOSED view field — see coach-primary.ts. Never a DB column. */
  isPrimary: boolean
  /** COMPOSED — hidden by this family. Present so a generator KNOWS the person
   *  exists, and marked so it never proposes contacting them. */
  hidden: boolean
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
  /** The family's player row — identity for the strategist framing. */
  player?: PersonaSource | null
  statusUpdates?: Array<{ body: string; share_with_coach: string; created_at: string }>
}

export type SuggestionTier = 'primary' | 'extra'

export interface SuggestionItem {
  message_id: string
  reasoning: string
  timing: 'send_now' | 'after_event' | 'wait'
  priority: number
  tier: SuggestionTier
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
const VALID_TIERS = new Set(['primary', 'extra'])

export async function generateSchoolMessagePlan(
  input: GenerateInput
): Promise<GenerateOutput> {
  // Identity + biography come from the family's players row, supplied by the
  // caller (which holds the family-scoped client).
  const strategistPlayer = input.player ?? null
  const persona = buildDraftingPersona(strategistPlayer)
  const FIRST = persona.firstName || 'the player'
  const positionChangeNote = derivePositionChangeNote(strategistPlayer)

  if (input.uncoveredMessages.length === 0) {
    return { items: [], inputTokens: 0, outputTokens: 0 }
  }

  const currentDate = formatCurrentDate()
  const client = new Anthropic()

  const systemPrompt = `You are the recruiting strategist for ${personaIdentityLine(persona)}. Your job is to recommend a prioritized list of messages ${FIRST} should communicate to a specific college coach, drawing from their inventory of things to say and ask.

Today is ${currentDate}.

Return a prioritized list in TWO tiers:

PRIMARY (3-6 items): the strategically most important things to communicate next. These are the main suggestion list the family sees. Order by priority (1 = highest). Priority should reflect a strategic read of the full conversation arc: what's been said, what's uncovered, what the relationship state calls for, what timing makes sense.

EXTRA (up to 4 items): additional valid but lower-priority suggestions. These appear when the family clicks "show me more." Continue the priority numbering from where PRIMARY left off.

TIMING GUIDANCE:
- "send_now" — communicate this in the next email
- "after_event" — wait for a specific upcoming event (MLS NEXT Cup, ID camp, etc.) before sending
- "wait" — hold until the relationship develops further or other context emerges

STRATEGIC CONSIDERATIONS:
- Don't suggest messages already covered (those are listed separately for context, not as candidates)
- Consider conversation flow — if the last outbound asked the coach a question, suggesting more questions before a response is premature
- Match the relationship state — fresh schools get introductory content, established relationships get deeper engagement
- Respect the family's notes — if there are strategic notes for this school, defer to them
- Priority should reflect strategic thinking, not arbitrary ordering. The #1 item should be the single most impactful thing ${FIRST} can say next to this specific coach given everything that's happened.

RULE: Do not suggest topics that reference past dates or completed events as if they are future. Only forward-looking content.

Output: JSON only, no markdown fence.
{"items": [{"message_id": "uuid-from-uncovered-list", "reasoning": "1-2 sentences", "timing": "send_now", "priority": 1, "tier": "primary"}]}

Use ONLY message_ids from the UNCOVERED MESSAGES list — never invent IDs or suggest covered ones. If fewer than 3 uncovered messages exist, return what you have (don't pad).

${RECRUITING_JUDGMENT}`

  // Build user message
  const usr: string[] = []

  usr.push(`SCHOOL: ${input.school.name}`)
  usr.push(`Tier ${input.school.category}, ${input.school.division}${input.school.conference ? `, ${input.school.conference}` : ''}`)
  usr.push(`Status: ${input.school.status}`)
  usr.push(`Location: ${input.school.location ?? 'unknown'}`)
  usr.push('')

  usr.push(`COACHES:`)
  for (const c of input.coaches) {
    const parts = [`${c.name} (${c.role ?? 'unknown role'})`]
    if (c.isPrimary) parts.push('— PRIMARY')
    if (c.hidden) parts.push('— HIDDEN by the family: on the roster, but do NOT propose contacting them')
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
    // Biography, only if the family's own profile records it.
    if (positionChangeNote) usr.push(`- Note: ${positionChangeNote}`)
  } else {
    usr.push(`- None`)
  }
  usr.push('')

  usr.push(`FINN'S STRATEGIC NOTES FOR THIS SCHOOL:`)
  usr.push(input.finnNotes || 'No notes set')
  usr.push('')

  if (input.statusUpdates && input.statusUpdates.length > 0) {
    usr.push(`STATUS UPDATES FROM FINN:`)
    usr.push(`These describe the player's current state and intentions — weight them heavily when prioritizing suggestions.`)
    for (const u of input.statusUpdates) {
      usr.push(`[${u.created_at.split('T')[0]}, share: ${u.share_with_coach}] ${u.body}`)
    }
    usr.push('')
  }

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

  usr.push(`Return a prioritized list: 3-6 PRIMARY items (most important), then up to 4 EXTRA items (lower-priority). Use the priority and tier fields.`)

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 2000,
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
      const parsed = JSON.parse(raw) as {
        items?: Array<{
          message_id?: string
          reasoning?: string
          timing?: string
          priority?: number
          tier?: string
        }>
      }
      const items: SuggestionItem[] = (parsed.items ?? [])
        .filter(item =>
          typeof item.message_id === 'string' &&
          validIds.has(item.message_id) &&
          typeof item.priority === 'number' &&
          item.priority > 0
        )
        .map((item, idx) => ({
          message_id: item.message_id!,
          reasoning: typeof item.reasoning === 'string' ? item.reasoning : '',
          timing: VALID_TIMINGS.has(item.timing ?? '') ? item.timing as SuggestionItem['timing'] : 'send_now',
          priority: item.priority!,
          tier: VALID_TIERS.has(item.tier ?? '') ? item.tier as SuggestionTier : (idx < 6 ? 'primary' : 'extra'),
        }))
        .sort((a, b) => a.priority - b.priority)

      return { items, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
    } catch {
      console.error('[school-message-plan] Failed to parse response:', raw.slice(0, 200))
      return { items: [], inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
    }
  } catch (error) {
    console.error('[school-message-plan] Anthropic API error:', error instanceof Error ? error.message : error)
    return { items: [], inputTokens: 0, outputTokens: 0 }
  }
}
