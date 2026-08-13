/**
 * camp-doc-validate.ts
 *
 * Phase 6 — shape validation for a generated CampDoc, run BEFORE it is persisted to
 * prep_docs.content. This is a GUARD, not generation logic: it does not touch the
 * schema, the prompt, or how the document is produced. It exists because a run once
 * flattened where_you_stand (hoisting nested fields to the top level); a renderer that
 * silently tolerated that would drop sections and the family would never know. A
 * failure must look like a failure — so on mismatch the endpoint refuses to persist.
 *
 * Returns a list of human-readable path errors (empty = valid). Kept deliberately
 * strict on the fields the renderer depends on, lenient on prose content.
 */

import type { CampDoc } from './camp-doc'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
function parseableIso(s: unknown): boolean {
  return isStr(s) && ISO_DATE.test(s) && !isNaN(new Date(`${s}T12:00:00Z`).getTime())
}

/**
 * @param opts.planDateSpan when provided (endpoint/harness), every plan day's `date`
 *   must fall within [min, max] inclusive (first dated commitment / today → return
 *   travel). Omitted for the render-time defensive check (no anchor context there).
 */
export function validateCampDoc(doc: unknown, opts?: { planDateSpan?: { min: string; max: string } }): string[] {
  const e: string[] = []
  if (!isObj(doc)) return ['root: not an object']

  // ── masthead ──
  const m = doc.masthead
  if (!isObj(m)) e.push('masthead: missing or not an object')
  else {
    for (const k of ['player', 'school', 'camp', 'dates', 'framing']) if (!isStr(m[k])) e.push(`masthead.${k}: expected string`)
    for (const k of ['venue', 'surface']) if (m[k] !== null && !isStr(m[k])) e.push(`masthead.${k}: expected string or null`)
  }

  // ── where_you_stand (the section the flatten bug destroyed) ──
  const w = doc.where_you_stand
  if (!isObj(w)) e.push('where_you_stand: missing or not an object')
  else {
    for (const k of ['read', 'relationship_opened_by', 'advancement', 'not_yet', 'verdict']) if (!isStr(w[k])) e.push(`where_you_stand.${k}: expected string (flatten/hoist?)`)
    if (!Array.isArray(w.coach_touchpoints)) e.push('where_you_stand.coach_touchpoints: expected array')
    else w.coach_touchpoints.forEach((t, i) => {
      if (!isObj(t)) { e.push(`coach_touchpoints[${i}]: not an object`); return }
      if (!isStr(t.date)) e.push(`coach_touchpoints[${i}].date: expected string`)
      if (t.classification !== 'unprompted' && t.classification !== 'responsive') e.push(`coach_touchpoints[${i}].classification: expected 'unprompted'|'responsive'`)
      if (t.quote !== null && !isStr(t.quote)) e.push(`coach_touchpoints[${i}].quote: expected string or null`)
      if (!isStr(t.what)) e.push(`coach_touchpoints[${i}].what: expected string`)
    })
  }

  // ── the_mission ──
  const mi = doc.the_mission
  if (!isObj(mi)) e.push('the_mission: missing or not an object')
  else {
    if (typeof mi.rubric_found !== 'boolean') e.push('the_mission.rubric_found: expected boolean')
    for (const k of ['mission', 'calibration']) if (!isStr(mi[k])) e.push(`the_mission.${k}: expected string`)
    if (mi.rubric_quote !== null) {
      if (!isObj(mi.rubric_quote)) e.push('the_mission.rubric_quote: expected object or null')
      else { if (!isStr(mi.rubric_quote.quote)) e.push('the_mission.rubric_quote.quote: expected string'); if (!isStr(mi.rubric_quote.who)) e.push('the_mission.rubric_quote.who: expected string') }
    }
  }

  // ── the_staff (null OR array) ──
  const st = doc.the_staff
  if (st !== null) {
    if (!Array.isArray(st)) e.push('the_staff: expected array or null')
    else st.forEach((c, i) => {
      if (!isObj(c)) { e.push(`the_staff[${i}]: not an object`); return }
      if (!isStr(c.name)) e.push(`the_staff[${i}].name: expected string`)
      if (!isStr(c.role)) e.push(`the_staff[${i}].role: expected string`)
      if ('your_angle' in c && !isStr(c.your_angle)) e.push(`the_staff[${i}].your_angle: expected string when present`)
    })
  }

  // ── the_plan ──
  const pl = doc.the_plan
  if (!Array.isArray(pl)) e.push('the_plan: expected array')
  else pl.forEach((d, i) => {
    if (!isObj(d)) { e.push(`the_plan[${i}]: not an object`); return }
    // Phase 6.1: the model emits date + descriptor; the human label is code-computed.
    if (!parseableIso(d.date)) e.push(`the_plan[${i}].date: expected an ISO YYYY-MM-DD date (got ${JSON.stringify(d.date)})`)
    else if (opts?.planDateSpan && (String(d.date) < opts.planDateSpan.min || String(d.date) > opts.planDateSpan.max)) {
      e.push(`the_plan[${i}].date: ${d.date} is outside the plan span ${opts.planDateSpan.min}…${opts.planDateSpan.max}`)
    }
    if (!isStr(d.descriptor) || !d.descriptor.trim()) e.push(`the_plan[${i}].descriptor: expected a non-empty short category`)
    else if (d.descriptor.length > 60) e.push(`the_plan[${i}].descriptor: too long (${d.descriptor.length} chars) — should be a short category, not prose`)
    if (!isStr(d.sleep)) e.push(`the_plan[${i}].sleep: expected string`)
    if (!Array.isArray(d.blocks)) e.push(`the_plan[${i}].blocks: expected array`)
    else d.blocks.forEach((b, j) => {
      if (!isObj(b)) { e.push(`the_plan[${i}].blocks[${j}]: not an object`); return }
      if (b.time !== null && !isStr(b.time)) e.push(`the_plan[${i}].blocks[${j}].time: expected string or null`)
      if (!isStr(b.activity)) e.push(`the_plan[${i}].blocks[${j}].activity: expected string`)
      if (!isStr(b.guidance)) e.push(`the_plan[${i}].blocks[${j}].guidance: expected string`)
    })
  })

  // ── before_leaving ──
  const bl = doc.before_leaving
  if (!isObj(bl)) e.push('before_leaving: missing or not an object')
  else {
    for (const k of ['coach_to_find', 'opening_line', 'next_step_question']) if (!isStr(bl[k])) e.push(`before_leaving.${k}: expected string`)
    if (!isObj(bl.follow_up)) e.push('before_leaving.follow_up: expected object')
    else for (const k of ['who', 'reference', 'send_date']) if (!isStr((bl.follow_up as Obj)[k])) e.push(`before_leaving.follow_up.${k}: expected string`)
  }

  // ── footer ──
  if (!isStr(doc.footer)) e.push('footer: expected string')

  return e
}

/** Narrowing helper for callers that have already validated. */
export function asCampDoc(doc: unknown): CampDoc {
  return doc as CampDoc
}
