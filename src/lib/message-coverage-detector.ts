/**
 * message-coverage-detector.ts
 *
 * Analyzes a sent outbound email to detect which predefined inventory
 * messages were substantively communicated. Uses Sonnet 4.6 for
 * cost-effective classification at ~$0.01/call.
 *
 * Fires as fire-and-forget on outbound contact_log ingest (gmail-sync,
 * sendgrid-inbound CC handler). Never blocks the calling pipeline.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Message } from '@/lib/types'

// ─── Types ──────────────────────────────────────────────────────────────────

interface SchoolBasics {
  id: string
  name: string
  short_name: string | null
}

export interface DetectInput {
  sentBody: string
  school: SchoolBasics
  activeMessages: Message[]
}

export interface DetectOutput {
  matchedMessageIds: string[]
  reasoning: string
  inputTokens: number
  outputTokens: number
}

// ─── Prompt ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You analyze sent recruiting emails to detect which predefined inventory messages were substantively communicated. Return JSON with matched message IDs.

Strict matching criteria:
- "Substantively communicated" means the email contains the actual content or asks the actual question — not a passing mention or tangential reference.
- For UPDATES: the specific update was shared with enough detail that the coach now knows it. Example: "Finn scored an Olimpico at MLS NEXT Cup Qualifier" covers a goal-of-the-season update. "Finn had a good season" does not cover detailed end-of-season stats.
- For QUESTIONS: the email asks the specific question or one that would elicit the same answer. Example: "Where can I meet you at Utah?" covers "Will you be at MLS NEXT Cup in Utah?". "Hope to see you soon" does not.
- Better to under-detect than over-detect. Only flag matches you're confident about.

Output format: JSON only, no markdown fence.
{"matched_message_ids": ["uuid1", "uuid2"], "reasoning": "brief one-sentence explanation"}`

// ─── Detector ───────────────────────────────────────────────────────────────

export async function detectMessageCoverage(
  input: DetectInput
): Promise<DetectOutput> {
  if (input.activeMessages.length === 0) {
    return { matchedMessageIds: [], reasoning: 'No active messages in inventory', inputTokens: 0, outputTokens: 0 }
  }

  const client = new Anthropic()

  const inventorySection = input.activeMessages.map(msg =>
    `ID: ${msg.id}\nType: ${msg.type}\nTitle: ${msg.title}${msg.notes ? `\nNotes: ${msg.notes}` : ''}`
  ).join('\n---\n')

  const userMessage = `SENT EMAIL TO ${input.school.name}:

${input.sentBody}

---

ACTIVE MESSAGE INVENTORY:
${inventorySection}

---
Return JSON with matched_message_ids and reasoning.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const raw = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim()

  // Strip markdown fences
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  // Parse response
  const validIds = new Set(input.activeMessages.map(m => m.id))
  try {
    const parsed = JSON.parse(cleaned) as { matched_message_ids?: string[]; reasoning?: string }
    const matchedIds = (parsed.matched_message_ids ?? []).filter(
      id => typeof id === 'string' && validIds.has(id)
    )
    return {
      matchedMessageIds: matchedIds,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }
  } catch {
    console.error('[message-coverage] Failed to parse detector response:', raw.slice(0, 200))
    return { matchedMessageIds: [], reasoning: 'parse error', inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
  }
}

// ─── Helpers for ingest hooks ───────────────────────────────────────────────

/**
 * Fetch all active (non-archived, non-expired) messages from the DB.
 */
export async function fetchActiveMessages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>
): Promise<Message[]> {
  const { data } = await admin
    .from('messages')
    .select('*')
    .eq('status', 'active')
  return (data ?? []) as Message[]
}

/**
 * Fire-and-forget: detect message coverage for a newly inserted outbound row
 * and upsert matches into school_message_log.
 *
 * Call this after inserting an outbound contact_log row. Safe to call
 * with any row — skips if direction is not Outbound, school_id is null,
 * or body is too short.
 */
export async function detectAndLogCoverage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  row: {
    id: string
    school_id: string | null
    summary: string | null
    direction: string
  },
  schoolName: string | null,
  schoolShortName: string | null
): Promise<void> {
  try {
    if (row.direction !== 'Outbound') return
    if (!row.school_id) return
    if (!row.summary || row.summary.length < 50) return

    const activeMessages = await fetchActiveMessages(admin)
    if (activeMessages.length === 0) return

    const detected = await detectMessageCoverage({
      sentBody: row.summary,
      school: { id: row.school_id, name: schoolName ?? 'Unknown', short_name: schoolShortName },
      activeMessages,
    })

    if (detected.matchedMessageIds.length === 0) return

    for (const messageId of detected.matchedMessageIds) {
      await admin.from('school_message_log').upsert({
        message_id: messageId,
        school_id: row.school_id,
        contact_log_id: row.id,
        detection_source: 'auto',
        notes: detected.reasoning.substring(0, 500),
      }, { onConflict: 'message_id,school_id,contact_log_id' })
    }
  } catch (err) {
    console.error('[message-coverage] detectAndLogCoverage failed:', err instanceof Error ? err.message : err)
  }
}
