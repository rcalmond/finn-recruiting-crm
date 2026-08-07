-- Migration 060: player_scores — structured test-score block on player_profile
-- Scores are DATA, not documents. academic_summary holds them as free prose
-- ("scored 1380 on the SAT (Math 690, EBRW 690)... AP scores of 5 in Calculus
-- AB..."), which is awkward to render as structured numbers. This adds a small
-- canonical structured block on the athlete profile — the same table the LLM
-- prompt builders already read — so the Get Ready Test Scores card and any
-- future consumer read numbers, not parsed prose.
--
-- Shape (jsonb):
-- {
--   "sat": { "total": 1380, "math": 690, "ebrw": 690 },
--   "ap": [ { "subject": "Calculus AB", "score": 5 }, ... ],
--   "note": "optional — e.g. fall SAT retake planned"   // omit if none
-- }

alter table public.player_profile
  add column if not exists player_scores jsonb;

-- Seed the singleton row from the current academic_summary values.
-- (Real numbers, transcribed from player_profile.academic_summary.)
update public.player_profile
set player_scores = jsonb_build_object(
  'sat', jsonb_build_object('total', 1380, 'math', 690, 'ebrw', 690),
  'ap', jsonb_build_array(
    jsonb_build_object('subject', 'Calculus AB',     'score', 5),
    jsonb_build_object('subject', 'US History',      'score', 4),
    jsonb_build_object('subject', 'Human Geography', 'score', 4),
    jsonb_build_object('subject', 'Chemistry',       'score', 3)
  )
)
where player_scores is null;
