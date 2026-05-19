-- Backfill schools.last_contact from contact_log.
-- Uses MAX(date) excluding orphan and non_coach rows.
-- Guards against overwriting a newer manual entry.

UPDATE schools s
SET last_contact = sub.max_date
FROM (
  SELECT school_id, MAX(date) AS max_date
  FROM contact_log
  WHERE school_id IS NOT NULL
    AND parse_status NOT IN ('orphan', 'non_coach')
  GROUP BY school_id
) sub
WHERE s.id = sub.school_id
  AND (s.last_contact IS NULL OR s.last_contact < sub.max_date);
