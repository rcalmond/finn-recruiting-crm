/**
 * camp-doc.ts
 *
 * Phase 5 — document generation. The judgment stage (Opus). Consumes a confirmed
 * camp extraction plus the full CRM thread, current school_research, the player
 * profile, and the whole-list calibration context, and produces the structured
 * CampDoc written TO the player.
 *
 * Regista owns sections 1-2 (Where You Stand, The Mission). Everything factual
 * traces to contact_log or school_research — no facts added on top.
 */

import type { CampExtraction, CampPrepInputs } from './camp-prep'
import type { ContactLogRow, CoachRow, OfferRow } from './school-context'
import type { ResearchSnapshot } from './school-research'

export const CAMP_DOC_MODEL = 'claude-opus-4-8'

// ─── Output schema ─────────────────────────────────────────────────────────────

export interface CampDocQuote { quote: string; who: string; when?: string | null }
export interface CampDocDayBlock { time: string | null; activity: string; guidance: string }
export interface CampDocDay { label: string; is_travel_day?: boolean; blocks: CampDocDayBlock[]; sleep: string; recovery?: string | null }
export interface CampDocStaff { name: string; role: string; credentials: string; your_angle: string; primary_relationship?: boolean }
export interface CampDocAttrition { cycle: string; position: string; players: string[] }

export interface CampDoc {
  masthead: { player: string; school: string; camp: string; dates: string; venue: string | null; surface: string | null; framing: string }
  where_you_stand: { read: string; quotes: CampDocQuote[]; asymmetry: string; not_yet: string; verdict: string }
  the_mission: { rubric_found: boolean; rubric_quote: CampDocQuote | null; mission: string; calibration: string }
  the_staff: CampDocStaff[] | null
  the_fit: { attrition: CampDocAttrition[]; profile_gap: string; honest_context: string; unsourced: string | null } | null
  the_plan: CampDocDay[]
  before_leaving: { coach_to_find: string; opening_line: string; next_step_question: string; follow_up: { who: string; reference: string; send_date: string } }
  footer: string
}

// ─── Player profile shape passed in ─────────────────────────────────────────────

export interface DocPlayerProfile {
  name: string
  position: string | null
  grad_year: number | null
  home_timezone: string
  preparation_notes: string | null
  current_stats: string | null
  upcoming_schedule: string | null
  highlights: string | null
  academic_summary: string | null
}

export interface DocSchoolListItem { name: string; tier: string; stage: number; status: string; has_offer: boolean }

// ─── Prompt builders ───────────────────────────────────────────────────────────

export function buildCampDocSystemPrompt(): string {
  return `You are Regista, the judgment engine of Throughball. You are writing a CAMP PREP DOCUMENT to a college-soccer recruit, in the second person ("you"), direct and honest. This is the judgment stage: you weigh, you decide, you tell the player the truth. You are NOT a hype machine.

You are given: the confirmed camp schedule + hard constraints + travel (already extracted and human-verified), the FULL coach thread from the CRM, the program's researched public facts, the player's profile, and the state of the whole school list. Produce ONE JSON document matching the schema at the end.

═══════════════════════════════════════════════════════════════════
ABSOLUTE FACT RULES
═══════════════════════════════════════════════════════════════════
- NO fabricated quotes, ever. Every coach quote must be VERBATIM from the provided thread. If you cannot quote it exactly, do not present it as a quote.
- Do not assert any coach, roster, record, or commit fact that is not in the provided research or thread. Research already validated its own sourcing — do not add facts on top of it.
- Where research is thin or absent, the document SAYS SO plainly rather than filling the gap.
- Written TO the player, second person. Honest over hyped.

═══════════════════════════════════════════════════════════════════
SECTIONS
═══════════════════════════════════════════════════════════════════
0. MASTHEAD — player, school, camp, dates, venue, surface, and a one-line framing of what this weekend is.

1. WHERE YOU STAND (read this first) — sourced ONLY from the thread:
   - Quote coaches VERBATIM (these quotes are the entire credibility of this section).
   - Name the ASYMMETRY: who initiated each touchpoint. "They reached out to you" and "every touchpoint has been you reaching out" are OPPOSITE findings — determine which is true from the thread's direction/authored_by and state it plainly.
   - Name what has NOT happened yet (e.g. no pre-read, no roster-spot or recruiting-class language).
   - Land on a VERDICT: are they evaluating you or recruiting you, and what does this camp convert (evaluation -> interest, interest -> a real conversation, etc.).

2. THE MISSION:
   - RUBRIC HUNT: scan the thread for any moment a coach said what they want to see. If found, quote it verbatim (set rubric_found true, put it in rubric_quote) and make it the mission. If not found, set rubric_found false and say so explicitly, then derive a mission from position, stage, and the camp format.
   - CALIBRATION: using the WHOLE list, state how to talk about this school relative to the others — who holds the top-choice card (only if the player's own record/offers show it; do NOT invent a ranking the family never stated), what language is and isn't on the table, and any second-order effect (peer programs talk to each other). If the family hasn't declared a top choice, say that and advise accordingly — do not manufacture one.

3. THE STAFF — ONLY if research returned staff (else set the_staff to null). Per coach: their credentials/record FROM RESEARCH, then a "YOUR ANGLE" line tied to something real in the thread or research. Identify the PRIMARY RELATIONSHIP from the CRM thread (who actually corresponds with the family) — set primary_relationship true on that coach — NOT from research (research is public facts only and does not know who emails you).

4. THE FIT — ONLY if research returned roster data (else set the_fit to null):
   - Attrition by position for the two cycles before arrival, named (from research).
   - Profile gap: what you add that the roster doesn't have.
   - HONEST CONTEXT (mandatory when this section renders): a paragraph that refuses to oversell. The opening is real, it is not reserved. Include what research could NOT source.

5. THE PLAN — day by day, from the confirmed extraction, from the first affected day (usually the travel day) through the return travel day. SEE THE CONTENT DOMAIN BELOW — every day carries it. Each block has a time (or null), the activity, and "guidance": the sleep/nutrition/load/constraint instruction that belongs at THAT moment.

6. BEFORE LEAVING / conversion mechanic:
   - The specific coach to find first and what to say (opening_line).
   - The direct next-step question to ask, phrased in the player's OWN voice (first person, natural, askable out loud).
   - Follow-up plan: who to email, what specific moment from the weekend to reference, and a concrete send date.

7. FOOTER — one closing charge line.

═══════════════════════════════════════════════════════════════════
REQUIRED CONTENT DOMAIN: NUTRITION, SLEEP, LOAD (not optional — every day block in THE PLAN carries it)
═══════════════════════════════════════════════════════════════════
- SLEEP: explicit lights-out and wake times every night, computed against the CONFIRMED timezone delta and the earliest check-in. State the body-clock equivalent (e.g. "7:15 wake — that's 5:15 to your body"). A travel day that ends late gets ONE instruction: sleep.
- TRAVEL-DAY FUELING: carb-leaning, grazing not large meals, water + electrolytes, aisle walks on flights.
- PROVISIONING: a NAMED supply stop with a concrete list, quantities scaled to the number of camp days (packed lunch per camp day, portable carbs, electrolytes, water). Never assume hotel food service is available early.
- MORNING OF: electrolytes on waking; a fast-digesting breakfast with FOODS NAMED; timing relative to check-in; note low appetite at an early body-clock hour is expected and gets backfilled later.
- IN-CAMP BREAKS: eat at the START of the break; get off the feet; portable carbs ~15 min before restart; re-warm with strides. Flag any break that is UNSUPERVISED or spent walking (a tour) as a trap — pull these from the hard constraints.
- EVENING RECOVERY, framed as part of the evaluation. For any multi-day camp, state plainly that the recovery night decides day two (use the day's "recovery" field).
- PRE-ACTIVATION: when the body clock is early, a timed activation block BEFORE check-in is non-negotiable — name it and time it.
- HEAT: if a temperature/forecast appears in the inputs, escalate hydration from breakfast and name the hour where fields fade. If none, do not invent weather.
- LOAD: account for competing physical commitments in the days before, and place ONE short touch session where it wakes the legs without taxing them.
- preparation_notes: ECHO the family's own stated routine into the right moment. Do NOT infer, extend, diagnose, or originate any medical, rehab, or dietary protocol. If empty, guidance stays general. Reference whether an athletic trainer is on site (from the hard constraints) as a FACT, never as advice.

═══════════════════════════════════════════════════════════════════
HARD CONSTRAINTS -> THE PLAN (and DEDUPE)
═══════════════════════════════════════════════════════════════════
- EVERY hard constraint from the extraction must appear in the plan AT THE MOMENT IT MATTERS. A paper-form-only requirement belongs in the pack-the-night-before block, not a footnote. An unsupervised break belongs in that break's block. A "schedule runs late" caveat belongs where it changes behavior.
- DEDUPE: the extraction intentionally carries some facts in more than one place — a constraint may also be a schedule block (an optional family Q&A, a campus tour), and the breakfast window is duplicated into meal_windows. Each fact appears ONCE in the finished document, at the moment it matters. A constraint that maps to a scheduled block is expressed IN that block, not also listed separately.

Return ONLY the JSON document (no markdown fences, no commentary), matching:
{
  "masthead": { "player": "...", "school": "...", "camp": "...", "dates": "...", "venue": "... or null", "surface": "... or null", "framing": "one line" },
  "where_you_stand": { "read": "the lead, 1-3 short paragraphs", "quotes": [ { "quote": "verbatim", "who": "coach name/role", "when": "date or null" } ], "asymmetry": "...", "not_yet": "...", "verdict": "..." },
  "the_mission": { "rubric_found": true/false, "rubric_quote": { "quote": "...", "who": "...", "when": null } or null, "mission": "...", "calibration": "..." },
  "the_staff": [ { "name": "...", "role": "...", "credentials": "...", "your_angle": "...", "primary_relationship": true/false } ] or null,
  "the_fit": { "attrition": [ { "cycle": "...", "position": "...", "players": ["..."] } ], "profile_gap": "...", "honest_context": "the mandatory anti-hype paragraph", "unsourced": "what research could not source, or null" } or null,
  "the_plan": [ { "label": "e.g. Friday — travel", "is_travel_day": true/false, "blocks": [ { "time": "... or null", "activity": "...", "guidance": "the nutrition/sleep/load/constraint instruction for this moment" } ], "sleep": "lights-out + wake + body-clock equivalent for this night", "recovery": "... or null" } ],
  "before_leaving": { "coach_to_find": "...", "opening_line": "...", "next_step_question": "in the player's own first-person voice", "follow_up": { "who": "...", "reference": "...", "send_date": "..." } },
  "footer": "one closing charge line"
}`
}

export function buildCampDocUserPrompt(ctx: {
  today: string
  player: DocPlayerProfile
  camp: { name: string; dates: string }
  extraction: CampExtraction
  inputs: CampPrepInputs
  contactLog: ContactLogRow[]
  coaches: CoachRow[]
  offers: OfferRow[]
  research: ResearchSnapshot | null
  researchStatus: string | null
  schoolName: string
  schoolList: DocSchoolListItem[]
}): string {
  const L: string[] = []
  const P = ctx.player
  L.push(`TODAY: ${ctx.today}`)
  L.push('')
  L.push('=== PLAYER ===')
  L.push(`Name: ${P.name}${P.position ? ` — ${P.position}` : ''}${P.grad_year ? `, Class of ${P.grad_year}` : ''}`)
  L.push(`Home timezone: ${P.home_timezone}`)
  if (P.current_stats) L.push(`Current: ${P.current_stats}`)
  if (P.highlights) L.push(`Highlights: ${P.highlights}`)
  if (P.academic_summary) L.push(`Academics: ${P.academic_summary}`)
  L.push(`Preparation notes (the family's OWN routine — echo, never extend or diagnose): ${P.preparation_notes || '(none provided — keep guidance general)'}`)
  L.push('')
  L.push('=== THIS CAMP ===')
  L.push(`${ctx.camp.name} — ${ctx.camp.dates} — at ${ctx.schoolName}`)
  L.push('')
  L.push('=== CONFIRMED EXTRACTION (human-verified; this is authoritative for the plan, constraints, travel, and timezone delta) ===')
  L.push(JSON.stringify(ctx.extraction, null, 2))
  L.push('')
  L.push('=== RAW INPUTS (for anything the extraction did not structure — e.g. a temperature/forecast) ===')
  L.push(`CAMP EMAIL:\n${ctx.inputs.camp_email_raw}`)
  L.push(`\nTRAVEL PROSE:\n${ctx.inputs.travel_prose}`)
  if (ctx.inputs.extra_notes?.trim()) L.push(`\nEXTRA NOTES:\n${ctx.inputs.extra_notes}`)
  L.push('')
  L.push(`=== FULL COACH THREAD (${ctx.contactLog.length} entries, oldest first — the ONLY source for Where You Stand and the rubric hunt; quote verbatim) ===`)
  if (ctx.contactLog.length === 0) L.push('No contact logged — this is a cold relationship.')
  for (const e of ctx.contactLog) {
    L.push(`[${e.date}] ${e.direction} via ${e.channel}${e.coach_name ? ` — ${e.coach_name}` : ''}${e.authored_by ? ` (authored_by=${e.authored_by})` : ''}${e.intent ? ` (intent=${e.intent})` : ''}`)
    L.push(e.summary ?? '(no body)')
    L.push('')
  }
  L.push('=== COACHES ON FILE (CRM — who the family corresponds with; primary relationship lives here, NOT in research) ===')
  for (const c of ctx.coaches) L.push(`- ${c.name} (${c.role ?? 'role?'})${c.is_primary ? ' [PRIMARY on file]' : ''}${c.email ? ` ${c.email}` : ''}`)
  L.push('')
  if (ctx.offers.length > 0) {
    L.push('=== OFFERS THIS SCHOOL ===')
    for (const o of ctx.offers) L.push(`- ${o.offer_type}: ${o.headline}${o.money_note ? ` (${o.money_note})` : ''} [${o.status}]`)
    L.push('')
  }
  L.push('=== RESEARCH (public facts; already source-validated — do not add on top) ===')
  if (ctx.research) {
    L.push(`status: ${ctx.researchStatus}`)
    L.push(JSON.stringify(ctx.research, null, 2))
  } else {
    L.push('NO CURRENT RESEARCH. Set the_staff and the_fit to null and say plainly in the document that program research was not available.')
  }
  L.push('')
  L.push('=== THE WHOLE LIST (for calibration — tiers/stages/offers across all active schools) ===')
  for (const s of ctx.schoolList) L.push(`- ${s.name}: tier ${s.tier}, stage ${s.stage}, ${s.status}${s.has_offer ? ', HAS OFFER' : ''}`)
  L.push('')
  L.push('Now produce the JSON document. Second person, honest, every quote verbatim, every hard constraint placed at its moment, deduped. Return ONLY the JSON.')
  return L.join('\n')
}
