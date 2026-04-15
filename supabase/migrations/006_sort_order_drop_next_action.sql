-- 006_sort_order_drop_next_action.sql
-- Add persistent sort_order to action_items; drop stale next_action* columns from schools.
-- The action_items table is now the single source of truth for all action tracking.

-- 1. Add sort_order column
alter table public.action_items add column sort_order integer;

-- 2. Backfill sort_order: earliest due date first, nulls last, then created_at as tiebreaker
with ranked as (
  select id,
    row_number() over (
      order by
        case when due_date is null then 1 else 0 end,
        due_date asc,
        created_at asc
    ) as rn
  from public.action_items
)
update public.action_items
set sort_order = ranked.rn
from ranked
where public.action_items.id = ranked.id;

-- 3. Drop stale next_action columns from schools (data already exists in action_items per migration 004)
alter table public.schools
  drop column if exists next_action,
  drop column if exists next_action_owner,
  drop column if exists next_action_due;
