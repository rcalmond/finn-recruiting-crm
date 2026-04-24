/**
 * classify-inbound.ts
 *
 * Haiku-powered two-axis classifier for inbound contact_log emails.
 *
 * Axes:
 *   authored_by — who wrote the email
 *   intent      — what action (if any) this email requires
 *
 * Both axes are independent. The combination drives Today filtering:
 *   (coach_personal | coach_via_platform) × requires_reply → "Awaiting your reply"
 *   All other combinations are excluded from the reply queue.
 *
 * Usage:
 *   import { classifyInbound, classifyAndUpdate } from '@/lib/classify-inbound'
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AuthoredBy =
  | 'coach_personal'
  | 'coach_via_platform'
  | 'team_automated'
  | 'staff_non_coach'
  | 'unknown'

export type Intent =
  | 'requires_reply'
  | 'requires_action'
  | 'informational'
  | 'acknowledgement'
  | 'decline'
  | 'unknown'

export interface ClassificationInput {
  summary: string | null         // email body (contact_log.summary)
  coach_name: string | null      // sender display name (contact_log.coach_name)
  school_name?: string | null    // school name for context (optional)
  raw_source?: string | null     // raw email text for header extraction (optional)
  channel?: string | null        // 'Email' | 'Sports Recruits' | etc.
}

export interface Classification {
  authored_by: AuthoredBy
  intent: Intent
  confidence: 'high' | 'medium' | 'low'
  notes: string                  // ≤200 chars, Haiku's reasoning
}

// ── Constants ────────────────────────────────────────────────────────────────

const AUTHORED_BY_VALUES: AuthoredBy[] = [
  'coach_personal', 'coach_via_platform', 'team_automated', 'staff_non_coach', 'unknown',
]
const INTENT_VALUES: Intent[] = [
  'requires_reply', 'requires_action', 'informational', 'acknowledgement', 'decline', 'unknown',
]
const CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const

const SYSTEM_PROMPT = `You are an email classifier for a college soccer recruiting app. You classify inbound emails on two axes:

AXIS 1 — authored_by (who wrote this email):
  coach_personal     — A coach wrote this personally for the specific recruit (uses their name, references prior contact, specific details about the school/program)
  coach_via_platform — A coach clicked reply or send in a recruiting platform (Sports Recruits, FieldLevel, etc.) — might be brief but still somewhat personal
  team_automated     — No human wrote it: blast emails, auto-replies, questionnaire bots, camp marketing, generic form letters
  staff_non_coach    — Administrative staff, athletic coordinator, registrar, ops — not a coach
  unknown            — Genuinely can't tell

AXIS 2 — intent (what action this email requires from the recruit):
  requires_reply     — Question, explicit ask, active conversation — the recruit should write back
  requires_action    — Needs a non-reply action: RSVP to camp, fill out a form, submit a questionnaire, register for something
  informational      — FYI only: schedule update, tracking communication, general recruiting update, no ask
  acknowledgement    — "Got your message, thanks" with no question or ask — no response needed
  decline            — Program is full, not recruiting this position, not a fit — no response needed
  unknown            — Genuinely can't tell

CONFIDENCE calibration (strict):
  high   — Both axes are unambiguous. A clear direct question in plain English, a clear team-inbox sender, a clear program-full decline. No reasonable human would disagree.
  medium — One axis is ambiguous OR the email contains contradictory signals (e.g., personalized opener + boilerplate body, or both an action ask AND a reply ask). If you find yourself saying "probably X", it is medium.
  low    — Genuinely unsure. You need more context than the email provides. Human should review.

EXAMPLES:

Example 1:
  From: Gabriel Robinson (grobinson@lafayette.edu)
  Body: "Finn, Thank you for the email reaching out and touching base with us. Please keep us updated on your schedule moving forward..."
  → {"authored_by":"coach_personal","intent":"requires_reply","confidence":"high","notes":"Addresses Finn by name, explicit ask to share schedule"}

Example 2:
  From: Brandon Bowman via Sports Recruits (notify@sportsrecruits.com)
  Body: "Thank you Finn."
  → {"authored_by":"coach_via_platform","intent":"acknowledgement","confidence":"high","notes":"Generic two-word platform acknowledgement, no ask"}

Example 3:
  From: Brandon Bautista (bbautista@calpoly.edu)
  Body: "Hi Finn, Thanks for reaching out! We will be hosting an ID camp on May 9-10 & August 1-2..."
  → {"authored_by":"coach_personal","intent":"requires_action","confidence":"high","notes":"Camp invitation with specific dates — needs RSVP, not a reply"}

Example 4:
  From: mensoccer@somewhere.edu
  Body: "Join our 2027 recruiting class! [generic marketing copy]"
  → {"authored_by":"team_automated","intent":"informational","confidence":"high","notes":"Team inbox, no personal addressing, mass recruiting blast"}

Example 5:
  Body: "Thanks for your interest. We have filled our 2027 class and won't be able to recruit you at this time."
  → {"authored_by":"coach_personal","intent":"decline","confidence":"high","notes":"Explicit decline — program full for 2027"}

Example 6:
  Body: "Finn, please fill out our recruiting questionnaire at <link> so we can evaluate you."
  → {"authored_by":"coach_personal","intent":"requires_action","confidence":"medium","notes":"Action requested (fill form), not a reply; medium confidence because sender wasn't clearly coach vs. staff"}

Example 7 — recruiting-template email with multiple asks:
  Body: "Finn, thank you for reaching out. Please keep us updated on your schedule moving forward. Please also see the information below for our program, camps, and questionnaire..."
  (email contains links to questionnaire + camp registration, extensive program marketing, and a 'keep us updated' pleasantry)
  → {"authored_by":"coach_via_platform","intent":"requires_action","confidence":"high","notes":"Template-style recruiting email with concrete asks (fill form, attend camp). 'Keep us updated' is conversational framing, not the primary ask."}
  RULE: when an email contains BOTH a pleasantry phrase ("keep us updated", "stay in touch") AND concrete action links (forms, camps, questionnaires), classify as requires_action. Concrete asks take priority over conversational framing.

Respond ONLY with valid JSON matching this exact shape:
{"authored_by":"<value>","intent":"<value>","confidence":"<value>","notes":"<string under 200 chars>"}`

// ── Classifier ────────────────────────────────────────────────────────────────

let _anthropic: Anthropic | null = null
function getClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  return _anthropic
}

/** Extract From: and Subject: from raw email headers if present. */
function extractHeaders(raw: string | null | undefined): { from: string | null; subject: string | null } {
  if (!raw) return { from: null, subject: null }
  const fromMatch  = raw.match(/^From:\s*(.+)$/mi)
  const subjectMatch = raw.match(/^Subject:\s*(.+)$/mi)
  // Also check forwarded message headers
  const fwdFrom = raw.match(/^From:\s*(.+)$/mi)
  return {
    from:    fromMatch?.[1]?.trim() ?? null,
    subject: subjectMatch?.[1]?.trim() ?? null,
  }
}

export async function classifyInbound(input: ClassificationInput): Promise<Classification> {
  const ERROR_FALLBACK: Classification = {
    authored_by: 'unknown',
    intent: 'unknown',
    confidence: 'low',
    notes: 'classifier parse error — marked for human review',
  }

  try {
    const { from: rawFrom, subject: rawSubject } = extractHeaders(input.raw_source)

    const fromLine    = input.coach_name
      ? `From: ${input.coach_name}${rawFrom ? ` <${rawFrom}>` : ''}`
      : rawFrom ? `From: ${rawFrom}` : null
    const subjectLine = rawSubject ? `Subject: ${rawSubject}` : null
    const schoolLine  = input.school_name ? `School: ${input.school_name}` : null
    const channelLine = input.channel ? `Channel: ${input.channel}` : null

    // Truncate body to ~2000 chars to control token cost
    // 2000 chars captures signature blocks (e.g. coach title/role) that appear
    // past 1500 chars and carry authored_by signal.
    const body = (input.summary ?? '').slice(0, 2000)

    const parts = [
      fromLine,
      subjectLine,
      schoolLine,
      channelLine,
      '',
      body,
    ].filter(p => p !== null).join('\n')

    const message = await getClient().messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: parts }],
    })

    const raw = (message.content[0] as { type: string; text: string }).text?.trim() ?? ''
    // Extract JSON from the response (in case there's surrounding text)
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[classify-inbound] No JSON found in response:', raw.slice(0, 200))
      return { ...ERROR_FALLBACK, notes: 'classifier parse error: no JSON in response' }
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>

    const authored_by  = AUTHORED_BY_VALUES.includes(parsed.authored_by as AuthoredBy)
      ? parsed.authored_by as AuthoredBy : 'unknown'
    const intent       = INTENT_VALUES.includes(parsed.intent as Intent)
      ? parsed.intent as Intent : 'unknown'
    const confidence   = CONFIDENCE_VALUES.includes(parsed.confidence as 'high' | 'medium' | 'low')
      ? parsed.confidence as 'high' | 'medium' | 'low' : 'low'
    const notes        = String(parsed.notes ?? '').slice(0, 200)

    return { authored_by, intent, confidence, notes }
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 100) : 'unknown error'
    console.error('[classify-inbound] Error:', err)
    return { ...ERROR_FALLBACK, notes: `classifier error: ${msg}` }
  }
}

// ── DB helper ─────────────────────────────────────────────────────────────────

/**
 * Classifies a contact_log row and writes results back to the DB.
 * Fire-and-forget safe — catches and logs errors, never throws.
 */
export async function classifyAndUpdate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  rowId: string,
  input: ClassificationInput,
): Promise<void> {
  try {
    const result = await classifyInbound(input)
    const { error } = await admin
      .from('contact_log')
      .update({
        authored_by:               result.authored_by,
        intent:                    result.intent,
        classification_confidence: result.confidence,
        classification_notes:      result.notes,
        classified_at:             new Date().toISOString(),
      })
      .eq('id', rowId)
    if (error) console.error(`[classify-inbound] DB update failed for ${rowId}:`, error.message)
  } catch (err) {
    console.error(`[classify-inbound] classifyAndUpdate failed for ${rowId}:`, err)
  }
}
