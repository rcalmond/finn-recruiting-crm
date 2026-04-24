-- Migration 023: Inbound email classification
-- Apply manually via Supabase dashboard → SQL editor → Run
-- This project does not use automated migration tooling.
--
-- After running, verify with:
--   select authored_by, intent, count(*) from public.contact_log
--   where direction = 'Inbound' group by 1, 2 order by 3 desc;
--
--   select classification_confidence, count(*) from public.contact_log
--   where direction = 'Inbound' and classified_at is not null
--   group by 1;
--
-- Changes:
--   Adds five classification columns to contact_log (all nullable, no defaults).
--   authored_by: who wrote the email (coach personally vs. platform vs. automated)
--   intent: what action (if any) this email requires from Finn
--   classification_confidence: Haiku's certainty level
--   classification_notes: Haiku's reasoning (≤200 chars)
--   classified_at: timestamp of last classification (null = unclassified)
--
--   These columns drive the Today "Awaiting your reply" filter:
--   only coach_personal/coach_via_platform × requires_reply rows surface as
--   actionable. Camp invites (requires_action), FYIs (informational), acks
--   (acknowledgement), and declines (decline) are excluded from the reply queue.

alter table public.contact_log
  add column if not exists authored_by text
  check (authored_by in (
    'coach_personal',    -- coach wrote this specifically for Finn
    'coach_via_platform',-- coach clicked reply in SR/FieldLevel/etc.
    'team_automated',    -- no human wrote it (blast, auto-reply, questionnaire bot)
    'staff_non_coach',   -- admin/coordinator/registrar/ops
    'unknown'
  ));

alter table public.contact_log
  add column if not exists intent text
  check (intent in (
    'requires_reply',    -- question, explicit ask, active conversation
    'requires_action',   -- RSVP, send doc, fill form (not a reply)
    'informational',     -- FYI / schedule update / tracking you
    'acknowledgement',   -- "got your message, thanks" — no ask
    'decline',           -- not on our list / program full
    'unknown'
  ));

alter table public.contact_log
  add column if not exists classification_confidence text
  check (classification_confidence in ('high', 'medium', 'low'));

alter table public.contact_log
  add column if not exists classification_notes text;

alter table public.contact_log
  add column if not exists classified_at timestamptz;

comment on column public.contact_log.authored_by is
  'Who wrote this email: coach_personal, coach_via_platform, team_automated, staff_non_coach, unknown';

comment on column public.contact_log.intent is
  'What action (if any) this email requires: requires_reply, requires_action, informational, acknowledgement, decline, unknown';

comment on column public.contact_log.classification_confidence is
  'Haiku classifier confidence: high (clear signal), medium (some ambiguity), low (needs human review)';

comment on column public.contact_log.classified_at is
  'When this row was last classified by Haiku. null = never classified.';

-- Partial index for the classification review UI (low-confidence inbounds)
create index if not exists contact_log_classification_review_idx
  on public.contact_log (classified_at)
  where direction = 'Inbound'
    and classification_confidence = 'low';
