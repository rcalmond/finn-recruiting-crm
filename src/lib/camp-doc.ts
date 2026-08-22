/**
 * camp-doc.ts
 *
 * Phase 5 — document generation. The judgment stage (Opus). Consumes a confirmed
 * camp extraction plus the full CRM thread, the player profile, and the whole-list
 * calibration context, and produces the structured CampDoc written TO the player.
 *
 * Phase 5.5 — SCOPE CUT. The document no longer reads school_research at all. Every
 * section now draws only from the CRM (thread, coaches, offers, list metadata), the
 * confirmed extraction, or a family-authored field (preparation_notes,
 * recruiting_preferences). Every defect in this build landed in a section that
 * ASSERTED facts about the outside world; the echo sections never failed. So the
 * derived sections were cut and the echo sections kept.
 *
 * DEFERRED TO v2 (not abandoned): THE FIT — attrition, profile gap, honest context.
 * When it returns it MUST derive its entities from structured research fields, and
 * MUST NEVER read entities out of research PROSE fields (see the absence-prose rule
 * documented in school-research.ts). That failure mode — parsing a summary/gap/
 * not_found_reason string for names — is exactly what got it cut.
 */

import type { CampExtraction, CampPrepInputs } from './camp-prep'
import type { ContactLogRow, CoachRow, OfferRow } from './school-context'

export const CAMP_DOC_MODEL = 'claude-opus-4-8'

/** The coach's actual new text sits at the top of raw_source; the tail is quoted
 *  thread history + HTML/signature noise. Collapse whitespace and cap so a 60k-char
 *  outlier can't blow the context — the quotable line is always near the top. */
const RAW_SOURCE_CAP = 2500
function cleanRawSource(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, RAW_SOURCE_CAP)
}

/** The family-facing local date of a message: sent_at converted to the home
 *  timezone (falls back to the stored date column). A 9:20pm-MT message stored as
 *  a 3:20am-UTC sent_at must show as the local calendar day, not the UTC one. */
export function localDate(sentAt: string | null, homeTz: string, fallback?: string | null): string {
  if (sentAt) { try { return new Date(sentAt).toLocaleDateString('en-CA', { timeZone: homeTz }) } catch { /* fall through */ } }
  return fallback ?? sentAt ?? ''
}

// ─── Plan-day dates → human labels (computed in code; the model never formats one) ──

/** Shift an ISO YYYY-MM-DD date by n days, staying on the calendar (UTC anchor, no tz drift). */
export function isoAddDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The human day-header: weekday + month + day (from the ISO calendar date, in the
 *  home timezone) followed by the short descriptor. e.g. "Saturday, Aug 15 — Camp Day 1".
 *  Noon-UTC anchor keeps a plain calendar date on its own day for every US timezone. */
export function formatPlanLabel(isoDate: string, descriptor: string, homeTz: string): string {
  let head = isoDate
  try {
    const d = new Date(`${isoDate}T12:00:00Z`)
    if (!isNaN(d.getTime())) {
      const wd = d.toLocaleDateString('en-US', { timeZone: homeTz, weekday: 'long' })
      const md = d.toLocaleDateString('en-US', { timeZone: homeTz, month: 'short', day: 'numeric' })
      head = `${wd}, ${md}`
    }
  } catch { /* fall back to the raw ISO date */ }
  const desc = (descriptor || '').trim()
  return desc ? `${head} — ${desc}` : head
}

/** Post-generation: write the code-computed fields. Called by the endpoint and the
 *  harness AFTER validation and BEFORE persist.
 *  - Plan-day `label` from `date` + `descriptor` (6.1) — never a model-formatted string.
 *  - Touchpoint `classification` from the evidence fields (6.2): a verbatim
 *    preceding-outbound quote → responsive; NO_PRIOR_MENTION → unprompted. The model
 *    never writes the label, so it cannot reason its way around the rule. */
export function finalizeCampDoc(doc: CampDoc, homeTz: string): CampDoc {
  for (const day of doc.the_plan ?? []) {
    day.label = formatPlanLabel(day.date, day.descriptor, homeTz)
  }
  for (const t of doc.where_you_stand?.coach_touchpoints ?? []) {
    t.classification = isNoPriorMention(t.preceding_outbound_quote) ? 'unprompted' : 'responsive'
  }
  return doc
}

/** Verification corpus for touchpoint evidence: family-local date → that day's
 *  OUTBOUND text (cleaned raw_source + summary, all outbounds on the date joined).
 *  The validator checks each preceding_outbound_quote appears verbatim in the corpus
 *  for its date — a quote that isn't in the source is the same class of failure as a
 *  fabricated coach quote. */
export function buildOutboundQuoteCorpus(contactLog: ContactLogRow[], homeTz: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const e of contactLog) {
    if (e.direction !== 'Outbound') continue
    const d = localDate(e.sent_at, homeTz, e.date)
    const text = [e.raw_source?.trim() ? cleanRawSource(e.raw_source) : '', e.summary ?? ''].filter(Boolean).join('\n')
    if (!text) continue
    map[d] = map[d] ? `${map[d]}\n${text}` : text
  }
  return map
}

// ─── Output schema ─────────────────────────────────────────────────────────────

export interface CampDocQuote { quote: string; who: string; when?: string | null }
// Phase 6.2: the model emits EVIDENCE, never the label. Three classification drifts
// (5.1, 5.6, and the Nov-28 reply reasoned into "unprompted") proved prose rules
// don't hold — so, as with day labels, the judgment moved into code. The model
// supplies preceding_outbound_date + preceding_outbound_quote (the family words that
// raised the topic, verbatim) or the marker NO_PRIOR_MENTION; finalizeCampDoc derives
// classification (quote → responsive; marker → unprompted), and the validator rejects
// a quote that isn't verbatim in that outbound's source.
export const NO_PRIOR_MENTION = 'NO_PRIOR_MENTION'
export function isNoPriorMention(s: unknown): boolean {
  return typeof s === 'string' && /^no[_\s]?prior[_\s]?mention$/i.test(s.trim())
}
export interface CampDocTouchpoint {
  date: string
  preceding_outbound_date: string | null        // date of the outbound this inbound replies to (null with NO_PRIOR_MENTION)
  preceding_outbound_quote: string              // verbatim family words that raised the topic, or NO_PRIOR_MENTION
  classification?: 'unprompted' | 'responsive'  // COMPUTED in finalizeCampDoc — the model never writes it
  quote: string | null                          // verbatim coach words from raw_source, or null if not quotable
  what: string                                  // what the message was
}
export interface CampDocDayBlock { time: string | null; activity: string; guidance: string }
// Phase 6.1: the model emits a DATE (ISO YYYY-MM-DD) + a short DESCRIPTOR only. It
// never writes a weekday or formats a date — the human `label` is computed in code
// from `date` in the player's home timezone (finalizeCampDoc), which is why weekday/
// date errors and leaked reasoning can no longer reach a user-facing string.
export interface CampDocDay { date: string; descriptor: string; label?: string; is_travel_day?: boolean; blocks: CampDocDayBlock[]; sleep: string; recovery?: string | null }
// Phase 5.5: credentials removed (research-derived). Angle + relationship come from
// the CRM thread and have been correct every run.
export interface CampDocStaff { name: string; role: string; your_angle?: string; primary_relationship?: boolean }

export interface CampDoc {
  masthead: { player: string; school: string; camp: string; dates: string; venue: string | null; surface: string | null; framing: string }
  where_you_stand: {
    read: string
    coach_touchpoints: CampDocTouchpoint[]   // every inbound coach message classified + cited
    relationship_opened_by: string           // low-information axis (usually the player)
    advancement: string                      // who has driven advancement — evidence-anchored to specific messages
    not_yet: string
    verdict: string
  }
  the_mission: { rubric_found: boolean; rubric_quote: CampDocQuote | null; mission: string; calibration: string }
  the_staff: CampDocStaff[] | null
  // the_fit removed in 5.5 — deferred to v2 (see header). Do NOT re-add without a
  // structured-fields-only source.
  the_plan: CampDocDay[]
  before_leaving: { coach_to_find: string; opening_line: string; next_step_question: string; follow_up: { who: string; reference: string; send_date: string } }
  footer: string
}

// Fail-closed read of the family-authored recruiting_preferences field. An EMPTY
// field (family wrote nothing) is NOT the same as a FAILED read (profile query
// errored). Calibration may state absence on 'empty'; on 'failed' it must not.
export interface PreferencesRead { status: 'ok' | 'empty' | 'failed'; value: string | null; reason?: string }

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

// Phase 5.5: the ~39k-token cross-thread declared-facts digest (extractDeclaredFacts)
// was removed from the generation path. A truncated parse had once returned an empty
// array that calibration turned into a confident "no top choice declared anywhere" —
// a derived claim about the outside world. Calibration now ECHOES the family-authored
// recruiting_preferences field instead (see PreferencesRead + the calibration rules
// in the system prompt), the one pattern in this build that has never broken.

// ─── Prompt builders ───────────────────────────────────────────────────────────

export function buildCampDocSystemPrompt(): string {
  return `You are Regista, the judgment engine of Throughball. You are writing a CAMP PREP DOCUMENT to a college-soccer recruit, in the second person ("you"), direct and honest. This is the judgment stage: you weigh, you decide, you tell the player the truth. You are NOT a hype machine.

You are given: the confirmed camp schedule + hard constraints + travel (already extracted and human-verified), the FULL coach thread from the CRM, the coaches on file, the player's profile, the family's own recruiting preferences, and the state of the whole school list. There is NO external program research in your inputs — do not reference, imply, or invent any. Produce ONE JSON document matching the schema at the end.

═══════════════════════════════════════════════════════════════════
ABSOLUTE FACT RULES
═══════════════════════════════════════════════════════════════════
- NO fabricated quotes, ever. Every coach quote must be VERBATIM from the provided thread. If you cannot quote it exactly, do not present it as a quote.
- Do not assert any coach, roster, record, alma-mater, tenure, or commit fact that is not in the provided thread. You have NO research feed — if a fact isn't in the thread, the extraction, or the family's own fields, you do not know it and must not state it.
- Do not fill gaps. Where the thread is thin, the document SAYS SO plainly rather than manufacturing.
- Written TO the player, second person. Honest over hyped.

═══════════════════════════════════════════════════════════════════
SECTIONS
═══════════════════════════════════════════════════════════════════
0. MASTHEAD — player, school, camp, dates, venue, surface, and a one-line framing of what this weekend is.

1. WHERE YOU STAND (read this first) — sourced ONLY from the thread. This section must DISCRIMINATE; a plausible summary judgment is a failure.
   - FOR EACH INBOUND (coach) message, coach_touchpoints carries EVIDENCE, not a judgment. You NEVER write "responsive" or "unprompted" — there is no classification field; the app computes the label from your evidence. For each inbound emit:
     * preceding_outbound_date — the date of the outbound (family) message immediately before this inbound.
     * preceding_outbound_quote — COPY VERBATIM, from that outbound's VERBATIM SOURCE (or its SUMMARY if it has no source), the family's words that raised the SUBJECT of this inbound. SUBJECT TEST (hard): the quoted words must actually ask about, request, or refer to the subject of the coach's MAIN content — the question being answered, the link being sent, the update being acknowledged, the event being discussed. A quote of general interest ("one of the programs I think about most") or an unrelated update does NOT raise a specific new offer.
     * If nothing in the preceding outbound raised the coach's main subject — the coach introduces a concrete invitation/offer/event the family never asked about or mentioned — write exactly NO_PRIOR_MENTION and set preceding_outbound_date to null, even though an outbound exists. Example: family sends reels + general interest; coach replies "Want to come out to our camp in May?" — camps were never raised → NO_PRIOR_MENTION. Counter-example: family asks "which camps will you be at this summer?"; coach says "Come to the August one" → camps were raised → quote the question.
     * plus the date, an optional verbatim coach quote from this message's VERBATIM SOURCE (else quote: null), and a short "what".
     The app derives the label mechanically: quote present → responsive; NO_PRIOR_MENTION → unprompted. Your quote is CHECKED against the outbound source — a preceding_outbound_quote that does not appear verbatim there FAILS validation, the same class of failure as a fabricated coach quote.
     ANSWERING PLUS A PUSH IS STILL AN ANSWER. When the coach ANSWERS what the family asked and additionally pushes a next step inside the answer (a cold intro asks "where are you in your process?" and the coach points at the standard form and ID clinic — that IS the answer to how their process works), the message is a reply: quote the family words it answers and put the push in "what" or the prose ("he used his reply to point you at the ID clinic"). A polite "thanks for the update" opener does NOT make a new, unasked-for offer responsive — classify by the MAIN content.
   - SEPARATE TWO AXES:
     * relationship_opened_by — who sent the first email. This is almost always the player and carries little information; state it in one clause and move on.
     * advancement — who has driven the RELATIONSHIP FORWARD: invitations, camp asks, next-step offers. This is the interesting finding. Anchor it to specific messages by date + quote.
   - DOWNSTREAM CONSISTENCY (hard): the read, advancement, the verdict, and the masthead framing must DERIVE FROM THE COMPUTED LABELS — i.e. from your own evidence fields — not from independent reasoning about the thread. The coach-initiated count is exactly the number of touchpoints you marked NO_PRIOR_MENTION. Every claim of coach initiative ("he reached out unprompted", "invited you twice") must cite the date of a NO_PRIOR_MENTION touchpoint that actually is what you claim (an invitation claim traces to actual invitations). You may write "every touchpoint has been you reaching out" ONLY IF ZERO touchpoints are NO_PRIOR_MENTION; responsive messages may be described as active pull ("he answers fast and pushes next steps in his replies") but never counted as coach-initiated outreach.
   - Name what has NOT happened yet (e.g. no pre-read, no roster-spot or recruiting-class language).
   - VERDICT: evaluating vs recruiting, and what this camp converts — consistent with the evidence above.

2. THE MISSION:
   - RUBRIC HUNT: scan the thread for any moment a coach said what they want to see. If found, quote it verbatim (set rubric_found true, put it in rubric_quote with who = the coach and when = the DATE of the source message, YYYY-MM-DD) and make it the mission. If not found, set rubric_found false and say so explicitly, then derive a mission from position, stage, and the camp format.
   - CALIBRATION: use BOTH the whole-list metadata (tiers/stages/offers — structured CRM data the app holds) AND the FAMILY'S OWN RECRUITING PREFERENCES field. State how to talk about this school relative to the others — what language is and isn't on the table, and any second-order effect (peer programs talk to each other). Follow the preferences field's status EXACTLY:
     * status ok (the family WROTE a preference): ECHO it and RESPECT the constraint it states. If the family named ANOTHER school as their top choice, do NOT coach the player to call THIS school #1 or use language that contradicts or supersedes that declaration — warm and true is fine. If the preference is about THIS school, being consistent with it (including #1 language) is honest. Do not go beyond what the field says.
     * status empty (the field is blank — the family has written no preference): state plainly that no preference is on record and instruct against manufacturing a ranking. This is a true statement about an empty field, NOT a claim about every thread.
     * status failed (the profile could not be read this run): you have NOT verified what the family declared. Do NOT assert absence and do NOT state or imply a ranking either way — give guidance that does not depend on the family's preferences, and note the preference could not be read this run if relevant. NEVER turn a failed read into "nothing has been declared."
     You may ALWAYS reference the whole-list metadata (tier/stage/offers) — that is structured CRM data, not inference. NEVER infer a ranking from thread content, and never invent a preference the family did not write.

GENERAL PRINCIPLE (§1 and §2): every comparative or asymmetry claim is evidence-anchored — tied to a specific message, offer, stage, or a field the family wrote — or it is not made. Do not produce a confident summary judgment when the specific evidence is available and unexamined, and never manufacture one from evidence you were not given.

3. THE STAFF — the coaches the family actually corresponds with, drawn from the CRM (coaches on file + thread). Per coach: name, role, and a "YOUR ANGLE" line tied to something REAL AND SPECIFIC IN THE THREAD (a message, a topic they raised, a shared reference). Identify the PRIMARY RELATIONSHIP from the thread (who actually emails the family) and set primary_relationship true on that coach. A coach with NO thread relationship gets name and role only — OMIT the your_angle field entirely (do NOT emit an empty string) and do NOT manufacture an angle for someone the family has never corresponded with. Do NOT state credentials, alma maters, tenure, or hire dates — you have no research feed and must not invent them. If there are no coaches on file, set the_staff to null.

4. THE PLAN — day by day, from the confirmed extraction, from the first affected day through the return travel day. SEE THE CONTENT DOMAIN BELOW — every day carries it. Each block has a time (or null), the activity, and "guidance": the sleep/nutrition/load/constraint instruction that belongs at THAT moment.
   - DAY IDENTITY — emit a DATE and a DESCRIPTOR, NOTHING ELSE. For each plan day set "date" to the exact ISO calendar date (YYYY-MM-DD) and "descriptor" to a SHORT category ONLY: "pre-travel", "travel day", "Camp Day 1", "Camp Day 2", "return travel", etc. DO NOT write a weekday, DO NOT format or spell out a date, and DO NOT put any reasoning, deliberation, or parenthetical in the descriptor — the app computes the human label (weekday, month, day) from the date. The descriptor is a label, not a sentence.
   - DATE ANCHORING (use the ANCHOR DATES block in the input; do not do calendar arithmetic in your head): the plan runs from TODAY through the RETURN TRAVEL day. Camp Day N is the Nth listed camp date. The travel-to-venue day is the day immediately before the first camp date. The return-travel day is the day immediately after the last camp date. Any prep/load day falls between today and the travel-to day. Assign each plan day the anchor date it corresponds to — never a guessed or off-by-one date.
   - A DATED COMPETING COMMITMENT NEVER SILENTLY DISAPPEARS: if its date is one of the plan days, it appears on that day; if its date falls BEFORE the first plan day, acknowledge it as accumulated load in the FIRST plan day's framing/guidance ("yesterday's round at Murphy Creek is in your legs") rather than dropping it. Only an UNDATED commitment stays off the dated days entirely (5.6 rule).
   - TRAVEL TIMES ARE ECHOES, NEVER INVENTIONS: a travel segment's time comes ONLY from the confirmed extraction. If a segment has a time in the extraction, you may state it. If a segment has NO time in the extraction, you MUST NOT state or invent one — write it open-ended, e.g. "afternoon flight home, time per your booking". Never manufacture a departure or arrival time, and never carry a time from one segment onto another.

5. BEFORE LEAVING / conversion mechanic:
   - The specific coach to find first and what to say (opening_line).
   - The direct next-step question to ask, phrased in the player's OWN voice (first person, natural, askable out loud).
   - Follow-up plan: who to email, what specific moment from the weekend to reference, and a concrete send date.

6. FOOTER — one closing charge line.

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
  * COMMITMENT DATES ARE AUTHORITATIVE, and only a DATE places a commitment on a day. A competing commitment may be assigned to a specific plan day ONLY if it carries a date (extraction "date" field) that matches that day. A commitment with a null/absent date is UNDATED — mention it in the pre-travel framing as load to respect ("a golf round the week before"), but do NOT place it on any specific dated block, and NEVER infer its day from a tee time, from the order commitments are listed, or from proximity to travel. If in doubt about the day, treat it as undated.
- preparation_notes: ECHO the family's own stated routine into the right moment. Do NOT infer, extend, diagnose, or originate any medical, rehab, or dietary protocol. If empty, guidance stays general. Reference whether an athletic trainer is on site (from the hard constraints) as a FACT, never as advice.

═══════════════════════════════════════════════════════════════════
HARD CONSTRAINTS -> THE PLAN (and DEDUPE)
═══════════════════════════════════════════════════════════════════
- EVERY hard constraint from the extraction must appear in the plan AT THE MOMENT IT MATTERS. A paper-form-only requirement belongs in the pack-the-night-before block, not a footnote. An unsupervised break belongs in that break's block. A "schedule runs late" caveat belongs where it changes behavior.
- DEDUPE: the extraction intentionally carries some facts in more than one place — a constraint may also be a schedule block (an optional family Q&A, a campus tour), and the breakfast window is duplicated into meal_windows. Each fact appears ONCE in the finished document, at the moment it matters. A constraint that maps to a scheduled block is expressed IN that block, not also listed separately.

Return ONLY the JSON document (no markdown fences, no commentary), matching the schema EXACTLY. Preserve the nesting: "where_you_stand" is ONE object that CONTAINS read, coach_touchpoints, relationship_opened_by, advancement, not_yet, and verdict — do NOT hoist those fields to the top level. Same for every nested object below.
Schema:
{
  "masthead": { "player": "...", "school": "...", "camp": "...", "dates": "...", "venue": "... or null", "surface": "... or null", "framing": "one line" },
  "where_you_stand": { "read": "the lead, 1-3 short paragraphs", "coach_touchpoints": [ { "date": "YYYY-MM-DD", "preceding_outbound_date": "YYYY-MM-DD or null", "preceding_outbound_quote": "the family's words that raised this topic, VERBATIM from that outbound's VERBATIM SOURCE (or SUMMARY if no source) — or exactly NO_PRIOR_MENTION", "quote": "verbatim coach words from this message's VERBATIM SOURCE or null", "what": "what it was" } ], "relationship_opened_by": "one clause", "advancement": "who has driven it forward, citing specific dates + quotes", "not_yet": "...", "verdict": "..." },
  "the_mission": { "rubric_found": true/false, "rubric_quote": { "quote": "...", "who": "...", "when": "YYYY-MM-DD of the source message" } or null, "mission": "...", "calibration": "..." },
  "the_staff": [ { "name": "...", "role": "...", "your_angle": "... (OMIT this field entirely for a coach with no thread relationship)", "primary_relationship": true/false } ] or null,
  "the_plan": [ { "date": "YYYY-MM-DD (exact anchor date; no weekday, no prose)", "descriptor": "short category only, e.g. 'travel day' or 'Camp Day 1' — never a sentence or a date", "is_travel_day": true/false, "blocks": [ { "time": "... or null", "activity": "...", "guidance": "the nutrition/sleep/load/constraint instruction for this moment" } ], "sleep": "lights-out + wake + body-clock equivalent for this night", "recovery": "... or null" } ],
  "before_leaving": { "coach_to_find": "...", "opening_line": "...", "next_step_question": "in the player's own first-person voice", "follow_up": { "who": "...", "reference": "...", "send_date": "..." } },
  "footer": "one closing charge line"
}`
}

export function buildCampDocUserPrompt(ctx: {
  today: string
  referenceDate: string                 // today, ISO YYYY-MM-DD, home tz — plan start anchor
  campDates: string[]                    // the camp's calendar dates, ISO, in order (Camp Day N = campDates[N-1])
  player: DocPlayerProfile
  camp: { name: string; dates: string }
  extraction: CampExtraction
  inputs: CampPrepInputs
  contactLog: ContactLogRow[]
  coaches: CoachRow[]
  offers: OfferRow[]
  schoolName: string
  schoolList: DocSchoolListItem[]
  preferences: PreferencesRead
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
  L.push('=== ANCHOR DATES (use these EXACT ISO dates for every plan day — do NOT compute your own) ===')
  L.push(`TODAY (earliest the plan can start): ${ctx.referenceDate}`)
  ctx.campDates.forEach((d, i) => L.push(`Camp Day ${i + 1}: ${d}`))
  if (ctx.campDates.length) {
    L.push(`Travel-to-venue day (day before Camp Day 1): ${isoAddDays(ctx.campDates[0], -1)}`)
    L.push(`Return-travel day (day after the last camp date): ${isoAddDays(ctx.campDates[ctx.campDates.length - 1], 1)}`)
  }
  L.push('Any prep/load day falls on or after TODAY and before the travel-to-venue day. Assign each plan day one of these dates in "date"; put only a short category in "descriptor".')
  L.push('')
  L.push('=== CONFIRMED EXTRACTION (human-verified; this is authoritative for the plan, constraints, travel, and timezone delta) ===')
  L.push(JSON.stringify(ctx.extraction, null, 2))
  L.push('')
  L.push('=== RAW INPUTS (for anything the extraction did not structure — e.g. a temperature/forecast) ===')
  L.push(`CAMP EMAIL:\n${ctx.inputs.camp_email_raw}`)
  L.push(`\nTRAVEL PROSE:\n${ctx.inputs.travel_prose}`)
  if (ctx.inputs.extra_notes?.trim()) L.push(`\nEXTRA NOTES:\n${ctx.inputs.extra_notes}`)
  L.push('')
  L.push(`=== FULL COACH THREAD (${ctx.contactLog.length} entries, oldest first — the ONLY source for Where You Stand and the rubric hunt) ===`)
  L.push('For each inbound (coach) message you may see a VERBATIM SOURCE — that is the coach\'s own raw words and is the ONLY thing you may put in quotation marks as a coach quote. For each OUTBOUND (family) message you may see a VERBATIM SOURCE too — copy preceding_outbound_quote EXACTLY from there (character for character; it is validated against this text). SUMMARY is our paraphrase: never quote a coach from a SUMMARY; use an outbound\'s SUMMARY for preceding_outbound_quote only when that outbound has no VERBATIM SOURCE.')
  const homeTz = ctx.player.home_timezone
  if (ctx.contactLog.length === 0) L.push('No contact logged — this is a cold relationship.')
  for (const e of ctx.contactLog) {
    L.push(`[${localDate(e.sent_at, homeTz, e.date)}] ${e.direction} via ${e.channel}${e.coach_name ? ` — ${e.coach_name}` : ''}${e.authored_by ? ` (authored_by=${e.authored_by})` : ''}${e.intent ? ` (intent=${e.intent})` : ''}`)
    L.push(`SUMMARY: ${e.summary ?? '(no body)'}`)
    if (e.direction === 'Inbound' && e.raw_source && e.raw_source.trim()) {
      L.push(`VERBATIM SOURCE (quote coach words only from here): ${cleanRawSource(e.raw_source)}`)
    } else if (e.direction === 'Outbound' && e.raw_source && e.raw_source.trim()) {
      L.push(`VERBATIM SOURCE (family's own words — copy preceding_outbound_quote exactly from here): ${cleanRawSource(e.raw_source)}`)
    }
    L.push('')
  }
  L.push('=== COACHES ON FILE (CRM — who the family corresponds with; primary relationship lives here, NOT in research) ===')
  for (const c of ctx.coaches) L.push(`- ${c.name} (${c.role ?? 'role?'})${c.isPrimary ? ' [PRIMARY on file]' : ''}${c.hidden ? ' [HIDDEN by the family — do not propose contacting]' : ''}${c.email ? ` ${c.email}` : ''}`)
  L.push('')
  if (ctx.offers.length > 0) {
    L.push('=== OFFERS THIS SCHOOL ===')
    for (const o of ctx.offers) L.push(`- ${o.offer_type}: ${o.headline}${o.money_note ? ` (${o.money_note})` : ''} [${o.status}]`)
    L.push('')
  }
  L.push('=== THE WHOLE LIST (for calibration — tiers/stages/offers across all active schools; structured CRM data) ===')
  for (const s of ctx.schoolList) L.push(`- ${s.name}: tier ${s.tier}, stage ${s.stage}, ${s.status}${s.has_offer ? ', HAS OFFER' : ''}`)
  L.push('')
  L.push('=== FAMILY RECRUITING PREFERENCES (authored BY THE FAMILY — the ONLY source of declared preference for calibration; ECHO it, never infer beyond it) ===')
  const pref = ctx.preferences
  if (pref.status === 'failed') {
    L.push(`READ FAILED (${pref.reason ?? 'unknown'}). The family's recruiting-preferences field could NOT be read this run. You MUST NOT assert that nothing has been declared and MUST NOT state or imply a ranking either way. Degrade: give calibration guidance that does not depend on the family's declared preferences, and note the preference could not be read this run if relevant. NEVER turn a failed read into "nothing has been declared."`)
  } else if (pref.status === 'empty') {
    L.push('EMPTY. The field is blank — the family has written no preference. You may state plainly that no preference is on record and instruct against manufacturing a ranking. This is a statement about an empty field, not a claim about every thread.')
  } else {
    L.push(pref.value ?? '')
    L.push('\nECHO the above and respect the constraint it states. Do not go beyond what it says; do not manufacture a ranking it does not state.')
  }
  L.push('')
  L.push('Now produce the JSON document. Second person, honest, every quote verbatim, every hard constraint placed at its moment, deduped. Return ONLY the JSON.')
  return L.join('\n')
}
