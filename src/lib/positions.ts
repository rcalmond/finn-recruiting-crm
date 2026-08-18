/**
 * positions.ts — the controlled soccer position taxonomy (Profile v2, Amendment A).
 *
 * The visible labels ARE the stored values (players.position /
 * players.secondary_position hold these exact strings; existing rows conform).
 * Identity derivation (subtitle, subject line) shows the PRIMARY only.
 */

export const POSITION_GROUPS: { group: string; positions: string[] }[] = [
  { group: 'Goalkeeper', positions: ['Goalkeeper'] },
  { group: 'Defense',    positions: ['Center Back', 'Right Back', 'Left Back', 'Right Wingback', 'Left Wingback'] },
  { group: 'Midfield',   positions: ['Defensive Mid', 'Central Mid', 'Attacking Mid', 'Right Mid', 'Left Mid'] },
  { group: 'Attack',     positions: ['Right Winger', 'Left Winger', 'Striker'] },
]

export const ALL_POSITIONS: string[] = POSITION_GROUPS.flatMap(g => g.positions)

/**
 * Sport — the label is the stored value (same principle as positions).
 * Routes NOTHING yet: the men's catalog is the only catalog. The single
 * catalog-selection point carries TODO(womens-catalog).
 */
export const SPORTS = ["Men's soccer", "Women's soccer"] as const
export type Sport = (typeof SPORTS)[number]
export const DEFAULT_SPORT: Sport = "Men's soccer"

/** "men's soccer" / "women's soccer" copy fragment, honest to the player's sport.
 *  Null/unset (pre-v2 rows) reads as men's — the only catalog that exists. */
export function sportNoun(sport: string | null | undefined): string {
  return sport === "Women's soccer" ? "women's soccer" : "men's soccer"
}
