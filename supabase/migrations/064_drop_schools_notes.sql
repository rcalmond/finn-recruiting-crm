-- 064_drop_schools_notes.sql
--
-- Retire the free-text schools.notes column. Its content (Clark, Colby, and a
-- few others) was reviewed and discarded — nothing worth migrating. As of the
-- shipping commit, NO code reads or writes schools.notes: it was removed from
-- fetchSchoolContext and every generation prompt (draft email, campaign,
-- call prep, plan-QA, message-plan, conversation summary), from the school
-- add/edit modal, from the "Copy for Claude" export, from School Discovery's
-- add-to-list, and the read-only Legacy notes disclosure on school detail was
-- deleted.
--
-- Strategic notes are a SEPARATE column (school_message_plan.finn_notes) and
-- are NOT touched here — only the strategic-notes generation INPUT was retired
-- in code; the message-plan machinery keeps its own finn_notes.
--
-- ORDER OF OPERATIONS: ship + deploy the code first (nothing reads the column),
-- then run this in the Supabase dashboard.

alter table public.schools drop column notes;
