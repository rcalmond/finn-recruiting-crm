-- 007_schools_sort_order.sql
-- Add persistent sort_order to schools for manual priority ranking in the pipeline view.

-- 1. Add sort_order column
alter table public.schools add column sort_order integer;

-- 2. Backfill sort_order from current default order (category asc, name asc)
with ranked as (
  select id,
    row_number() over (order by category asc, name asc) as rn
  from public.schools
)
update public.schools
set sort_order = ranked.rn
from ranked
where public.schools.id = ranked.id;
