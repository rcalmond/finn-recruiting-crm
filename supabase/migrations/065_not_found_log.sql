-- 065_not_found_log.sql
-- 404 logging (log-only; no notification this pass). Captures each not-found
-- render so INTERNAL 404s (authed user + internal referrer — the real-bug
-- signal) can later be distinguished from bot/typo noise. No admin view, digest,
-- or customer-facing surface is built here — logging only. A daily internal-404
-- email digest is a deliberately-deferred future admin-tooling item.

create table if not exists public.not_found_log (
  id          uuid primary key default gen_random_uuid(),
  path        text not null,
  referrer    text,
  user_id     uuid references auth.users(id) on delete set null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists not_found_log_created_at_idx on public.not_found_log (created_at desc);
create index if not exists not_found_log_user_id_idx     on public.not_found_log (user_id);

-- Writes come from the server (service-role) only; no client-side inserts.
-- RLS on with no policies => anon/authed clients get no access; service-role
-- (used by the /api/not-found-log route) bypasses RLS.
alter table public.not_found_log enable row level security;
