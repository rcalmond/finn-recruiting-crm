import type { Question } from '@/lib/types'
import { buildOutreachSubject } from './player-identity'
import {
  buildDraftingPersona, personaIdentityLine, personaCredentialRule, personaVoiceDescriptor,
  type PersonaSource,
} from './drafting-persona'
import type { SupabaseClient } from '@supabase/supabase-js'
import { scopeOf } from '@/lib/tenant-db'
import { fetchSchoolContext, type CurrentAssets, type StatusUpdateRow } from '@/lib/school-context'
import { RECRUITING_JUDGMENT } from '@/lib/recruiting-judgment'

// Legacy type alias — used by todayLogic.ts for email draft mode tracking
export type EmailType = 'first_contact' | 'wingback_update' | 'follow_up' | 'post_camp' | 'visit_request' | 'academic_update' | 'reply'

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

// ─── Campaign personalization ─────────────────────────────────────────────────

export function buildCampaignPersonalizeSystemPrompt(
  player?: PersonaSource | null,
  academicSummary?: string | null,
  highlights?: string | null,
): string {
  // Identity from the family's players row. Absent fields are OMITTED — the
  // club contract forbids inferring, abbreviating, or inventing one.
  const persona = buildDraftingPersona(player)
  const NAME = persona.name || 'the player'
  const line = [
    persona.gradYear ? `Class of ${persona.gradYear}` : '',
    persona.position ?? '',
  ].filter(Boolean).join(' | ')
  return `You are personalizing a recruiting email from ${NAME} to a college soccer coach.

=== ${NAME.toUpperCase()}'S PROFILE ===
Name: ${NAME}${line ? ` | ${line}` : ''}
${persona.club ? `Club: ${persona.club}\n` : ''}${academicSummary ? `Academics: ${academicSummary}\n` : ''}${highlights ? `Recent highlights: ${highlights}\n` : ''}
=== YOUR TASK ===
The email below contains placeholders where school-specific or stats-specific content should go. They look like "[PLAYER: add ...]" and, in older saved drafts, "[Finn: add ...]". Treat BOTH forms identically.
Fill each one with specific, concrete content from the context provided.

Rules:
- ONLY fill "[PLAYER: ...]" or legacy "[Finn: ...]" brackets — do NOT rewrite, restructure, or reword any other part of the email
- Do NOT invent facts, statistics, or experiences not supported by the context provided
- If a bracket cannot be confidently filled from the context, replace it with "[TODO: <original instruction>]" so the family knows to revisit it
- Any "[TODO: ...]" bracket already in the email MUST be passed through unchanged — never fill, rewrite, or remove a TODO
- Never assert future commitments, plans, or intentions on the player's behalf — do not claim they will attend a camp, visit campus, register for an event, or take any forward action unless the input context explicitly states they have already decided to do so. An invitation to camp does NOT mean they plan to attend.
- Never quote, paraphrase, or closely mirror the coach's prior messages back at them — reference the relationship state without echoing their words
- Keep the surrounding voice intact — confident, direct, genuine, specific
- Return ONLY the complete filled-in email body — no subject line, no explanation, no markdown fences
- Keep it under 200 words total`
}

export interface CampaignPersonalizeParams {
  renderedBody: string
  schoolName: string
  division: string
  conference: string | null
  location: string | null
  category: string
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
    /\[(?:Finn|PLAYER):[^\]]*(?:stats|highlights|recent results)[^\]]*\]/gi,  // READ BOTH: legacy [Finn: + neutral [PLAYER:; only [PLAYER: is ever WRITTEN
    '[TODO: stats — fill in current stats manually]'
  )

  const lines: string[] = []

  lines.push(`SCHOOL: ${p.schoolName}`)
  lines.push(`Division: ${p.division}${p.conference ? ` — ${p.conference}` : ''}`)
  if (p.location) lines.push(`Location: ${p.location}`)
  lines.push(`Tier: ${p.category} (A = highest priority, C = lower)`)
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
  lines.push(`Fill in all "[PLAYER: ...]" brackets — and any legacy "[Finn: ...]" brackets in older saved drafts, which mean the same thing — with specific content from the context above. Return only the completed email body.`)

  return lines.join('\n')
}

// ─── Email Draft v2 — shared prompt builder ─────────────────────────────────

export interface EmailDraftInput {
  schoolId: string
  coachId: string | null
  brief?: string
  selectedTopic?: string
  /** Plan-driven: explicit messages to cover in this email */
  coverageItems?: Array<{ title: string; type: string; notes: string | null }>
  /** Plan-driven: free-text "anything else to cover" */
  coverageNotes?: string
  context: 'individual' | 'campaign'
  campaignTemplate?: string
  replyToContactLogId?: string  // when set, output is body-only (no subject)
  /** Recommended action from conversation summary — anchors the email's purpose */
  recommendedAction?: string
}

interface VoiceRef {
  summary: string
  date: string
  school_name: string
  coach_name: string | null
}

interface ContactRow {
  date: string
  sent_at: string
  direction: string
  channel: string
  coach_name: string | null
  summary: string | null
  authored_by: string | null
  intent: string | null
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function formatCurrentDate(): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Denver',
  }).format(new Date())
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

const DATE_AWARENESS_RULE = (currentDate: string) =>
`DATE AWARENESS:
Today's date is ${currentDate}. Do not suggest or reference topics tied to past dates, completed events, past games, or expired opportunities as if they are still actionable. A camp on May 9-10 mentioned in prior correspondence is not a future opportunity if today is May 13. An "April game schedule" reference in May is past-due.

You may reference past events as context for forward-looking content (e.g., "follow up on coach's April feedback about wingback positioning") but the suggestion or topic itself must be forward-looking and currently actionable.`

interface CampContext {
  name: string
  start_date: string
  end_date: string
  location: string | null
  registration_deadline: string | null
  status: string
}

interface CoachContext {
  name: string
  role: string | null
  email: string | null
  /** COMPOSED view field — see coach-primary.ts. Never a DB column. */
  isPrimary: boolean
  needs_review: boolean
}

/**
 * Shared prompt builder for all email draft paths.
 * Pulls player_profile, school/coach context, contact history,
 * classification, staleness, and voice references from DB.
 *
 * Returns { system, user } strings for the Anthropic API call.
 */
/** Position-change context is the FAMILY's biography, not a generic rule.
 *  Derived from what the family actually wrote in their own profile; null when
 *  nothing records it, so nothing is asserted about a player we do not know. */
function derivePositionChangeNote(profile: { highlights?: string | null; current_stats?: string | null } | null | undefined): string | null {
  const text = `${profile?.highlights ?? ''} ${profile?.current_stats ?? ''}`
  if (!/\b(transition(ed)?|moved|switch(ed)?|converted)\b/i.test(text)) return null
  if (!/\b(position|strik|wing|back|mid|keeper|defender|forward)\b/i.test(text)) return null
  return "the player's profile records a position change; any decline predating it was based on a different position"
}

export async function buildEmailDraftPrompt(
  admin: SupabaseClient,
  input: EmailDraftInput
): Promise<{ system: string; user: string }> {
  const isReply = !!input.replyToContactLogId

  // ── Shared context fetch ────────────────────────────────────────────────
  const [
    ctx,
    { data: profile },
    { data: coach },
    { data: voiceRefs },
    { data: replyToRow },
  ] = await Promise.all([
    fetchSchoolContext(admin, input.schoolId, { includeActionItems: true }),
    // T1: players by family (the familyAdmin wrapper scopes the read; one player at alpha)
    admin.from('players').select('*').order('created_at', { ascending: true }).limit(1).single(),
    input.coachId
      ? admin.from('coaches')
          .select('name, role, email, needs_review')
          .eq('id', input.coachId)
          .single()
      : Promise.resolve({ data: null }),
    admin.rpc('get_voice_references', { p_family_id: scopeOf(admin) }).then(r => r) as unknown as Promise<{ data: VoiceRef[] | null }>,
    input.replyToContactLogId
      ? admin.from('contact_log')
          .select('date, sent_at, channel, coach_name, summary')
          .eq('id', input.replyToContactLogId)
          .single()
      : Promise.resolve({ data: null }),
  ])

  const { school, coaches, contactLog: history, upcomingCamps: camps, declineHistory: declineRows, actionItems, statusUpdates, currentAssets } = ctx

  const currentDate = formatCurrentDate()

  // ── Staleness calculation ──────────────────────────────────────────────────
  const recentInbound = [...history].reverse().find(
    (r: ContactRow) => r.direction === 'Inbound' &&
      r.authored_by !== 'team_automated' &&
      r.authored_by !== 'staff_non_coach'
  )
  let stalenessLabel = 'No prior inbound'
  let stalenessDays = 0
  if (recentInbound) {
    stalenessDays = Math.floor(
      (Date.now() - new Date(recentInbound.sent_at).getTime()) / (1000 * 60 * 60 * 24)
    )
    stalenessLabel = stalenessDays <= 30 ? 'Recent'
      : stalenessDays <= 90 ? 'Cooling'
      : 'Stale'
  }

  // ── Most recent inbound classification ─────────────────────────────────────
  const classifiedInbound = [...history].reverse().find(
    (r: ContactRow) => r.direction === 'Inbound' && r.authored_by
  )

  // ── Build system prompt ────────────────────────────────────────────────────
  const sys: string[] = []

  // WHO we are writing as — from the family's players row, never a literal.
  const persona = buildDraftingPersona(profile)
  const NAME = persona.name || 'the player'
  const FIRST = persona.firstName || 'the player'
  const positionChangeNote = derivePositionChangeNote(profile)

  sys.push(`You are drafting an email from ${personaIdentityLine(persona)}, to a college soccer coach.`)
  sys.push('')

  sys.push(`VOICE — ${personaVoiceDescriptor(persona)}. The email must sound like a serious, polite, articulate teenager, not a corporate professional, not a parent, not a recruiter.

Hard voice rules:
- NEVER use em-dashes (—) or en-dashes (–). Use periods, commas, or simple connecting words instead. This is the single most important formatting rule.
- No corporate or formal-business phrasing. This means ANY phrase that sounds like it came from a LinkedIn message, a sales email, or an office memo. Specific banned patterns (not exhaustive, use judgment):
  "I wanted to reach out", "I wanted to circle back", "I wanted to touch base", "Following up on my note", "I am writing to", "Please don't hesitate to", "I look forward to hearing from you at your earliest convenience", "at your convenience", "Moreover", "Furthermore", "Additionally", "I would be remiss", "per our conversation", "as discussed", "circle back", "touch base", "loop in", "moving forward".
  TEST: if the phrase would sound normal in a business email between two adults at a company, it is too formal for ${FIRST}. Rewrite it in the simplest, most direct way a teenager would say it.
- No overly balanced, essay-style sentence construction. Real teenagers write in plainer, more direct sentences. Short is fine. Fragment-like sentences are fine.
- Don't oversell or use marketing language about himself. Plain statements of fact about his play and season, not adjective-loaded self-promotion.
- Contractions are fine and natural (I'm, I've, that's, don't).
- Keep it concise. A coach should be able to read it in under a minute.

Voice target: polite, direct, genuine, a little understated. ${FIRST} is confident but not slick, and sounds like a real kid who cares about both soccer and academics and is doing their own outreach.

Rewrites to internalize (teenager version on right):
- "Following up on my note" → "Hey Coach, just wanted to send over..."
- "I wanted to circle back" → "Checking in on..."
- "I wanted to reach out regarding" → just state the thing directly
- "I look forward to connecting" → "Hope to hear from you" or "Talk soon"
- "Please find attached" → "Here's my..."
- "Thank you for your consideration" → "Thanks, Coach" or just "Thanks"

Good close examples: "Thanks for taking the time.", "Let me know if it would help to see more film.", "I'd appreciate any thoughts you have.", "Hope to talk soon."
Avoid closes like: "I look forward to the opportunity to discuss my candidacy further.", "Please feel free to reach out at your convenience.", "Thank you for your consideration."`)
  sys.push('')

  sys.push(DATE_AWARENESS_RULE(currentDate))
  sys.push('')

  sys.push(RECRUITING_JUDGMENT)
  sys.push('')

  // Voice references
  // Voice references contain legacy "Albion SC Colorado" from MLS NEXT Fest
  // December 2025 materials. Mask to current canonical name at prompt build
  // time so voice exemplars don't conflict with the identity statement.
  const refs = voiceRefs ?? []
  if (refs.length > 0) {
    // THIS family's own prior writing — get_voice_references is family-scoped,
    // so a new family never inherits another family's voice.
    sys.push(`STYLE REFERENCE — ${NAME}'s own recent writing (match tone, structure, phrasing patterns):`)
    for (const ref of refs) {
      // Legacy club-name drift in the family's own older messages.
      const sig = stripSignature(ref.summary)
        .replace(/Albion SC Colorado/g, persona.club ?? 'Albion SC Colorado')
      sys.push(`--- [${ref.date}] to ${ref.school_name}${ref.coach_name ? ` (${ref.coach_name})` : ''} ---`)
      sys.push(sig)
      sys.push('')
    }
  } else {
    // FAIL HONESTLY: a family with no corpus yet gets the voice RULES above and
    // nothing borrowed. Never seed one family's drafts from another's writing.
    sys.push(`STYLE REFERENCE — none yet: this family has no prior outreach on record. Follow the voice rules above; do not imitate any other player's writing.`)
    sys.push('')
  }

  // Player profile
  sys.push(`PLAYER PROFILE — the ONLY authoritative source for stats, schedule, and academic claims:`)
  if (profile) {
    sys.push(`Current stats: ${profile.current_stats ?? '[not available — use [TODO: stats] if needed]'}`)
    sys.push(`Upcoming schedule: ${profile.upcoming_schedule ?? '[not available — use [TODO: schedule] if needed]'}`)
    sys.push(`Highlights: ${profile.highlights ?? '[not available — use [TODO: highlights] if needed]'}`)
    sys.push(`Academic: ${profile.academic_summary ?? '[not available — use [TODO: academic info] if needed]'}`)
  } else {
    sys.push(`[No player profile parsed yet. Use [TODO: <description>] for any stats, schedule, or academic claims.]`)
  }
  sys.push('')

  // Hard rules
  sys.push(`HARD RULES:
- Never state a stat, schedule item, or academic detail not present in the player profile above. If you'd need to reference something that isn't in the profile, write [TODO: <description>] instead.
- Never quote or paraphrase the coach's prior message back to them.
- Never assert future commitments (camp attendance, visits, calls) unless explicitly stated in the brief or selected topic.
- Express interest cleanly. Don't attach "if the timing works" / "if my schedule allows" / "depending on our season run" / "pending Cup qualification" or any conditional hedge to expressions of interest. If ${FIRST} isn't ready to commit to specific dates, the correct shape is: "I'm interested, can you share the dates and I'll confirm?" or "I'd like to attend. What's the next step?" Do not preemptively flag potential schedule conflicts, even softly. Real conflicts (with specific dates and overlapping events) can be acknowledged only if the player profile or brief explicitly states them.
- Don't preemptively give the coach an out (e.g., "if not, I understand," "no pressure," "I know you're busy"). Express interest directly and trust the coach to respond. The voice references don't include this pattern.
- Keep under 200 words.
- Match the voice references: short paragraphs, direct tone, no chest-thumping, no marketing language.
- Voice references are the family's own real writing, with occasional typos and informal phrasing. Match voice and tone, NOT typos, missing apostrophes, or punctuation errors. Output should be clean.
- No bullet points in the email body — short paragraphs only.
- No more than one exclamation point per email.
- Never open with "I hope this email finds you well" or any filler.
${currentAssets.highlightReelUrl ? `- Always include the highlight reel link: ${currentAssets.highlightReelUrl}` : `- Do not include a highlight reel link — none is currently available.`}
${personaCredentialRule(persona)}
- Never include game film unless the coach specifically asked for it.
- Output must contain only plain text. Never wrap email addresses, URLs, or any other content in markdown link syntax like "[text](url)" or "<url>". Email addresses appear as plain text (e.g., "name@example.com"). URLs appear as plain text (e.g., "https://..."). The voice references contain markdown link artifacts from email rendering — those are input noise to ignore, not patterns to replicate.
- Sign off: end with a brief closing line (e.g., "Thank you," or "Best,") followed by "${FIRST}" on its own line. Do NOT include a full signature block — no email address, phone number, Sports Recruits URL, or other contact info. The email client appends those automatically. Voice references may include richer signatures — those are legacy, do not replicate them.`)
  sys.push('')

  // Staleness handling
  sys.push(`STALENESS HANDLING:
- Recent (<=30 days): Continue the conversation naturally. Reference last contact if relevant.
- Cooling (31-90 days): Acknowledge gap briefly. Lead with what's new since last contact.
- Stale (>90 days): Reintroduce. Don't assume coach remembers specifics. If the player's profile records a position change, reference it: that is usually the most meaningful change since a stale thread.
- No prior inbound: This is a cold or follow-up outreach. Lead with who ${FIRST} is and why this school.`)
  sys.push('')

  // Coach hedging
  sys.push(`COACH HEDGING:
- If the coach has needs_review=true, use a generic professional salutation ("Coach,") rather than confidently addressing them by name — they may have departed.`)
  sys.push('')

  // Closing question (individual emails only, not campaign)
  if (input.context === 'individual') {
    sys.push(`CLOSING QUESTION:
End the email with a strategic question that naturally follows from what the email just said and moves the conversation forward. The question should invite a specific, substantive response from the coach.

The closing question must fit the email's content. If the email shares end-of-season stats and a position update, a fitting close asks whether that profile matches what they're recruiting. If the email responds to a coach's camp invitation, a fitting close asks a specific question about the camp or evaluation. Do NOT attach a closing question that doesn't connect to the email's content.

Weave the question into a natural closing paragraph in ${FIRST}'s voice. Do not bolt it on as a separate line.

Also produce 2-3 ALTERNATIVE closing questions: other strategic questions that would also fit this email, that the family might prefer. These are just the question text. They should be genuinely different strategic directions, not rewordings of the same question.

Apply the same voice rules to closing questions: a 17-year-old's voice, no em-dashes, direct and genuine.`)
    sys.push('')
  }

  // Output format
  if (input.context === 'individual' && !isReply) {
    sys.push(`OUTPUT FORMAT:
Respond ONLY with valid JSON. No preamble, no markdown fences.
{ "subject": "${buildOutreachSubject(profile, '[School Name]')}", "body": "...", "closingQuestion": "the question woven into the closing paragraph", "closingAlternatives": ["alt question 1", "alt question 2"] }
Body uses plain line breaks between paragraphs, no HTML.`)
  } else if (input.context === 'individual' && isReply) {
    sys.push(`OUTPUT FORMAT:
Respond ONLY with valid JSON. No preamble, no markdown fences.
{ "body": "...", "closingQuestion": "the question woven into the closing paragraph", "closingAlternatives": ["alt question 1", "alt question 2"] }
Body uses plain line breaks between paragraphs, no HTML.`)
  } else {
    // Campaign mode returns body-only (no closing question handling)
    sys.push(`OUTPUT FORMAT:
Return ONLY the complete email body — no subject line, no explanation, no markdown fences.
Body uses plain line breaks between paragraphs, no HTML.`)
  }

  // ── Build user prompt ──────────────────────────────────────────────────────
  const usr: string[] = []

  usr.push(`TODAY: ${currentDate}`)
  usr.push('')

  // ── School context ──
  usr.push(`SCHOOL CONTEXT:`)
  if (school) {
    usr.push(`- ${school.name}`)
    usr.push(`- Tier ${school.category}, Division ${school.division}${school.conference ? `, ${school.conference}` : ''}`)
    usr.push(`- Location: ${school.location ?? 'unknown'}`)
    usr.push(`- Pipeline status: ${school.status}`)
  }
  usr.push('')

  // ── Coaches ──
  usr.push(`COACHES:`)
  if (coaches.length > 0) {
    for (const c of coaches) {
      const parts = [`${c.name} (${c.role ?? 'unknown role'})`]
      if (c.isPrimary) parts.push('— PRIMARY')
      if (c.needs_review) parts.push('— needs_review, may have departed')
      usr.push(`- ${parts.join(' ')}`)
    }
  } else if (coach) {
    usr.push(`- ${coach.name} (${coach.role ?? 'role unknown'})${coach.needs_review ? ' — needs_review, may have departed' : ''}`)
  } else {
    usr.push(`- No coaches on file`)
  }
  usr.push('')

  // ── Camps ──
  usr.push(`CAMPS AT THIS SCHOOL (upcoming):`)
  if (camps.length > 0) {
    for (const c of camps) {
      const deadline = c.registration_deadline ? ` | Deadline: ${c.registration_deadline}` : ''
      const loc = c.location ? ` | ${c.location}` : ''
      usr.push(`- ${c.name} | ${c.start_date} – ${c.end_date}${loc} | Status: ${c.status}${deadline}`)
    }
  } else {
    usr.push(`- None scheduled`)
  }
  usr.push('')

  // ── Decline history ──
  usr.push(`DECLINE HISTORY:`)
  if (declineRows.length > 0) {
    for (const d of declineRows as ContactRow[]) {
      usr.push(`- Declined on ${d.date}${d.coach_name ? ` by ${d.coach_name}` : ''}: ${stripSignature(d.summary ?? '').slice(0, 300)}`)
    }
    // Position-change context is BIOGRAPHY, surfaced only when the family's own
    // profile records it. Never asserted as a generic fact about a player.
    if (positionChangeNote) {
      usr.push(`- Note: ${positionChangeNote}`)
    }
  } else {
    usr.push(`- None`)
  }
  usr.push('')

  // ── Finn's current context ──
  usr.push(`${(persona.name || 'THE PLAYER').toUpperCase()}'S CURRENT CONTEXT:`)
  if (persona.position) usr.push(`- Position: ${persona.position}`)
  if (persona.gradYear) usr.push(`- Class: ${persona.gradYear}`)
  // Club OMITTED when empty — never inferred, abbreviated, or invented.
  if (persona.club) usr.push(`- Club: ${persona.club}`)
  // Reel URL sourced from assets table via fetchSchoolContext.currentAssets.
  // Do NOT read from player_profile.current_reel_url — that field is stale.
  usr.push(`- Current reel: ${currentAssets.highlightReelUrl ?? 'no reel available'}`)
  if (profile?.highlights) usr.push(`- Recent highlights: ${profile.highlights}`)
  if (profile?.current_stats) usr.push(`- Current stats: ${profile.current_stats}`)
  if (profile?.upcoming_schedule) usr.push(`- Upcoming schedule: ${profile.upcoming_schedule}`)
  usr.push('')

  // ── Classification ──
  if (classifiedInbound) {
    usr.push(`MOST RECENT INBOUND CLASSIFICATION:`)
    usr.push(`- authored_by: ${classifiedInbound.authored_by ?? 'unknown'}`)
    usr.push(`- intent: ${classifiedInbound.intent ?? 'unknown'}`)
    usr.push('')
  }

  // ── Staleness ──
  if (recentInbound) {
    usr.push(`STALENESS: ${stalenessLabel} (${stalenessDays} days since last meaningful inbound)`)
  } else {
    usr.push(`STALENESS: No prior inbound`)
  }
  usr.push('')


  // ── Status updates from Finn ──
  if (statusUpdates && statusUpdates.length > 0) {
    usr.push(`STATUS UPDATES FROM FINN:`)
    usr.push(`These describe the player's current state and intentions. Entries with share='no' MUST NOT be mentioned, referenced, or implied in the generated email. Entries with share='yes' should be worked in where relevant. Entries with share='undecided' may be referenced only if clearly valuable — if used, note it so the family can review.`)
    for (const u of statusUpdates) {
      usr.push(`[${u.created_at.split('T')[0]}, share: ${u.share_with_coach}] ${u.body}`)
    }
    usr.push('')
  }

  // ── Pending action items ──
  const actions = actionItems ?? []
  if (actions.length > 0) {
    usr.push(`PENDING ACTION ITEMS:`)
    for (const a of actions as Array<{ action: string; owner: string; due_date: string | null }>) {
      usr.push(`- ${a.action} (${a.owner}${a.due_date ? `, due ${a.due_date}` : ''})`)
    }
    usr.push('')
  }

  // ── Full conversation history ──
  if (history.length > 0) {
    usr.push(`FULL CONVERSATION HISTORY (${history.length} entries, chronological, oldest first):`)
    for (const row of history as ContactRow[]) {
      const summary = stripSignature(row.summary ?? '')
      usr.push(`[${row.date}] ${row.direction} via ${row.channel}${row.coach_name ? ` — ${row.coach_name}` : ''}`)
      usr.push(summary)
      usr.push('')
    }
  } else {
    usr.push(`CONVERSATION HISTORY: None — cold outreach.`)
    usr.push('')
  }

  // ── Reply context ──
  if (isReply && replyToRow) {
    usr.push(`REPLYING TO this inbound message:`)
    usr.push(`[${replyToRow.date}] via ${replyToRow.channel}${replyToRow.coach_name ? ` — ${replyToRow.coach_name}` : ''}:`)
    usr.push(replyToRow.summary ?? '')
    usr.push('')
    usr.push(`This is a reply. Continue the conversation naturally. Address what the coach said or asked. Move the conversation forward with one clear next step.`)
    usr.push('')
  }

  // ── Recommended action anchor ──
  if (input.recommendedAction) {
    usr.push(`RECOMMENDED NEXT STEP (this is the specific action that triggered this email — shape the email around it):`)
    usr.push(input.recommendedAction)
    usr.push('')
  }

  // ── What to cover (plan-driven or legacy topic/brief) ──
  if (input.coverageItems && input.coverageItems.length > 0) {
    usr.push(`COVER THESE MESSAGES in the email (selected from the communications plan):`)
    for (const item of input.coverageItems) {
      usr.push(`- [${item.type}] ${item.title}${item.notes ? `: ${item.notes}` : ''}`)
    }
    usr.push('')
    usr.push(`Weave these naturally into a single email. Don't use bullet points or enumerate them. The email should read as one coherent message that happens to touch on these points.`)
    usr.push('')
  }
  if (input.coverageNotes) {
    usr.push(`ADDITIONAL CONTEXT FROM FINN: ${input.coverageNotes}`)
    usr.push('')
  }
  if (input.brief) {
    usr.push(`USER GUIDANCE: ${input.brief}`)
    usr.push('')
  }
  if (input.selectedTopic) {
    usr.push(`SELECTED TOPIC: ${input.selectedTopic}`)
    usr.push('')
  }

  // Campaign template (if applicable)
  if (input.context === 'campaign' && input.campaignTemplate) {
    // Stats hallucination guard — same as existing campaign personalize
    const guarded = input.campaignTemplate.replace(
      /\[(?:Finn|PLAYER):[^\]]*(?:stats|highlights|recent results)[^\]]*\]/gi,  // READ BOTH: legacy [Finn: + neutral [PLAYER:; only [PLAYER: is ever WRITTEN
      '[TODO: stats — fill in current stats manually]'
    )
    usr.push(`Campaign template (preserve overall structure, fill placeholders):`)
    usr.push(`---`)
    usr.push(guarded)
    usr.push(`---`)
    usr.push('')
    usr.push(`Fill in all "[PLAYER: ...]" brackets — and any legacy "[Finn: ...]" brackets in older saved drafts, which mean the same thing — with specific content from the context above. Any "[TODO: ...]" bracket already in the template MUST be passed through unchanged. Return only the completed email body.`)
  } else if (input.context === 'individual' && !isReply) {
    usr.push(`Generate the email. Return only the JSON. Use [TODO: x] for any content that requires family input not in the profile.`)
  } else {
    usr.push(`Generate the email body. Return only the body text, no JSON wrapper. Use [TODO: x] for any content that requires family input not in the profile.`)
  }

  return {
    system: sys.join('\n'),
    user: usr.join('\n'),
  }
}

/**
 * Topic suggestion: returns 2-3 suggested email topics for a school.
 * Provides full conversation history, camps, coaches, and decline context
 * so the model can generate highly specific, forward-looking suggestions.
 */
export async function buildTopicSuggestPrompt(
  admin: SupabaseClient,
  schoolId: string,
  coachId: string | null
): Promise<{ system: string; user: string }> {
  // ── Shared context fetch ────────────────────────────────────────────────
  const [
    ctx,
    { data: profile },
    { data: coach },
    { data: activeMessages },
    { data: coverageRows },
  ] = await Promise.all([
    fetchSchoolContext(admin, schoolId, { includeActionItems: true }),
    // T1: players by family (scoped by the familyAdmin wrapper)
    admin.from('players').select('name, position, grad_year, club, current_stats, upcoming_schedule, highlights').order('created_at', { ascending: true }).limit(1).single(),
    coachId
      ? admin.from('coaches').select('name, role, needs_review').eq('id', coachId).single()
      : Promise.resolve({ data: null }),
    admin.from('messages').select('id, title, type, notes').eq('status', 'active'),
    admin.from('school_message_log').select('message_id').eq('school_id', schoolId),
  ])

  const { school, coaches, contactLog: history, upcomingCamps: camps, declineHistory: declineRows, actionItems, statusUpdates, currentAssets } = ctx

  const currentDate = formatCurrentDate()

  // WHO we are suggesting topics for — from the family's players row.
  const persona = buildDraftingPersona(profile)
  const FIRST = persona.firstName || 'the player'
  const positionChangeNote = derivePositionChangeNote(profile)

  // Staleness
  const recentInbound = [...history].reverse().find(
    (r: ContactRow) => r.direction === 'Inbound' &&
      r.authored_by !== 'team_automated' &&
      r.authored_by !== 'staff_non_coach'
  )
  let stalenessLabel = 'No prior inbound'
  let stalenessDays = 0
  if (recentInbound) {
    stalenessDays = Math.floor(
      (Date.now() - new Date(recentInbound.sent_at).getTime()) / (1000 * 60 * 60 * 24)
    )
    stalenessLabel = stalenessDays <= 30 ? 'Recent'
      : stalenessDays <= 90 ? 'Cooling'
      : 'Stale'
  }

  // Uncovered inventory messages
  const coveredIds = new Set((coverageRows ?? []).map((r: Record<string, unknown>) => r.message_id as string))
  const uncoveredMessages = (activeMessages ?? []).filter((m: Record<string, unknown>) => !coveredIds.has(m.id as string))

  const system = `Given the full conversation history and context below, suggest 3 short topic strings (under 12 words each) for the next email ${FIRST} could send to this coach. Topics must be specific to this relationship and currently actionable.

${DATE_AWARENESS_RULE(currentDate)}

Surface from these signals (in priority order):
1. Last inbound from coach — did they ask, request, or invite something forward-looking?
2. Uncovered inventory messages that fit the conversation state (see UNCOVERED INVENTORY section)
3. Upcoming camps at this school — registration, attendance confirmation, logistics
4. Pending action items for this school — what's already planned?
5. Recent player news worth sharing (only if not already shared in recent outbound)
6. Conversation staleness — if stale, "reintroduce + position change" is a valid topic
7. Decline history — if a decline predates a recorded position change, reopening with the new position is valid

When suggesting topics, prioritize uncovered inventory messages that fit the conversation state. If an uncovered inventory item is highly relevant, surface it as a topic. Don't force inventory items that don't fit — but when they fit, use them.

Skip "share recent news" if the conversation is highly transactional (coach asked a yes/no question, requested a form). Match the topic to the request shape.

Return a JSON array of 3 strings. No preamble.`

  // ── Build user prompt with structured sections ──
  const usr: string[] = []

  usr.push(`TODAY: ${currentDate}`)
  usr.push('')

  // School context
  usr.push(`SCHOOL CONTEXT:`)
  if (school) {
    usr.push(`- ${school.name}`)
    usr.push(`- Tier ${school.category}, Division ${school.division}${school.conference ? `, ${school.conference}` : ''}`)
    usr.push(`- Location: ${school.location ?? 'unknown'}`)
    usr.push(`- Pipeline status: ${school.status}`)
  }
  usr.push('')

  // Coaches
  usr.push(`COACHES:`)
  if (coaches.length > 0) {
    for (const c of coaches) {
      const parts = [`${c.name} (${c.role ?? 'unknown role'})`]
      if (c.isPrimary) parts.push('— PRIMARY')
      if (c.needs_review) parts.push('— needs_review, may have departed')
      usr.push(`- ${parts.join(' ')}`)
    }
  } else if (coach) {
    usr.push(`- ${coach.name} (${coach.role ?? 'unknown role'})${coach.needs_review ? ' — may have departed' : ''}`)
  } else {
    usr.push(`- No coaches on file`)
  }
  usr.push('')

  // Camps
  usr.push(`CAMPS AT THIS SCHOOL (upcoming):`)
  if (camps.length > 0) {
    for (const c of camps) {
      const deadline = c.registration_deadline ? ` | Deadline: ${c.registration_deadline}` : ''
      const loc = c.location ? ` | ${c.location}` : ''
      usr.push(`- ${c.name} | ${c.start_date} – ${c.end_date}${loc} | Status: ${c.status}${deadline}`)
    }
  } else {
    usr.push(`- None scheduled`)
  }
  usr.push('')

  // Decline history
  usr.push(`DECLINE HISTORY:`)
  if (declineRows.length > 0) {
    for (const d of declineRows as ContactRow[]) {
      usr.push(`- Declined on ${d.date}${d.coach_name ? ` by ${d.coach_name}` : ''}: ${stripSignature(d.summary ?? '').slice(0, 300)}`)
    }
    // Position-change context is BIOGRAPHY, surfaced only when the family's own
    // profile records it. Never asserted as a generic fact about a player.
    if (positionChangeNote) {
      usr.push(`- Note: ${positionChangeNote}`)
    }
  } else {
    usr.push(`- None`)
  }
  usr.push('')

  // Finn's context
  usr.push(`${(persona.name || 'THE PLAYER').toUpperCase()}'S CURRENT CONTEXT:`)
  if (persona.position) usr.push(`- Position: ${persona.position}`)
  if (persona.gradYear) usr.push(`- Class: ${persona.gradYear}`)
  // Club OMITTED when empty — never inferred, abbreviated, or invented.
  if (persona.club) usr.push(`- Club: ${persona.club}`)
  // Reel URL sourced from assets table via fetchSchoolContext.currentAssets.
  // Do NOT read from player_profile.current_reel_url — that field is stale.
  usr.push(`- Current reel: ${currentAssets.highlightReelUrl ?? 'no reel available'}`)
  if (profile) {
    if (profile.current_stats) usr.push(`- Current stats: ${profile.current_stats}`)
    if (profile.upcoming_schedule) usr.push(`- Upcoming schedule: ${profile.upcoming_schedule}`)
    if (profile.highlights) usr.push(`- Recent highlights: ${profile.highlights}`)
  }
  usr.push('')


  // Status updates from Finn
  if (statusUpdates && statusUpdates.length > 0) {
    usr.push(`STATUS UPDATES FROM FINN:`)
    usr.push(`These describe the player's current state and intentions — weight them heavily when suggesting topics.`)
    for (const u of statusUpdates) {
      usr.push(`[${u.created_at.split('T')[0]}, share: ${u.share_with_coach}] ${u.body}`)
    }
    usr.push('')
  }

  // Action items
  const actions = actionItems ?? []
  if (actions.length > 0) {
    usr.push(`PENDING ACTION ITEMS:`)
    for (const a of actions as Array<{ action: string; owner: string; due_date: string | null }>) {
      usr.push(`- ${a.action} (${a.owner}${a.due_date ? `, due ${a.due_date}` : ''})`)
    }
    usr.push('')
  }

  // Staleness
  usr.push(`STALENESS: ${stalenessLabel}${recentInbound ? ` (${stalenessDays} days)` : ''}`)
  usr.push('')

  // Uncovered inventory messages
  if (uncoveredMessages.length > 0) {
    usr.push(`UNCOVERED INVENTORY MESSAGES (consider for topic suggestions):`)
    for (const m of uncoveredMessages as Array<{ type: string; title: string; notes: string | null }>) {
      usr.push(`- ${m.type}: ${m.title}${m.notes ? ` — ${m.notes}` : ''}`)
    }
    usr.push('')
  }

  // Full conversation history
  if (history.length > 0) {
    usr.push(`FULL CONVERSATION HISTORY (${history.length} entries, chronological, oldest first):`)
    for (const row of history as ContactRow[]) {
      const summary = stripSignature(row.summary ?? '')
      usr.push(`[${row.date}] ${row.direction} via ${row.channel}${row.coach_name ? ` — ${row.coach_name}` : ''}`)
      usr.push(summary)
      usr.push('')
    }
  } else {
    usr.push(`CONVERSATION HISTORY: None — cold outreach.`)
    usr.push('')
  }

  usr.push(`Suggest 3 forward-looking, currently actionable topics for the next email to this coach. Each topic should be specific to the relationship and informed by the full context above.`)

  return { system, user: usr.join('\n') }
}

// ─── Prep for call ────────────────────────────────────────────────────────────

// Reel URL sourced from assets table via fetchSchoolContext.currentAssets.
// Do NOT hardcode a reel URL here — it goes stale.
export function buildPrepSystemPrompt(
  currentAssets: CurrentAssets,
  player?: PersonaSource | null,
  academicSummary?: string | null,
): string {
  const reelLine = currentAssets.highlightReelUrl
    ? `- Highlight reel: ${currentAssets.highlightReelUrl}`
    : ''
  // Identity from the family's players row. Every line is conditional: an
  // absent field is OMITTED, never inferred (the club contract).
  const persona = buildDraftingPersona(player)
  const NAME = persona.name || 'the player'
  const profileLines = [
    persona.position ? `- Position: ${persona.position}` : '',
    persona.gradYear ? `- Class of ${persona.gradYear}` : '',
    persona.club ? `- Club: ${persona.club}` : '',
    academicSummary ? `- Academics: ${academicSummary}` : '',
    reelLine,
  ].filter(Boolean).join('\n')
  return `You are a college soccer recruiting advisor helping ${personaIdentityLine(persona)} prepare for a conversation with a college coach.

${NAME}'s profile:
${profileLines || '- (no profile details on record — do not invent any)'}

Your job:
1. Review the FULL school record and conversation history provided
2. Triage the global question bank — mark each question as priority, answered, or skip based on what's already known from the conversation history, school notes, and context
3. Suggest 2-3 school-specific questions that would advance THIS specific recruiting relationship
4. Write a brief call_summary orienting ${NAME} to where things stand

Rules:
- Read the entire conversation history carefully. "answered" means there is clear evidence in the contact log or notes — not a guess. If a coach mentioned formation details in a prior exchange, that question is answered.
- "priority" questions should reflect the current relationship stage: early conversations need formation/roster questions; warm relationships need development/culture questions
- If there is decline history, factor it into the call_summary and suggest questions that address whether the decline context has changed (new position, new coach, etc.)
- If upcoming camps are listed, consider whether camp logistics questions are relevant
- School-specific questions should be actionable and advance the conversation, not generic
- For category in school_specific_questions, use ONLY one of these exact strings: "Formation & Fit", "Roster & Playing Time", "Development", "Culture", "Academics & Aid"
- Return only valid JSON matching the schema provided. No markdown fences, no preamble.`
}

interface PrepCoach {
  name: string
  role: string | null
  email: string | null
  /** COMPOSED view field — see coach-primary.ts. Never a DB column. */
  isPrimary: boolean
  needs_review: boolean
}

interface PrepCamp {
  name: string
  start_date: string
  end_date: string
  location: string | null
  registration_deadline: string | null
  status: string
}

export function buildPrepPrompt(params: {
  school: { id: string; name: string; short_name?: string | null; category: string; division: string; conference: string | null; location: string | null; status: string; head_coach?: string | null; admit_likelihood?: string | null }
  contactHistory: Array<{
    date: string
    direction: string
    channel: string
    coach_name: string | null
    summary: string | null
    authored_by: string | null
    intent: string | null
  }>
  globalQuestions: Question[]
  coaches: PrepCoach[]
  camps: PrepCamp[]
  declineRows: Array<{
    date: string
    coach_name: string | null
    summary: string | null
  }>
  statusUpdates?: StatusUpdateRow[]
  player?: PersonaSource | null
}): string {
  const { school, contactHistory, globalQuestions, coaches, camps, declineRows, statusUpdates } = params
  const positionChangeNote = derivePositionChangeNote(
    params.player ? { highlights: null, current_stats: null } : null
  )
  const currentDate = formatCurrentDate()
  const lines: string[] = []

  lines.push(`TODAY: ${currentDate}`)
  lines.push('')

  // School context
  lines.push(`SCHOOL CONTEXT:`)
  lines.push(`- ${school.name}`)
  lines.push(`- Tier ${school.category}, Division ${school.division}${school.conference ? `, ${school.conference}` : ''}`)
  lines.push(`- Location: ${school.location || 'Unknown'}`)
  lines.push(`- Pipeline status: ${school.status}`)
  if (school.admit_likelihood) lines.push(`- Admit likelihood: ${school.admit_likelihood}`)
  lines.push('')

  // Coaches
  lines.push(`COACHES:`)
  if (coaches.length > 0) {
    for (const c of coaches) {
      const parts = [`${c.name} (${c.role ?? 'unknown role'})`]
      if (c.isPrimary) parts.push('— PRIMARY')
      if (c.needs_review) parts.push('— needs_review, may have departed')
      if (c.email) parts.push(`<${c.email}>`)
      lines.push(`- ${parts.join(' ')}`)
    }
  } else if (school.head_coach) {
    lines.push(`- ${school.head_coach} (Head Coach)`)
  } else {
    lines.push(`- No coaches on file`)
  }
  lines.push('')

  // Camps
  lines.push(`CAMPS AT THIS SCHOOL (upcoming):`)
  if (camps.length > 0) {
    for (const c of camps) {
      const deadline = c.registration_deadline ? ` | Deadline: ${c.registration_deadline}` : ''
      const loc = c.location ? ` | ${c.location}` : ''
      lines.push(`- ${c.name} | ${c.start_date} – ${c.end_date}${loc} | Status: ${c.status}${deadline}`)
    }
  } else {
    lines.push(`- None scheduled`)
  }
  lines.push('')

  // Decline history
  lines.push(`DECLINE HISTORY:`)
  if (declineRows.length > 0) {
    for (const d of declineRows) {
      lines.push(`- Declined on ${d.date}${d.coach_name ? ` by ${d.coach_name}` : ''}: ${(d.summary ?? '').slice(0, 300)}`)
    }
    // Position-change context is BIOGRAPHY, surfaced only when the family's own
    // profile records it. Never asserted as a generic fact about a player.
    if (positionChangeNote) {
      lines.push(`- Note: ${positionChangeNote}`)
    }
  } else {
    lines.push(`- None`)
  }
  lines.push('')

  // Status updates from Finn
  if (statusUpdates && statusUpdates.length > 0) {
    lines.push(`STATUS UPDATES FROM FINN:`)
    lines.push(`These describe the player's current state, decisions, and intentions. Use them to inform call prep advice and questions. All entries are usable regardless of share flag (this is an advisory surface, not outbound content).`)
    for (const u of statusUpdates) {
      lines.push(`[${u.created_at.split('T')[0]}, share: ${u.share_with_coach}] ${u.body}`)
    }
    lines.push('')
  }

  // Full conversation history
  if (contactHistory.length > 0) {
    lines.push(`FULL CONVERSATION HISTORY (${contactHistory.length} entries, chronological, oldest first):`)
    for (const e of contactHistory) {
      lines.push(`[${e.date}] ${e.direction} via ${e.channel}${e.coach_name ? ` — ${e.coach_name}` : ''}`)
      lines.push(e.summary ?? '(no body)')
      lines.push('')
    }
  } else {
    lines.push('CONVERSATION HISTORY: None — no contact logged yet.')
    lines.push('')
  }

  // Question bank
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
  "call_summary": "<2-3 sentences: where things stand with this school and what the player should focus on in this call>"
}

Every question in the global bank must appear in overrides exactly once.`)

  return lines.join('\n')
}
