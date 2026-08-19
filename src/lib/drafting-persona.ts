/**
 * drafting-persona.ts — WHO the generators write as.
 *
 * Every builder that writes AS the player takes identity from the family's
 * players row through this module. Nothing about a player is a literal any
 * more: on 2026-08-19 a second family's draft introduced their child as "Finn
 * Almond, a 2027 left wingback at Albion SC Boulder County" — name, position,
 * grad year and club all belonging to another family's son.
 *
 * Shaped after camp-doc.ts (DocPlayerProfile): a typed profile, conditional
 * emission, and an HONEST fallback when a field is absent. One pattern, not two.
 *
 * THE CLUB CONTRACT is binding and quoted from the column comment:
 *   "The player's club team as they want it named to coaches. Family-authored.
 *    Generators ECHO it and MUST NOT infer, abbreviate, or invent a club when
 *    empty — an empty club means the draft omits the credential entirely."
 *
 * AGE IS DERIVED from grad_year and never stored.
 */

export interface PersonaSource {
  name?: string | null
  position?: string | null
  grad_year?: number | null
  club?: string | null
  /** Optional, read only to DERIVE biography (e.g. a recorded position change).
   *  Never used to assert a fact the family did not write. */
  highlights?: string | null
  current_stats?: string | null
}

export interface DraftingPersona {
  name: string
  firstName: string
  position: string | null
  gradYear: number | null
  club: string | null
  /** "high school senior" etc., derived from grad_year against the current year. */
  schoolYear: string | null
  /** True when we know enough to write as this player at all. */
  isComplete: boolean
}

/** Grad year → school-year descriptor. Derived, never stored.
 *  A US graduating class of Y is: senior during Y-1→Y, junior Y-2→Y-1, etc.
 *  Academic years roll in August, which is when recruiting mail is written. */
export function schoolYearFromGradYear(gradYear: number | null | undefined, now = new Date()): string | null {
  if (!gradYear) return null
  const academicYearEnd = now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear()
  const yearsOut = gradYear - academicYearEnd
  if (yearsOut < 0) return null                       // already graduated — say nothing
  if (yearsOut === 0) return 'high school senior'
  if (yearsOut === 1) return 'high school junior'
  if (yearsOut === 2) return 'high school sophomore'
  if (yearsOut === 3) return 'high school freshman'
  return null                                          // further out than we can honestly name
}

export function buildDraftingPersona(row: PersonaSource | null | undefined, now = new Date()): DraftingPersona {
  const name = (row?.name ?? '').trim()
  const position = (row?.position ?? '').trim() || null
  const club = (row?.club ?? '').trim() || null
  const gradYear = row?.grad_year ?? null
  return {
    name,
    firstName: name ? name.split(/\s+/)[0] : '',
    position,
    gradYear,
    club,
    schoolYear: schoolYearFromGradYear(gradYear, now),
    isComplete: name.length > 0,
  }
}

/** "Test McT, a 2029 defensive mid at Riverside SC" — every segment optional.
 *  The club is OMITTED when empty; it is never inferred or abbreviated. */
export function personaIdentityLine(p: DraftingPersona): string {
  const bits: string[] = []
  if (p.gradYear) bits.push(`${p.gradYear}`)
  if (p.position) bits.push(p.position.toLowerCase())
  const descriptor = bits.length > 0 ? `a ${bits.join(' ')}` : 'a player'
  return p.club ? `${p.name}, ${descriptor} at ${p.club}` : `${p.name}, ${descriptor}`
}

/** The credential rule for the email body. Only names credentials we HAVE. */
export function personaCredentialRule(p: DraftingPersona): string {
  const have: string[] = []
  if (p.position) have.push(`position (${p.position})`)
  if (p.gradYear) have.push(`grad year (${p.gradYear})`)
  if (p.club) have.push(`club (${p.club})`)
  if (have.length === 0) {
    return '- Do not state position, grad year, or club — none are on record. Never invent them.'
  }
  const omitted: string[] = []
  if (!p.position) omitted.push('position')
  if (!p.gradYear) omitted.push('grad year')
  if (!p.club) omitted.push('club')
  const omitClause = omitted.length > 0
    ? ` Do NOT mention ${omitted.join(' or ')} — not on record, and it must never be inferred, abbreviated, or invented.`
    : ''
  return `- Always include ${have.join(', ')}.${omitClause}`
}

/** The voice descriptor: "a high school senior" when derivable, else neutral. */
export function personaVoiceDescriptor(p: DraftingPersona): string {
  return p.schoolYear
    ? `${p.firstName} is a ${p.schoolYear} writing to a college soccer coach`
    : `${p.firstName} is a high-school-age player writing to a college soccer coach`
}
