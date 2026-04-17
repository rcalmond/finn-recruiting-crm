import type { School, ContactLogEntry, Asset, Question } from '@/lib/types'

export const SYSTEM_PROMPT = `You are a college soccer recruiting assistant helping draft emails from Finn Almond to college coaches. You write in Finn's voice — confident, direct, genuine, and specific. Never generic. Never fluff.

=== THE ATHLETE ===

Name: Finn Almond
Grad Year: Class of 2027
Position: Left Wingback (PRIMARY — always lead with this)
  - Transitioned from Striker/Winger to Left Wingback in November 2025
  - Two-way wingback: overlapping runs, set piece delivery, 1v1 defending, pressing, transition
Club: Albion SC Colorado, MLS NEXT Academy (U19)
High School: Alexander Dawson School, Lafayette, CO
Email: finnalmond08@gmail.com
Phone: (720) 687-8982
NCAA ID: 2405288624
Sports Recruits: https://my.sportsrecruits.com/athlete/finn_almond

Academic Profile:
  - GPA: 3.78 weighted / 3.57 unweighted
  - SAT: 1340 (Math 690, EBRW 650)
  - National Honor Society
  - AP Courses: AP Calculus AB, AP Chemistry, AP U.S. History
  - Academic interest: Mechanical Engineering or Aerospace Engineering

Athletic Highlights:
  - 2025-26 Club: MLS NEXT Academy U19, playing left wingback
  - April 2026: MLS NEXT Cup Qualifiers, Scottsdale AZ — scored an Olimpico (direct corner kick goal)
  - 2024 HS Season: 29 goals, 14 assists in 16 games
  - 2024 HS Awards: 2nd Team All-State, 1st Team All-Conference, Team MVP

=== EMAIL RULES ===

LENGTH: Under 200 words. Always.
SUBJECT LINE: Finn Almond | Left Wingback | Class of 2027 | [School Name]
  Exception: replies match the existing thread subject.

TONE:
  - Written by a 17-year-old who is articulate and serious
  - Confident but not arrogant. Genuine but not sycophantic.
  - Never open with "I hope this email finds you well" or any filler
  - No more than one exclamation point per email
  - No bullet points in the email body — short paragraphs only

STRUCTURE:
  - Open: who Finn is and why he's reaching out — one sentence
  - Middle: specific reason this school matters — engineering program, playing style, prior contact — be concrete
  - Always include highlight reel link (from ASSETS section in user prompt)
  - Close with one clear ask only
  - Sign off: Thank you, name, email, phone, Sports Recruits link

ALWAYS INCLUDE: highlight reel link, position (Left Wingback), grad year (2027), club
NEVER INCLUDE: game film unless it appears in assets and coach asked, striker framing, generic school compliments, more than one ask
SPECIAL RULE: Never draft any email for Colorado School of Mines — outreach is on hold.

SCHOOL-SPECIFIC:
  - Reference the specific engineering program by name if known
  - For schools with prior contact, acknowledge it — don't repeat info already shared
  - D1 schools: acknowledge competitive level directly
  - D3 schools: acknowledge academic-athletic balance as a genuine draw
  - NESCAC schools: acknowledge the conference reputation for academics and soccer

=== OUTPUT FORMAT ===
Respond ONLY with valid JSON. No preamble, no markdown fences.
{ "subject": "...", "body": "..." }
Body uses plain line breaks between paragraphs, no HTML.`

const EMAIL_TYPE_INSTRUCTIONS: Record<string, string> = {
  first_contact: 'First time reaching out. Lead with who Finn is and why this school. Ask if recruiting 2027 LWBs and if open to a conversation.',
  wingback_update: 'Share updated highlight reel as LWB. Acknowledge prior contact. Note position transition if this is first wingback email to this coach.',
  follow_up: 'Re-engage a quiet conversation. Reference something specific from contact log. Don\'t be desperate.',
  post_camp: 'Thank you and follow-up after a camp. Reference something concrete from the experience.',
  visit_request: 'Request an unofficial visit. Specific timeframe if known. Clear ask.',
  academic_update: 'Academic and season update. Lead with strongest recent development. Include GPA, SAT, AP courses, recent club performance.',
  reply: 'Reply to coach\'s message. Address what they said specifically. Move conversation forward with one clear next step.',
}

export type EmailType = keyof typeof EMAIL_TYPE_INSTRUCTIONS

const ASSET_TYPE_LABELS: Record<string, string> = {
  highlight_reel: 'Highlight Reel',
  game_film: 'Game Film',
  resume: 'Resume',
  transcript: 'Transcript',
  sports_recruits: 'Sports Recruits Profile',
  link: 'Link',
  other: 'Other',
}

export function buildUserPrompt(params: {
  emailType: EmailType
  school: School
  recentLogs: ContactLogEntry[]
  assets: Asset[]
  coachMessage?: string
  additionalContext?: string
}): string {
  const { emailType, school, recentLogs, assets, coachMessage, additionalContext } = params

  const lines: string[] = []

  lines.push(`EMAIL TYPE: ${emailType}`)
  lines.push(`INSTRUCTION: ${EMAIL_TYPE_INSTRUCTIONS[emailType]}`)
  lines.push('')

  lines.push(`SCHOOL: ${school.name}`)
  lines.push(`Division: ${school.division}${school.conference ? ` — ${school.conference}` : ''}`)
  lines.push(`Location: ${school.location || 'Unknown'}`)
  lines.push(`Status: ${school.status}`)
  if (school.notes) lines.push(`Notes: ${school.notes}`)
  lines.push('')

  if (assets.length > 0) {
    lines.push('ASSETS (current versions — use these links, not any hardcoded URLs):')
    for (const a of assets) {
      const label = ASSET_TYPE_LABELS[a.type] ?? a.type
      const ref = a.category === 'link' && a.url ? a.url : a.file_name ?? '(file)'
      const visibility = a.type === 'game_film' ? ' — UNLISTED, share only if coach asks' : ''
      lines.push(`  ${label}: ${a.name} — ${ref}${visibility}`)
    }
    lines.push('')
  }

  if (recentLogs.length > 0) {
    lines.push(`CONTACT HISTORY (${recentLogs.length} entries):`)
    recentLogs.forEach(e => {
      lines.push(`  [${e.date}] ${e.direction} via ${e.channel}${e.coach_name ? ` — ${e.coach_name}` : ''}:`)
      lines.push(`    ${e.summary}`)
    })
    lines.push('')
  } else {
    lines.push('CONTACT HISTORY: None — this is a cold outreach.')
    lines.push('')
  }

  if (coachMessage) {
    lines.push(`COACH'S MESSAGE TO REPLY TO:`)
    lines.push(coachMessage)
    lines.push('')
  }

  if (additionalContext) {
    lines.push(`ADDITIONAL CONTEXT:`)
    lines.push(additionalContext)
    lines.push('')
  }

  lines.push('Draft the email now. Return only valid JSON with "subject" and "body" keys.')

  return lines.join('\n')
}

// ─── Prep for call ────────────────────────────────────────────────────────────

export const PREP_SYSTEM_PROMPT = `You are a college soccer recruiting advisor helping Finn Almond (Class of 2027, left wingback) prepare for a conversation with a college coach.

Finn's profile:
- Position: Left Wingback (transitioned from striker Nov 2025)
- Club: Albion SC Colorado MLS NEXT Academy U19
- GPA: 3.78W / 3.57UW | SAT: 1340
- Academic interest: Mechanical or Aerospace Engineering
- Highlight reel: https://www.youtube.com/watch?v=Va_Z09OYcs0

Your job:
1. Review the school record and contact history provided
2. Triage the global question bank — mark each question as priority, answered, or skip based on what's already known
3. Suggest 2-3 school-specific questions that would advance THIS specific recruiting relationship
4. Write a brief call_summary orienting Finn to where things stand

Rules:
- Be specific to what's actually in the notes and contact log
- "answered" means there is clear evidence in the data — not a guess
- "priority" questions should reflect the current relationship stage: early conversations need formation/roster questions; warm relationships need development/culture questions
- School-specific questions should be actionable and advance the conversation, not generic
- For category in school_specific_questions, use ONLY one of these exact strings: "Formation & Fit", "Roster & Playing Time", "Development", "Culture", "Academics & Aid"
- Return only valid JSON matching the schema provided. No markdown fences, no preamble.`

export function buildPrepPrompt(params: {
  school: School
  recentLogs: ContactLogEntry[]
  globalQuestions: Question[]
}): string {
  const { school, recentLogs, globalQuestions } = params
  const lines: string[] = []

  lines.push(`SCHOOL: ${school.name}`)
  lines.push(`Division: ${school.division}${school.conference ? ` — ${school.conference}` : ''}`)
  lines.push(`Location: ${school.location || 'Unknown'}`)
  lines.push(`Status: ${school.status}`)
  lines.push(`Head Coach: ${school.head_coach || 'Unknown'}`)
  if (school.admit_likelihood) lines.push(`Admit Likelihood: ${school.admit_likelihood}`)
  if (school.notes) lines.push(`Notes: ${school.notes}`)
  lines.push('')

  if (recentLogs.length > 0) {
    lines.push(`CONTACT HISTORY (${recentLogs.length} most recent entries):`)
    recentLogs.forEach(e => {
      lines.push(`  [${e.date}] ${e.direction} via ${e.channel}${e.coach_name ? ` — ${e.coach_name}` : ''}:`)
      lines.push(`    ${e.summary}`)
    })
  } else {
    lines.push('CONTACT HISTORY: None — no contact logged yet.')
  }
  lines.push('')

  lines.push(`GLOBAL QUESTION BANK (${globalQuestions.length} questions — triage each one):`)
  globalQuestions.forEach(q => {
    lines.push(`  [${q.id}] ${q.category}: ${q.question}`)
  })
  lines.push('')

  lines.push(`Return a JSON object with this exact schema:
{
  "overrides": [
    {
      "question_id": "<uuid from the list above>",
      "status": "priority" | "answered" | "skip",
      "context_note": "<what we know, why it's priority, or why skipping>"
    }
  ],
  "school_specific_questions": [
    {
      "question_text": "<question to ask>",
      "rationale": "<why this matters for this specific school>",
      "category": "<exact category string>"
    }
  ],
  "call_summary": "<2-3 sentences: where things stand with this school and what Finn should focus on in this call>"
}

Every question in the global bank must appear in overrides exactly once.`)

  return lines.join('\n')
}
