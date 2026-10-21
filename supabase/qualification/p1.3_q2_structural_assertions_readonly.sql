-- P1.3 Q2 — Structural match assertions for hive3.hives (read-only).
-- Expect every row: status = 'PASS'. Any FAIL blocks M1 DB qualification.

WITH expected_columns AS (
  SELECT *
  FROM (
    VALUES
      ('id', 'uuid', 'NO'),
      ('owner_user_id', 'uuid', 'NO'),
      ('name', 'text', 'NO'),
      ('description', 'text', 'YES'),
      ('client_request_id', 'text', 'NO'),
      ('created_at', 'timestamp with time zone', 'NO'),
      ('updated_at', 'timestamp with time zone', 'NO'),
      ('archived_at', 'timestamp with time zone', 'YES')
  ) AS t(column_name, data_type, is_nullable)
),
actual_columns AS (
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'hive3'
    AND table_name = 'hives'
),
column_checks AS (
  SELECT
    'column:' || e.column_name AS check_id,
    CASE
      WHEN a.column_name IS NULL THEN 'FAIL'
      WHEN a.data_type IS DISTINCT FROM e.data_type THEN 'FAIL'
      WHEN a.is_nullable IS DISTINCT FROM e.is_nullable THEN 'FAIL'
      ELSE 'PASS'
    END AS status,
    coalesce(
      'expected ' || e.data_type || ' nullable=' || e.is_nullable ||
      '; actual ' || coalesce(a.data_type, '?') || ' nullable=' || coalesce(a.is_nullable, '?'),
      'missing column'
    ) AS detail
  FROM expected_columns e
  LEFT JOIN actual_columns a ON a.column_name = e.column_name
),
extra_columns AS (
  SELECT
    'column:extra:' || a.column_name AS check_id,
    'FAIL' AS status,
    'unexpected column present' AS detail
  FROM actual_columns a
  LEFT JOIN expected_columns e ON e.column_name = a.column_name
  WHERE e.column_name IS NULL
),
pk_check AS (
  SELECT
    'constraint:primary_key_on_id' AS check_id,
    CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END AS status,
    CASE
      WHEN count(*) = 0 THEN 'no primary key on hive3.hives'
      WHEN count(*) > 1 THEN 'multiple primary keys'
      ELSE 'pk present'
    END AS detail
  FROM pg_constraint c
  WHERE c.conrelid = 'hive3.hives'::regclass
    AND c.contype = 'p'
    AND c.conkey = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'hive3.hives'::regclass
        AND a.attname = 'id'
        AND NOT a.attisdropped
    )
),
unique_pair AS (
  SELECT
    'constraint:unique_owner_client_request' AS check_id,
    CASE WHEN count(*) >= 1 THEN 'PASS' ELSE 'FAIL' END AS status,
    CASE
      WHEN count(*) = 0 THEN 'no UNIQUE (owner_user_id, client_request_id)'
      ELSE 'unique constraint found: ' || string_agg(conname, ', ')
    END AS detail
  FROM pg_constraint c
  WHERE c.conrelid = 'hive3.hives'::regclass
    AND c.contype = 'u'
    AND pg_get_constraintdef(c.oid) LIKE '%UNIQUE (owner_user_id, client_request_id)%'
),
owner_fk AS (
  SELECT
    count(*) AS fk_count,
    bool_or(pg_get_constraintdef(c.oid) LIKE '%ON DELETE CASCADE%') AS any_cascade,
    string_agg(conname || ': ' || pg_get_constraintdef(c.oid), '; ') AS fk_defs
  FROM pg_constraint c
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid
   AND a.attnum = c.conkey[1]
  WHERE c.conrelid = 'hive3.hives'::regclass
    AND c.contype = 'f'
    AND c.confrelid = 'auth.users'::regclass
    AND a.attname = 'owner_user_id'
    AND cardinality(c.conkey) = 1
),
fk_checks AS (
  SELECT
    'constraint:owner_fk_single_cascade' AS check_id,
    CASE
      WHEN fk.fk_count = 1 AND fk.any_cascade THEN 'PASS'
      ELSE 'FAIL'
    END AS status,
    CASE
      WHEN fk.fk_count = 0 THEN 'missing owner_user_id → auth.users FK'
      WHEN fk.fk_count > 1 THEN 'multiple owner FKs: ' || coalesce(fk.fk_defs, '')
      WHEN NOT fk.any_cascade THEN 'FK without ON DELETE CASCADE: ' || coalesce(fk.fk_defs, '')
      ELSE coalesce(fk.fk_defs, 'ok')
    END AS detail
  FROM owner_fk fk
),
trigger_check AS (
  SELECT
    'trigger:hives_set_updated_at' AS check_id,
    CASE WHEN count(*) >= 1 THEN 'PASS' ELSE 'FAIL' END AS status,
    CASE
      WHEN count(*) = 0 THEN 'missing BEFORE UPDATE trigger hives_set_updated_at (apply P1.2 migration)'
      ELSE 'trigger present'
    END AS detail
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'hive3'
    AND c.relname = 'hives'
    AND t.tgname = 'hives_set_updated_at'
    AND NOT t.tgisinternal
),
function_check AS (
  SELECT
    'function:hive3.set_updated_at' AS check_id,
    CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END AS status,
    CASE
      WHEN count(*) = 0 THEN 'missing hive3.set_updated_at()'
      ELSE 'function present'
    END AS detail
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'hive3'
    AND p.proname = 'set_updated_at'
)
SELECT check_id, status, detail FROM column_checks
UNION ALL SELECT * FROM extra_columns
UNION ALL SELECT * FROM pk_check
UNION ALL SELECT * FROM unique_pair
UNION ALL SELECT * FROM fk_checks
UNION ALL SELECT * FROM trigger_check
UNION ALL SELECT * FROM function_check
ORDER BY check_id;
