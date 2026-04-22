-- Migration 018: Gmail API integration
--
-- Adds:
--   1. gmail_tokens table — stores OAuth tokens for Finn's Gmail account.
--      Service role only; tokens must never be exposed to the client.
--   2. gmail_message_id / gmail_thread_id columns on contact_log — dedup
--      and threading for Gmail-sourced entries.

-- ── gmail_tokens ──────────────────────────────────────────────────────────────

create table public.gmail_tokens (
  id            uuid        primary key default gen_random_uuid(),
  user_email    text        not null unique,
  access_token  text        not null,
  refresh_token text        not null,
  expires_at    timestamptz not null,
  scope         text        not null,
  last_used_at  timestamptz default now(),
  last_sync_at  timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table public.gmail_tokens enable row level security;

-- Only the service role may read or write tokens.
-- Client-side code (anon key) is blocked entirely.
create policy "Service role manages gmail_tokens"
  on public.gmail_tokens
  for all
  using (auth.role() = 'service_role');

-- ── contact_log additions ─────────────────────────────────────────────────────

alter table public.contact_log
  add column gmail_message_id text default null,
  add column gmail_thread_id  text default null;

-- Partial indexes — only index the Gmail-sourced rows (a small subset).
create index contact_log_gmail_message_idx
  on public.contact_log (gmail_message_id)
  where gmail_message_id is not null;

create index contact_log_gmail_thread_idx
  on public.contact_log (gmail_thread_id)
  where gmail_thread_id is not null;
