-- P1.3 Q3 — RLS and owner-policy assertions (read-only).
-- Expect status = 'PASS' for all rows.

WITH rls_flags AS (
  SELECT c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'hive3'
    AND c.relname = 'hives'
),
rls_checks AS (
  SELECT
    'rls:enabled' AS check_id,
    CASE WHEN relrowsecurity THEN 'PASS' ELSE 'FAIL' END AS status,
    CASE WHEN relrowsecurity THEN 'RLS enabled' ELSE 'RLS not enabled' END AS detail
  FROM rls_flags
  UNION ALL
  SELECT
    'rls:forced',
    CASE WHEN relforcerowsecurity THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN relforcerowsecurity THEN 'FORCE RLS on' ELSE 'FORCE RLS off' END
  FROM rls_flags
),
policies AS (
  SELECT
    polname,
    polcmd,
    polroles::regrole[] AS roles,
    btrim(pg_get_expr(polqual, polrelid)) AS using_expr,
    btrim(pg_get_expr(polwithcheck, polrelid)) AS with_check_expr
  FROM pg_policy
  WHERE polrelid = 'hive3.hives'::regclass
),
expected AS (
  SELECT *
  FROM (
    VALUES
      ('hives_select_owner', 'r', ARRAY['authenticated']::text[], '(owner_user_id = auth.uid())', NULL),
      ('hives_insert_owner', 'a', ARRAY['authenticated']::text[], NULL, '(owner_user_id = auth.uid())'),
      ('hives_update_owner', 'w', ARRAY['authenticated']::text[], '(owner_user_id = auth.uid())', '(owner_user_id = auth.uid())')
  ) AS t(polname, polcmd, roles, using_expr, with_check_expr)
),
policy_checks AS (
  SELECT
    'policy:' || e.polname AS check_id,
    CASE
      WHEN p.polname IS NULL THEN 'FAIL'
      WHEN p.polcmd IS DISTINCT FROM e.polcmd THEN 'FAIL'
      WHEN NOT (p.roles @> ARRAY['authenticated']::regrole[] AND cardinality(p.roles) = 1) THEN 'FAIL'
      WHEN e.using_expr IS NOT NULL AND coalesce(p.using_expr, '') IS DISTINCT FROM e.using_expr THEN 'FAIL'
      WHEN e.with_check_expr IS NOT NULL AND coalesce(p.with_check_expr, '') IS DISTINCT FROM e.with_check_expr THEN 'FAIL'
      ELSE 'PASS'
    END AS status,
    coalesce(
      'expected cmd=' || e.polcmd || ' roles=authenticated; actual cmd=' || coalesce(p.polcmd, '?') ||
      ' roles=' || coalesce(p.roles::text, '?') ||
      ' using=' || coalesce(p.using_expr, 'null') ||
      ' with_check=' || coalesce(p.with_check_expr, 'null'),
      'policy missing'
    ) AS detail
  FROM expected e
  LEFT JOIN policies p ON p.polname = e.polname
),
extra_policies AS (
  SELECT
    'policy:extra:' || p.polname AS check_id,
    CASE
      WHEN p.polcmd = 'd' THEN 'FAIL'
      ELSE 'FAIL'
    END AS status,
    'unexpected policy (DELETE policies fail PC-04)' AS detail
  FROM policies p
  LEFT JOIN expected e ON e.polname = p.polname
  WHERE e.polname IS NULL
),
delete_policy AS (
  SELECT
    'policy:no_delete' AS check_id,
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
    CASE
      WHEN count(*) = 0 THEN 'no DELETE policy'
      ELSE 'DELETE policy present: ' || string_agg(polname, ', ')
    END AS detail
  FROM policies
  WHERE polcmd = 'd'
),
anon_policies AS (
  SELECT
    'policy:anon_not_targeted' AS check_id,
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
    CASE
      WHEN count(*) = 0 THEN 'no policies for anon'
      ELSE 'anon targeted: ' || string_agg(polname, ', ')
    END AS detail
  FROM policies
  WHERE 'anon'::regrole = ANY (polroles)
)
SELECT * FROM rls_checks
UNION ALL SELECT * FROM policy_checks
UNION ALL SELECT * FROM extra_policies
UNION ALL SELECT * FROM delete_policy
UNION ALL SELECT * FROM anon_policies
ORDER BY check_id;
