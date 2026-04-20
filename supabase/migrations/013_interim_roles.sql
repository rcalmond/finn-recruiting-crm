-- 013_interim_roles.sql
-- Adds 'Interim Head Coach' and 'Interim Assistant Coach' as first-class role values.
-- Drops and recreates the role check constraint.

alter table public.coaches
  drop constraint if exists coaches_role_check;

alter table public.coaches
  add constraint coaches_role_check
  check (role in (
    'Head Coach',
    'Interim Head Coach',
    'Associate Head Coach',
    'Assistant Coach',
    'Interim Assistant Coach',
    'Other'
  ));
