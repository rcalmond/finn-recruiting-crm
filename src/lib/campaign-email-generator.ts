/**
 * campaign-email-generator.ts
 *
 * Generates personalized per-school campaign email bodies using Claude Sonnet.
 * Takes campaign messages + school conversation history + strategic context
 * and produces a natural, conversational email body.
 */

import Anthropic from '@anthropic-ai/sdk'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ContactHistoryRow {
  date: string
  direction: 'Inbound' | 'Outbound'
  channel: string
  coach_name: string | null
  summary: string | null
}

interface CampInfo {
  name: string
  start_date: string
  end_date: string
}

export interface GenerateInput {
  messageSet: string | null
  schoolName: string
  coachName: string | null
  coachRole: string | null
  schoolCategory: string | null
  schoolStatus: string | null
  schoolDivision: string | null
  schoolConference: string | null
  schoolLocation: string | null
  schoolNotes: string | null
  contactHistory: ContactHistoryRow[]
  camps: CampInfo[]
  currentReelUrl: string | null
  regenerationHint?: string | null
}

export interface GenerateOutput {
  body: string
  inputTokens: number
  outputTokens: number
}

// ─── Generator ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are drafting a personalized recruiting email from Finn Almond, a 2027 left wingback playing for Albion SC Boulder County MLS NEXT Academy, to a college soccer coach. Your goal is to draft an email that synthesizes the campaign messages while respecting what's already been discussed with this coach. Don't repeat questions that have been answered. Reference specific prior exchanges when relevant. Match the tone of past conversations.

Tone: professional but warm. Specific over generic. Avoid recruiting-spam phrasing. Length: 100-180 words for fresh conversations, 60-120 words for established relationships.

Output: write the email body only. Start with a natural greeting like 'Coach {LastName},'. Do not include a subject line. Sign as Finn (just 'Finn' on its own line at the end, no signature block — that's handled separately by the email client).`

export async function generateCampaignEmailBody(
  input: GenerateInput
): Promise<GenerateOutput> {
  const client = new Anthropic()

  // Build contact history section
  let historySection: string
  if (input.contactHistory.length === 0) {
    historySection = 'PRIOR CONVERSATION:\nNone. This is a first-touch email.'
  } else {
    const rows = input.contactHistory.map(row => {
      const body = row.summary
        ? row.summary.slice(0, 400) + (row.summary.length > 400 ? '…' : '')
        : '(no body)'
      return `[${row.date}] ${row.direction} — ${row.channel}${row.coach_name ? ` — ${row.coach_name}` : ''}\n${body}`
    })
    historySection = `PRIOR CONVERSATION (chronological, oldest first):\n${rows.join('\n\n')}`
  }

  // Build campaign messages section
  const messageSection = input.messageSet?.trim()
    ? `CAMPAIGN MESSAGES (Finn wants to communicate this round):\n${input.messageSet}`
    : 'CAMPAIGN MESSAGES:\nGeneric spring follow-up.'

  // Build camps section
  const campsSection = input.camps.length > 0
    ? input.camps.map(c => `${c.name} (${c.start_date} – ${c.end_date})`).join(', ')
    : 'none'

  // Days since last inbound
  const lastInbound = input.contactHistory
    .filter(r => r.direction === 'Inbound')
    .pop()
  const daysSinceInbound = lastInbound
    ? `${Math.round((Date.now() - new Date(lastInbound.date).getTime()) / (1000 * 60 * 60 * 24))}d ago`
    : 'no prior contact'

  const coachLabel = input.coachName
    ? `${input.coachName}${input.coachRole ? ` (${input.coachRole})` : ''}`
    : 'Coach (unknown name)'

  const userMessage = `CONTEXT ABOUT FINN:
- Position: Left wingback
- Class: 2027
- Club: Albion SC Boulder County MLS NEXT Academy U19
- Recent reel: ${input.currentReelUrl ?? 'not yet available'}

SCHOOL: ${input.schoolName}
COACH: ${coachLabel}

STRATEGIC CONTEXT:
- Tier: ${input.schoolCategory ?? 'unknown'}
- Pipeline status: ${input.schoolStatus ?? 'unknown'}
- Division: ${input.schoolDivision ?? 'unknown'} — ${input.schoolConference ?? 'unknown'}
- Location: ${input.schoolLocation ?? 'unknown'}
- Targeted camps at this school: ${campsSection}
- Last inbound from this school: ${daysSinceInbound}
${input.schoolNotes ? `- Notes: ${input.schoolNotes.slice(0, 300)}` : ''}

${historySection}

---
${messageSection}

---${input.regenerationHint ? `
REGENERATION GUIDANCE: ${input.regenerationHint}
The previous draft was discarded. Generate a new version respecting this guidance while still honoring the campaign messages, conversation history, and strategic context.

---` : ''}
Write the email body.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const body = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')

  return {
    body,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }
}
