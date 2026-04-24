-- 024b_campaigns_data_migration.sql
-- Data migration: create Wingback and RQ campaigns from existing action_items +
-- contact_log history, then delete the 78 migrated action_items rows.
--
-- PREREQUISITE: Migration 024 (campaign_templates, campaigns, campaign_schools)
-- must be applied before running this script.
--
-- Run via Supabase dashboard → SQL editor → Run.
-- Entire script is wrapped in a single transaction — if any step fails, the
-- whole thing rolls back and nothing is touched.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PROTECTED ONE-OFFS — these action_items MUST NOT be migrated or deleted:
--
--   debcecec-b39a-4a70-b0f0-bc055734c5e3  -- Check for new HC (Mines)
--   47b69e2e-2e01-43bf-b4f7-f9d2f3b2490d  -- Reply to "Let's connect in May"
--   938b5a13-aa2c-4faa-bbc9-d114f9031050  -- MLS NEXT Fest + Recruiting questionaire note
--   46cbae05-aeb6-409e-b987-9de1af0e1d74  -- Update RQ, due 2026-05-29 (Mines, outlier)
--
-- If any of these IDs appear in the WINGBACK or RQ UUID arrays below, STOP —
-- the script was misconfigured. They are not referenced in either array.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Expected outcome:
--   campaign_templates: 2 rows
--   campaigns:          2 rows (both status='draft')
--   campaign_schools:   78 rows total
--     wingback:         40 rows (~20 sent, ~20 pending based on contact_log matches)
--     rq:              38 rows (all pending — RQ sends have not gone out yet)
--   action_items:       4 rows remaining (the 4 protected one-offs above)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── Fixed IDs (declared as CTEs for readability) ─────────────────────────────
-- Using stable UUIDs so the script is reviewable and the IDs are predictable.

do $$
declare
  wb_tmpl_id    uuid := 'c4mp0001-0000-4000-8000-000000000001';
  rq_tmpl_id    uuid := 'c4mp0001-0000-4000-8000-000000000002';
  wb_camp_id    uuid := 'c4mp0002-0000-4000-8000-000000000001';
  rq_camp_id    uuid := 'c4mp0002-0000-4000-8000-000000000002';

  wb_sent       int;
  wb_pending    int;
  rq_pending    int;
  ai_remaining  int;

begin

  -- ── 1. Templates ────────────────────────────────────────────────────────────
  --
  -- Wingback template synthesized from ~20 full sends in contact_log (Apr 2026).
  -- Common structure: personalized salutation → core intro with position/club →
  -- school-specific detail → closer. School-specific text replaced with
  -- placeholders; Finn should personalize each draft before sending.
  --
  -- RQ template is a TODO placeholder — no sufficient historical RQ sends were
  -- found in contact_log to synthesize from (Finn has not sent RQ update emails
  -- yet; the 38 action_items are the planned sends). Finn must author the RQ
  -- body in the campaign UI before activating.

  insert into campaign_templates (id, name, body, created_at, updated_at) values
  (
    wb_tmpl_id,
    'Wingback update — April 2026 v1',
    E'Coach {{coach_last_name}},\n\nI wanted to follow up and share an update heading into the spring.\n\nI''m Finn Almond, a 2027 left wingback with Albion SC Colorado MLS NEXT Academy — one of the top U19 MLS NEXT academies in the country. {{school_name}}''s program is one I''ve had on my list, and I''m continuing to follow your season closely.\n\n[Finn: add school-specific note — prior meeting, program detail, or specific reason for interest]\n\nA quick update on my season:\n- Starting left wingback for Albion SC Colorado MLS NEXT U19\n- [Finn: add current stats, highlights, or recent results]\n\nI''d love to stay on your radar as you build your 2027 class. Happy to share video or answer any questions you have.\n\nFinn Almond\nClass of 2027 | Left Wingback\nAlbion SC Colorado MLS NEXT Academy\nfinnalmond08@gmail.com',
    now(),
    now()
  ),
  (
    rq_tmpl_id,
    'RQ update — spring 2026 v1',
    E'TODO: Finn to author RQ template before activating.\n\nMigration found insufficient historical sends to synthesize from — the 38 action_items in this campaign represent planned outbound sends, not completed ones.\n\nSuggested structure:\n\nCoach {{coach_last_name}},\n\nI wanted to follow up — I''ve completed {{school_name}}''s recruiting questionnaire and wanted to make sure you received it.\n\n[Finn: add any specific details about the RQ submission or program interest]\n\nFinn Almond\nClass of 2027 | Left Wingback\nAlbion SC Colorado MLS NEXT Academy\nfinnalmond08@gmail.com',
    now(),
    now()
  );

  -- ── 2. Campaigns ────────────────────────────────────────────────────────────

  insert into campaigns (id, name, template_id, status, tier_scope, throttle_days, created_at) values
  (
    wb_camp_id,
    'Wingback update — April 2026',
    wb_tmpl_id,
    'draft',
    array['A','B'],
    7,
    now()
  ),
  (
    rq_camp_id,
    'RQ update — spring 2026',
    rq_tmpl_id,
    'draft',
    array['A','B'],
    7,
    now()
  );

  -- ── 3. Wingback campaign_schools ────────────────────────────────────────────
  --
  -- For each of the 40 wingback action_item school_ids:
  --   - Find the most recent matching outbound contact_log entry within 60 days
  --     (school_id match + direction=Outbound + summary ilike '%wingback%').
  --     Partial sends (gmail_message_id IS NULL) are valid matches.
  --   - If matched: status='sent', sent_at=contact_log.date, contact_log_id=row id.
  --   - If not matched: status='pending', sent_at=null, contact_log_id=null.
  --   - coach_id: current primary coach (is_primary=true), or null if none.

  insert into campaign_schools
    (campaign_id, school_id, coach_id, status, sent_at, contact_log_id)
  with
    wingback_action_schools as (
      select school_id
      from action_items
      where action ilike '%wingback%'
    ),
    wb_sends as (
      -- Most recent matching outbound per school (includes gmail_message_id IS NULL)
      select distinct on (cl.school_id)
        cl.school_id,
        cl.id           as contact_log_id,
        cl.date::timestamptz as sent_at
      from contact_log cl
      where cl.school_id in (select school_id from wingback_action_schools)
        and cl.direction = 'Outbound'
        and cl.summary ilike '%wingback%'
        and cl.date >= (current_date - interval '60 days')
      order by cl.school_id, cl.date desc
    ),
    primary_coaches as (
      select distinct on (c.school_id)
        c.school_id,
        c.id as coach_id
      from coaches c
      where c.is_primary = true
        and c.school_id in (select school_id from wingback_action_schools)
      order by c.school_id, c.sort_order asc nulls last, c.created_at asc
    )
  select
    wb_camp_id,
    was.school_id,
    pc.coach_id,
    case when wbs.contact_log_id is not null then 'sent' else 'pending' end,
    wbs.sent_at,
    wbs.contact_log_id
  from wingback_action_schools was
  left join wb_sends   wbs on was.school_id = wbs.school_id
  left join primary_coaches pc on was.school_id = pc.school_id;

  -- ── 4. RQ campaign_schools ──────────────────────────────────────────────────
  --
  -- All 38 RQ schools land as pending. No matching outbound RQ sends were found
  -- in contact_log within the 60-day window — Finn has not sent these emails yet.
  -- The 38 action_items were the planned sends; this campaign now tracks them.
  --
  -- The May 29 outlier (46cbae05) is excluded — it stays in action_items.

  insert into campaign_schools
    (campaign_id, school_id, coach_id, status, sent_at, contact_log_id)
  with
    rq_action_schools as (
      select school_id
      from action_items
      where (action ilike '%RQ%' or action ilike '%recruiting questionnaire%')
        and id <> '46cbae05-aeb6-409e-b987-9de1af0e1d74'
    ),
    primary_coaches as (
      select distinct on (c.school_id)
        c.school_id,
        c.id as coach_id
      from coaches c
      where c.is_primary = true
        and c.school_id in (select school_id from rq_action_schools)
      order by c.school_id, c.sort_order asc nulls last, c.created_at asc
    )
  select
    rq_camp_id,
    ras.school_id,
    pc.coach_id,
    'pending',
    null::timestamptz,
    null::uuid
  from rq_action_schools ras
  left join primary_coaches pc on ras.school_id = pc.school_id;

  -- ── 5. Delete migrated action_items ─────────────────────────────────────────
  --
  -- Explicit UUID arrays — no regex. Generated at migration-authoring time
  -- from: select id from action_items where action ilike '%wingback%' order by created_at;
  -- and:  select id from action_items where (action ilike '%RQ%'...) and id <> '46cbae05...'
  --
  -- WINGBACK (40 rows):

  delete from action_items where id = any(array[
    '595fb00b-7652-4354-be82-06487f55baee',
    '9c4a7003-f9e0-4d86-8e86-20554d36235c',
    '4eedd2ac-9409-4c89-8d54-b3d0faaa4945',
    'a58a614c-89b0-4933-a546-876c3f1130f7',
    '6baadf24-dc7c-4da3-9ff4-41d80ea1d6ff',
    'f7b51251-c743-419b-b128-bb6a552810d0',
    '3362416a-e6f9-4630-92b3-409af5400386',
    'b3e1f1e1-c296-4bd3-a1b2-3d679afac533',
    '63f3c84a-bf03-4916-b550-9cecb7f4d52a',
    'ae5f80df-582d-4a0f-bb23-50eb7bd6bd2e',
    '67ab507d-9c54-4362-a2e3-f4cdb7fe1a59',
    '2b6ac8ef-76e8-42ae-b0f5-2fac4b64e496',
    '2841e047-aa3b-4be3-8a46-d1fcd1a036cc',
    '3a87b3e3-18b1-4e6d-99b8-10047b1d5f49',
    'ef953407-1339-4fa1-958e-f946ab042a0a',
    '193d8d91-2515-4c65-9bdb-996b5e9a817a',
    'f1e6f615-899d-43bf-bf9b-d1c2d49b75bc',
    '6d493d2f-61b7-4721-879d-69bb6d50f443',
    'f315043b-469d-4532-9250-8ce7f51422b6',
    '8346abc9-57b5-42e4-a879-4a91fd988cc8',
    'f8108316-372f-4119-bdd1-3871dce5921f',
    'ddab7e44-6742-47a6-b121-92b414071cd8',
    'e59c9e25-eb03-495a-81b8-30868f17e6dd',
    '61d1b7e1-9d44-4d11-a537-3be54d08e80e',
    '062f7a80-3f93-44b1-abdf-a6533b15221a',
    '012c6f32-323b-4dd3-ae52-1e170bf97bfa',
    'e4b70b6b-c8de-4d0e-8788-298de0517bd1',
    'cefb74e6-2471-4258-9978-61536e8b5ba8',
    '3fce7a4c-4d21-44f5-ab0d-9ac1678c5c42',
    '41c668e7-5d8b-4858-a5b2-0369104ced63',
    '5ae33bd3-ae7d-43b2-b142-b51cd7f3c075',
    '7cae24e5-8c69-4347-beca-301570519e0e',
    '92305e71-d139-4f77-831c-8c8f4c9fde3a',
    '4e53153f-f826-4813-9774-745b799bd56f',
    '132671ce-bfbd-47de-aec9-547231913b0d',
    'db2cacfe-925a-432d-92a8-f56ba85e49a4',
    '15092bd1-c8f9-4754-a447-44e4705cc92a',
    '85422bee-4e4f-4f77-acb0-abdd7b72fb1e',
    '18b5a724-92c6-4d75-8651-acf234097385',
    '2db8a41a-8cdd-415b-9e70-d1d205bf382f'
  ]::uuid[]);

  -- RQ (38 rows):

  delete from action_items where id = any(array[
    '27df010a-3e66-4d45-8bbd-395bcd7cb82f',
    '061f102f-4c08-4f21-82af-eb90bc036458',
    '0e63edc8-c6d6-4018-bb88-5b035f104bae',
    'ed73d9bd-109b-408d-8135-b7f84c6bfac1',
    '5346e2ef-1b22-4511-9941-cf444b2c4e0b',
    '414cfd27-b8dc-45f0-be2a-bd71f075bd45',
    '89be8ade-5a74-4e67-be13-612e317392d9',
    '6f4a3629-aa9e-40b8-9707-ed727b6b6267',
    'f4fa41ce-af8a-4922-8a14-61a5fad0ab09',
    '383cde8c-4b93-4c6f-bc03-9fb2a14651f9',
    '978e5342-d214-41c8-b14b-d18816940cba',
    'f6775fb9-8cba-433d-a463-f91d3ef76155',
    '1934aa1c-daa6-4405-9a41-7efe05481832',
    'a8ecf6ed-d420-414e-9579-e47cbac371f7',
    '53064070-8aca-4a55-bb8f-b89c7a3de9ac',
    'd2dfa5c0-7f99-4440-9eee-3da9be3827a5',
    'c470da3b-b5a4-4368-b2d1-4b4899c4b7ca',
    '9eecb329-8b1e-4a0a-8741-06b6bf0b8603',
    'ea1dc6b6-4568-4f97-b32e-4a88d53ba938',
    '975105ce-3648-411c-a331-eaf7eaa868fd',
    'a16e682a-09b2-40c2-80a8-5841835be3a2',
    'e9832a95-c3b7-4690-b94a-d2cd2624e920',
    '82c65c2d-a0b3-480e-9a40-136c4456cfd1',
    'bacb1f4e-101b-4b20-a3a1-57765e5b261f',
    '2f862f6d-71ba-4b99-b804-01f23f99bbf1',
    '7469f854-74c0-4d96-a16f-6243224e50bb',
    'a7577f74-d0b1-4064-a2b6-5f5568ba5592',
    '51b42541-c83a-4a8e-8377-d189a42d6494',
    'd4669b02-5816-4b8f-8508-ede3711230fc',
    'ede4d011-ca6a-49c7-8d31-d8b4fb9be4d3',
    'c526b9d7-0064-48db-a189-79902515770d',
    '3ce93b9e-1008-4620-bad5-378fab347bb0',
    '5a447a2d-53a5-45e1-8356-e5787d749c98',
    'fdcb8a0a-07cb-4f15-bb91-6ed21d293c42',
    'e579290a-759f-414c-a3b5-d0d2d975c909',
    'dd2216b8-0a16-4c54-ae3a-0c85ac33403f',
    'bfb780d7-4902-4368-b36e-286085c31d7b',
    'fd19fd12-72c5-45e5-9202-92e997997167'
  ]::uuid[]);

  -- ── 6. Sanity checks ─────────────────────────────────────────────────────────

  select count(*) into wb_sent
    from campaign_schools
    where campaign_id = wb_camp_id and status = 'sent';

  select count(*) into wb_pending
    from campaign_schools
    where campaign_id = wb_camp_id and status = 'pending';

  select count(*) into rq_pending
    from campaign_schools
    where campaign_id = rq_camp_id and status = 'pending';

  select count(*) into ai_remaining from action_items;

  raise notice '─────────────────────────────────────────────────────────────';
  raise notice 'Phase 2a data migration complete';
  raise notice '─────────────────────────────────────────────────────────────';
  raise notice 'Wingback campaign (c4mp0002-...-0001):';
  raise notice '  sent:    %', wb_sent;
  raise notice '  pending: %', wb_pending;
  raise notice '  total:   %', wb_sent + wb_pending;
  raise notice 'RQ campaign (c4mp0002-...-0002):';
  raise notice '  pending: %', rq_pending;
  raise notice 'action_items remaining: % (expected: 4)', ai_remaining;
  raise notice '─────────────────────────────────────────────────────────────';

  if (wb_sent + wb_pending) <> 40 then
    raise exception 'ABORT: wingback campaign_schools count is %, expected 40', wb_sent + wb_pending;
  end if;
  if rq_pending <> 38 then
    raise exception 'ABORT: RQ campaign_schools count is %, expected 38', rq_pending;
  end if;
  if ai_remaining <> 4 then
    raise exception 'ABORT: action_items remaining is %, expected 4', ai_remaining;
  end if;

  raise notice 'All checks passed — committing.';

end;
$$;

commit;

-- ── Post-commit output (visible in Results tab) ───────────────────────────────

select
  'wingback' as campaign,
  status,
  count(*) as count
from campaign_schools
where campaign_id = 'c4mp0002-0000-4000-8000-000000000001'
group by status
union all
select
  'rq' as campaign,
  status,
  count(*) as count
from campaign_schools
where campaign_id = 'c4mp0002-0000-4000-8000-000000000002'
group by status
order by campaign, status;

select count(*) as action_items_remaining from action_items;
-- expected: 4
