-- Migration 058: school_offers table
-- Tracks offers, conditional admissions, pre-read outcomes, and endgame terms.

create table school_offers (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  offer_type      text not null,
    -- 'conditional_admission' | 'admission' | 'roster_spot' | 'preread_positive' | 'other'
  headline        text not null,
  money_note      text,
  conditions      text,
  key_dates       text,
  status          text not null default 'open',
    -- 'open' | 'accepted' | 'declined' | 'expired'
  received_on     date,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Index for FK usage (school detail lookups)
create index school_offers_school_id_idx on school_offers(school_id);

-- updated_at trigger (house pattern)
create trigger set_updated_at
  before update on school_offers
  for each row execute function moddatetime(updated_at);

-- RLS: authenticated users full access (house idiom)
alter table school_offers enable row level security;

create policy "auth users full access on school_offers"
  on school_offers for all to authenticated
  using (true) with check (true);

-- Realtime publication
alter publication supabase_realtime add table school_offers;
