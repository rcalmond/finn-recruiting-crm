-- Migration 056: Add 'test_scores' to assets.type check constraint
-- For SAT score reports, AP score reports, and similar test documents.

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_type_check;
ALTER TABLE assets ADD CONSTRAINT assets_type_check
  CHECK (type IN (
    'resume', 'transcript', 'highlight_reel',
    'game_film', 'sports_recruits', 'link', 'other',
    'test_scores'
  ));
