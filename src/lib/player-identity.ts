/**
 * player-identity.ts — ONE derivation for player identity, used everywhere.
 *
 * The hardcoded-identity class ("FA", "Class of '27 · LWB", the DraftModal
 * subject literal) ends here: every surface that names the player derives from
 * the family's players row through these helpers.
 *
 * FALLBACK INVENTS NOTHING: with no player row, initials come from the
 * account's display name and the subtitle is omitted entirely — never a
 * placeholder class year or position.
 */

export interface PlayerIdentitySource {
  name?: string | null
  position?: string | null
  grad_year?: number | null
}

export interface PlayerIdentity {
  /** Avatar initials — player name first, else account display name, else empty. */
  initials: string
  /** "Class of '27 · Left Wingback" form; null when there is no player row
   *  (or the player has neither grad_year nor position). */
  subtitle: string | null
  hasPlayer: boolean
}

/** First letters of up to two words, uppercased. Empty in → empty out. */
export function initialsFrom(name: string | null | undefined): string {
  return (name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]!.toUpperCase())
    .join('')
}

export function getPlayerIdentity(
  player: PlayerIdentitySource | null | undefined,
  accountDisplayName?: string | null,
): PlayerIdentity {
  if (!player || !(player.name ?? '').trim()) {
    return { initials: initialsFrom(accountDisplayName), subtitle: null, hasPlayer: false }
  }
  const parts: string[] = []
  if (player.grad_year) parts.push(`Class of '${String(player.grad_year).slice(-2)}`)
  const position = (player.position ?? '').trim()
  if (position) parts.push(position)
  return {
    initials: initialsFrom(player.name),
    subtitle: parts.length > 0 ? parts.join(' · ') : null,
    hasPlayer: true,
  }
}

/**
 * The outreach subject line, derived — never templated from a name literal.
 * Segments with no data are omitted, not guessed.
 * With a real row this renders the house format:
 *   <name> | <position> | Class of <grad_year> | <school>
 */
export function buildOutreachSubject(
  player: PlayerIdentitySource | null | undefined,
  schoolName: string,
): string {
  const segments = [
    (player?.name ?? '').trim() || null,
    (player?.position ?? '').trim() || null,
    player?.grad_year ? `Class of ${player.grad_year}` : null,
    schoolName,
  ].filter(Boolean)
  return segments.join(' | ')
}
