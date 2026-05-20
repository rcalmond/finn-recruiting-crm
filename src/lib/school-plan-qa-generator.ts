/**
 * school-plan-qa-generator.ts
 *
 * Answers strategic questions about a specific school using Opus 4.7.
 * Finn types a question like "Should I push for a call or wait?" and
 * gets a concise, honest strategic answer drawing on full conversation
 * history and context.
 *
 * Results are persisted in school_plan_questions for history.
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
  admit_likelihood: string | null
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

export interface QAInput {
  school: SchoolContext
  coaches: CoachContext[]
  contactHistory: ContactRow[]
  coveredMessages: CoverageEntry[]
  uncoveredMessages: Message[]
  upcomingCamps: CampContext[]
  declineHistory: ContactRow[]
  finnNotes: string | null
  question: string
}

export interface QAOutput {
  answer: string
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

export async function answerSchoolStrategyQuestion(
  input: QAInput
): Promise<QAOutput> {
  const currentDate = formatCurrentDate()
  const client = new Anthropic()

  const systemPrompt = `You are Finn Almond's recruiting strategist. Finn is a 2027 left wingback at Albion SC Boulder County MLS NEXT Academy U19. He's asking a strategic question about ONE specific school. Answer it directly and concretely, drawing on the full conversation history and context provided.

Today is ${currentDate}.

Be honest and specific. If the answer is "this school is going cold and probably isn't worth more effort," say so. If Finn should wait before pushing for a call, explain why. Don't hedge into uselessness. Keep the answer concise, a few sentences to a short paragraph. This is strategic advice, not an essay.

Ground your answer in the actual data: what emails have been exchanged, how the coach has responded, what the timeline looks like, what inventory items remain uncovered. Don't speculate beyond what the context supports.`

  const usr: string[] = []

  usr.push(`SCHOOL: ${input.school.name}`)
  usr.push(`Tier ${input.school.category}, ${input.school.division}${input.school.conference ? `, ${input.school.conference}` : ''}`)
  usr.push(`Status: ${input.school.status}`)
  usr.push(`Location: ${input.school.location ?? 'unknown'}`)
  if (input.school.admit_likelihood) usr.push(`Admit likelihood: ${input.school.admit_likelihood}`)
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

  usr.push(`UPCOMING CAMPS:`)
  if (input.upcomingCamps.length > 0) {
    for (const c of input.upcomingCamps) {
      usr.push(`- ${c.name} | ${c.start_date} – ${c.end_date} | Status: ${c.status}`)
    }
  } else {
    usr.push(`- None`)
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

  if (input.finnNotes) {
    usr.push(`FINN'S STRATEGIC NOTES:`)
    usr.push(input.finnNotes)
    usr.push('')
  }

  if (input.coveredMessages.length > 0) {
    usr.push(`MESSAGES ALREADY COMMUNICATED:`)
    for (const c of input.coveredMessages) {
      usr.push(`- ${c.message.title} (${c.message.type}) — sent ${new Date(c.detected_at).toLocaleDateString()}`)
    }
    usr.push('')
  }

  if (input.uncoveredMessages.length > 0) {
    usr.push(`UNCOVERED INVENTORY (not yet communicated):`)
    for (const msg of input.uncoveredMessages) {
      usr.push(`- ${msg.title} (${msg.type})${msg.notes ? `: ${msg.notes.slice(0, 150)}` : ''}`)
    }
    usr.push('')
  }

  if (input.contactHistory.length > 0) {
    usr.push(`CONVERSATION HISTORY (${input.contactHistory.length} entries, chronological):`)
    for (const row of input.contactHistory) {
      usr.push(`[${row.date}] ${row.direction} — ${row.channel}${row.coach_name ? ` — ${row.coach_name}` : ''}`)
      usr.push(row.summary ?? '(no body)')
      usr.push('')
    }
  } else {
    usr.push(`CONVERSATION HISTORY: None.`)
    usr.push('')
  }

  usr.push(`FINN'S QUESTION:`)
  usr.push(input.question)

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: 'user', content: usr.join('\n') }],
    })

    const answer = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()

    return {
      answer,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }
  } catch (error) {
    console.error('[school-plan-qa] Anthropic API error:', error instanceof Error ? error.message : error)
    return { answer: '', inputTokens: 0, outputTokens: 0 }
  }
}
