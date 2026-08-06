-- Seed: IIT conditional admission offer (July 23, 2026)
-- Run AFTER migration 058 is applied.

-- 1. Insert the offer
insert into school_offers (school_id, offer_type, headline, money_note, conditions, key_dates, status, received_on, note)
select
  id,
  'conditional_admission',
  'Conditional admission — Aerospace Engineering',
  '$25,000/yr Heald Scholarship, renewable annually; need-based aid TBD January',
  'Official transcript required to finalize',
  'FAFSA opens Oct 1 (school code 001691); official financial aid letter arrives January',
  'open',
  '2026-07-23',
  'Pre-read application counted as the official application — no CommonApp needed.'
from schools
where name ilike '%Illinois%Tech%' or name ilike '%Illinois Institute%'
limit 1;

-- 2. Promote IIT to recruiting_stage 5 (if not already there)
update schools
set recruiting_stage = 5
where (name ilike '%Illinois%Tech%' or name ilike '%Illinois Institute%')
  and recruiting_stage < 5;

-- 3. Add pre_read_passed milestone (if not already present)
insert into school_milestones (school_id, milestone, occurred_on, note)
select
  id,
  'pre_read_passed',
  '2026-07-23',
  'Conditional admission extended; pre-read application accepted as official application'
from schools
where (name ilike '%Illinois%Tech%' or name ilike '%Illinois Institute%')
  and id not in (
    select school_id from school_milestones
    where milestone = 'pre_read_passed'
  )
limit 1;
