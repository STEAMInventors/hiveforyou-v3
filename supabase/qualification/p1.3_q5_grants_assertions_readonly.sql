-- P1.3 Q5 — Grants and role exposure assertions (read-only).
-- Expect status = 'PASS' for all rows.
-- Also record manually: Dashboard → Settings → API → Exposed schemas (hive3 yes/no).

WITH table_grants AS (
  SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema = 'hive3'
    AND table_name = 'hives'
),
authenticated_table AS (
  SELECT privilege_type
  FROM table_grants
  WHERE grantee = 'authenticated'
),
checks AS (
  SELECT
    'grant:authenticated_select' AS check_id,
    CASE WHEN EXISTS (SELECT 1 FROM authenticated_table WHERE privilege_type = 'SELECT') THEN 'PASS' ELSE 'FAIL' END AS status,
    'authenticated needs SELECT on hive3.hives' AS detail
  UNION ALL
  SELECT
    'grant:authenticated_insert',
    CASE WHEN EXISTS (SELECT 1 FROM authenticated_table WHERE privilege_type = 'INSERT') THEN 'PASS' ELSE 'FAIL' END,
    'authenticated needs INSERT on hive3.hives'
  UNION ALL
  SELECT
    'grant:authenticated_update',
    CASE WHEN EXISTS (SELECT 1 FROM authenticated_table WHERE privilege_type = 'UPDATE') THEN 'PASS' ELSE 'FAIL' END,
    'authenticated needs UPDATE on hive3.hives'
  UNION ALL
  SELECT
    'grant:authenticated_no_delete',
    CASE WHEN NOT EXISTS (SELECT 1 FROM authenticated_table WHERE privilege_type = 'DELETE') THEN 'PASS' ELSE 'FAIL' END,
    'authenticated must not have DELETE (PC-04)'
  UNION ALL
  SELECT
    'grant:anon_no_table_privileges',
    CASE WHEN NOT EXISTS (SELECT 1 FROM table_grants WHERE grantee = 'anon') THEN 'PASS' ELSE 'FAIL' END,
    'anon must have no privileges on hive3.hives'
  UNION ALL
  SELECT
    'grant:schema_usage_authenticated',
    CASE
      WHEN pg_catalog.has_schema_privilege('authenticated', 'hive3', 'USAGE') THEN 'PASS'
      ELSE 'FAIL'
    END,
    'authenticated needs USAGE on schema hive3'
)
SELECT * FROM checks
ORDER BY check_id;

-- Optional: list all grantees for manual review (should be minimal)
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'hive3'
  AND table_name = 'hives'
ORDER BY grantee, privilege_type;
