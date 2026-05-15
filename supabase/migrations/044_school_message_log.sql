-- Migration 044: School message log
--
-- Tracks which inventory messages have been communicated to which schools.
-- Populated automatically by the message coverage detector on outbound
-- contact_log ingest, and manually via future UI.

create table public.school_message_log (
  id                uuid primary key default gen_random_uuid(),
  message_id        uuid not null references messages(id) on delete cascade,
  school_id         uuid not null references schools(id) on delete cascade,
  contact_log_id    uuid references contact_log(id) on delete set null,
  detected_at       timestamptz not null default now(),
  detection_source  text not null default 'auto'
                    check (detection_source in ('auto', 'manual')),
  notes             text,
  created_at        timestamptz not null default now(),
  unique (message_id, school_id, contact_log_id)
);

create index school_message_log_message_idx
  on school_message_log(message_id);
create index school_message_log_school_idx
  on school_message_log(school_id);
create index school_message_log_contact_log_idx
  on school_message_log(contact_log_id);

alter table school_message_log enable row level security;
create policy "Authenticated users full access"
  on school_message_log for all
  using (auth.role() = 'authenticated');
