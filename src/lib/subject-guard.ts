/**
 * subject-guard.ts — ENFORCE IDENTITY IN CODE, DON'T ASK FOR IT IN PROSE.
 *
 * On 2026-08-19 the draft prompt carried a CORRECTLY templated subject for the
 * family ("Test McT | Defensive Mid | Class of 2029 | …") and the model emitted
 * "Finn Almond | Left Wingback | Class of 2027 | …" anyway, because a dozen
 * persona instructions elsewhere in the same prompt outweighed one example.
 *
 * The lesson generalizes: where identity can be enforced structurally, enforce
 * it. The subject line is structured, so it is COMPUTED from the family's
 * player row and the model's version is treated as evidence, never as content.
 *
 * A mismatch that NAMES SOMEONE ELSE is surfaced as a failure — it means the
 * persona leaked, and the body (which cannot be enforced this way) is suspect.
 */

export interface SubjectGuardResult {
  /** Always the code-computed subject. The model's is never passed through. */
  subject: string
  /** Set when the model proposed a subject that does not name this player. */
  identityWarning?: string
}

/** Normalize for comparison only — never for output. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function enforceSubject(
  modelSubject: string | undefined,
  canonicalSubject: string,
  playerName: string | null,
): SubjectGuardResult {
  const result: SubjectGuardResult = { subject: canonicalSubject }
  if (!modelSubject || !playerName) return result

  const proposed = norm(modelSubject)
  const first = norm(playerName).split(' ')[0]

  // The model naming this player (in any arrangement) is fine — we still use
  // ours. The failure case is a subject that names somebody else entirely.
  if (first && proposed.includes(first)) return result

  result.identityWarning =
    `The draft model proposed a subject that does not name ${playerName}: ` +
    `"${modelSubject}". The subject was replaced with the correct one, but the ` +
    `BODY may also carry the wrong identity — read it before sending.`
  console.error(
    `[identity-guard] subject mismatch — expected a subject naming "${playerName}", ` +
    `model proposed "${modelSubject}". Replaced with "${canonicalSubject}".`
  )
  return result
}
