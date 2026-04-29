-- Migration 031: Daily selection tracking for Today's top 3
--
-- selected_for_today_at marks which items were chosen for Today's tactical zone.
-- Selection locks for the day — handled items are removed but not replaced.
-- Fresh selection computes on first visit each new Mountain-time day.

alter table public.contact_log
  add column selected_for_today_at timestamptz;

alter table public.action_items
  add column selected_for_today_at timestamptz;

create index idx_contact_log_today_selected
  on public.contact_log (selected_for_today_at)
  where selected_for_today_at is not null;

create index idx_action_items_today_selected
  on public.action_items (selected_for_today_at)
  where selected_for_today_at is not null;
