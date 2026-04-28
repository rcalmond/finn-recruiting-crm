-- Migration 027: Add completed_at to action_items
--
-- Changes mark-complete from destructive DELETE to non-destructive UPDATE.
-- completed_at IS NULL = active item; completed_at IS NOT NULL = completed.
-- Partial index covers the "last 5 completed per school" query efficiently.

alter table public.action_items
  add column completed_at timestamptz;

-- Partial index for per-school completed items query (last 5 completed)
create index idx_action_items_completed
  on public.action_items (school_id, completed_at desc)
  where completed_at is not null;
