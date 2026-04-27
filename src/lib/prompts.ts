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

ADDRESSING: Always address the email to the coach named in GREETING TARGET. Do not let contact history override this — prior messages may be from a different coach, but GREETING TARGET is the current recipient. Use their last name in the salutation.

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

// Strip coach email signature blocks from contact log summaries.
// Signatures typically look like: "Coach Name\nHead Men's Soccer Coach\n..."
function stripSignature(summary: string): string {
  const lines = summary.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (/^(?:Head|Interim Head|Associate Head|Assistant|Interim Assistant)\s+(?:Men['']?s\s+)?(?:Soccer\s+)?Coach/i.test(trimmed)) {
      // Back up one line if the preceding line looks like a standalone name
      const cutAt = i > 0 && /^[A-Z][a-z]+ [A-Z]/.test(lines[i - 1].trim()) && lines[i - 1].trim().split(' ').length <= 4 ? i - 1 : i
      return lines.slice(0, cutAt).join('\n').trim()
    }
  }
  return summary
}

export function buildUserPrompt(params: {
  emailType: EmailType
  school: School
  recentLogs: ContactLogEntry[]
  assets: Asset[]
  coachMessage?: string
  additionalContext?: string
  primaryCoachName?: string | null
  primaryCoachEmail?: string | null
  primaryCoachRole?: string | null
}): string {
  const { emailType, school, recentLogs, assets, coachMessage, additionalContext, primaryCoachName, primaryCoachEmail, primaryCoachRole } = params

  const lines: string[] = []

  // ── GREETING TARGET first — must win over any contact-log context ──
  if (primaryCoachName) {
    const lastName = primaryCoachName.trim().split(' ').at(-1) ?? primaryCoachName
    const rolePart = primaryCoachRole ? ` (${primaryCoachRole})` : ''
    const emailPart = primaryCoachEmail ? ` <${primaryCoachEmail}>` : ''
    lines.push(`GREETING TARGET — MANDATORY:`)
    lines.push(`This email MUST be addressed to: ${primaryCoachName}${rolePart}${emailPart}`)
    lines.push(`The salutation MUST use "Coach ${lastName}" — do NOT address any other coach, even if prior messages were from someone else.`)
    lines.push('')
  } else if (school.head_coach) {
    const lastName = school.head_coach.trim().split(/[;\s]+/)[0].split(' ').at(-1) ?? school.head_coach
    lines.push(`GREETING TARGET — MANDATORY:`)
    lines.push(`This email MUST be addressed to: ${school.head_coach}`)
    lines.push(`The salutation MUST use "Coach ${lastName}" — do NOT address any other coach.`)
    lines.push('')
  }

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
    lines.push(`CONTACT HISTORY (${recentLogs.length} entries — note: contact history shows prior coaches; the GREETING TARGET above overrides who this email is addressed to):`)
    recentLogs.forEach(e => {
      const summary = stripSignature(e.summary ?? '')
      lines.push(`  [${e.date}] ${e.direction} via ${e.channel}${e.coach_name ? ` — ${e.coach_name}` : ''}:`)
      lines.push(`    ${summary}`)
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

// ─── Campaign personalization ─────────────────────────────────────────────────

export const CAMPAIGN_PERSONALIZE_SYSTEM_PROMPT = `You are personalizing a recruiting email from Finn Almond to a college soccer coach.

=== FINN'S PROFILE ===
Name: Finn Almond | Class of 2027 | Left Wingback
Club: Albion SC Colorado, MLS NEXT Academy (U19)
High School: Alexander Dawson School, Lafayette, CO
GPA: 3.78 weighted / 3.57 unweighted | SAT: 1340
Academic interest: Mechanical or Aerospace Engineering
Recent highlights:
  - April 2026: MLS NEXT Cup Qualifiers, Scottsdale AZ — scored an Olimpico (direct corner kick goal)
  - 2024 HS Season: 29 goals, 14 assists in 16 games
  - 2024 HS Awards: 2nd Team All-State, 1st Team All-Conference, Team MVP

=== YOUR TASK ===
The email below contains "[Finn: add ...]" placeholders where school-specific or stats-specific content should go.
Fill each one with specific, concrete content from the context provided.

Rules:
- ONLY fill "[Finn: ...]" brackets — do NOT rewrite, restructure, or reword any other part of the email
- Do NOT invent facts, statistics, or experiences not supported by the context provided
- If a bracket cannot be confidently filled from the context, replace it with "[TODO: <original instruction>]" so Finn knows to revisit it
- Any "[TODO: ...]" bracket already in the email MUST be passed through unchanged — never fill, rewrite, or remove a TODO
- Never assert future commitments, plans, or intentions on Finn's behalf — do not claim Finn will attend a camp, visit campus, register for an event, or take any forward action unless the input context explicitly states he has already decided to do so. "Coach invited Finn to camp" does NOT mean Finn plans to attend.
- Never quote, paraphrase, or closely mirror the coach's prior messages back at them — reference the relationship state without echoing their words
- Keep the surrounding voice intact — confident, direct, genuine, specific
- Return ONLY the complete filled-in email body — no subject line, no explanation, no markdown fences
- Keep it under 200 words total`

export interface CampaignPersonalizeParams {
  renderedBody: string
  schoolName: string
  division: string
  conference: string | null
  location: string | null
  category: string
  notes: string | null
  coachName: string | null
  coachRole: string | null
  recentInbounds: Array<{
    date: string
    channel: string
    authored_by: string | null
    summary: string
  }>
}

export function buildCampaignPersonalizePrompt(p: CampaignPersonalizeParams): string {
  // ── Stats hallucination guard (code-level, deterministic) ──────────────────
  // Replace stats/highlights brackets with [TODO: stats] BEFORE the model sees
  // them. The system has no canonical stats source — old stats from contact_log
  // are stale by definition. Finn fills these in manually during review.
  const guardedBody = p.renderedBody.replace(
    /\[Finn:[^\]]*(?:stats|highlights|recent results)[^\]]*\]/gi,
    '[TODO: stats — Finn fills in current stats manually]'
  )

  const lines: string[] = []

  lines.push(`SCHOOL: ${p.schoolName}`)
  lines.push(`Division: ${p.division}${p.conference ? ` — ${p.conference}` : ''}`)
  if (p.location) lines.push(`Location: ${p.location}`)
  lines.push(`Tier: ${p.category} (A = highest priority, C = lower)`)
  if (p.notes) lines.push(`Notes: ${p.notes}`)
  lines.push('')

  if (p.coachName) {
    lines.push(`COACH: ${p.coachName}${p.coachRole ? ` (${p.coachRole})` : ''}`)
    lines.push('')
  }

  if (p.recentInbounds.length > 0) {
    lines.push(`RECENT INBOUND CONTACT (most recent first — use this to understand relationship state):`)
    for (const e of p.recentInbounds) {
      const source = e.authored_by === 'coach_personal' ? 'coach personally'
        : e.authored_by === 'coach_via_platform' ? 'coach via platform'
        : e.authored_by ?? 'unknown source'
      lines.push(`  [${e.date}] Inbound via ${e.channel} (${source}): ${e.summary.slice(0, 200)}`)
    }
    lines.push('')
  } else {
    lines.push(`CONTACT HISTORY: None — cold outreach.`)
    lines.push('')
  }

  lines.push(`EMAIL TO PERSONALIZE:`)
  lines.push(`---`)
  lines.push(guardedBody)
  lines.push(`---`)
  lines.push('')
  lines.push(`Fill in all "[Finn: ...]" brackets with specific content from the context above. Return only the completed email body.`)

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
