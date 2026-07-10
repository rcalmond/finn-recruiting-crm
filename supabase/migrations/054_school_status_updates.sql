-- Migration 054: Per-school status updates from Finn
--
-- Dated log of Finn's current state/intentions per school (camps, timing,
-- recruiting decisions). Each entry carries a share_with_coach flag that
-- gates whether the content may appear in generated outbound emails.
-- share='no' entries inform advice but MUST NOT leak into email content.

create table public.school_status_updates (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references schools(id) on delete cascade,
  body              text not null,
  share_with_coach  text not null default 'undecided',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index school_status_updates_school_created
  on school_status_updates (school_id, created_at desc);

create trigger school_status_updates_updated_at
  before update on school_status_updates
  for each row execute function public.set_updated_at();

alter table school_status_updates enable row level security;
create policy "auth users full access on school_status_updates"
  on school_status_updates for all to authenticated
  using (true) with check (true);
