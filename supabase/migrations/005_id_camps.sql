-- 005_id_camps.sql
-- Add up to 3 ID camp dates per school

alter table public.schools
  add column if not exists id_camp_1 date,
  add column if not exists id_camp_2 date,
  add column if not exists id_camp_3 date;
