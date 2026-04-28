-- Migration 028: Add RQ tracking date and video tracking columns to schools
--
-- rq_updated_at: tracks when rq_status was last set to "Completed"
-- last_video_*: tracks the most recent YouTube video sent to this school

alter table public.schools
  add column rq_updated_at timestamptz;

alter table public.schools
  add column last_video_url text,
  add column last_video_title text,
  add column last_video_sent_at timestamptz;
