-- 004_action_items.sql
-- Separate action_items table supporting up to 3 actions per school

create table if not exists public.action_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  action text not null,
  owner text check (owner in ('Finn', 'Randy') or owner is null),
  due_date date,
  created_at timestamptz not null default now()
);

alter table public.action_items enable row level security;

create policy "auth users full access on action_items"
  on public.action_items for all to authenticated
  using (true) with check (true);

alter publication supabase_realtime add table public.action_items;

-- Migrate existing next_action data from schools
insert into public.action_items (school_id, action, owner, due_date)
select
  id,
  next_action,
  case when next_action_owner in ('Finn', 'Randy') then next_action_owner else null end,
  next_action_due::date
from public.schools
where next_action is not null and trim(next_action) != '';
