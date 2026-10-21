-- P1.3 Q1 — Live catalog capture for hive3.hives (read-only).
-- Run in Supabase SQL Editor or psql. Save sanitized results as ticket evidence.
-- Do not commit connection strings or customer row payloads to git.

-- ---------------------------------------------------------------------------
-- Table existence and RLS posture
-- ---------------------------------------------------------------------------
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'hive3'
  AND c.relname = 'hives';

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'hive3'
  AND table_name = 'hives'
ORDER BY ordinal_position;

-- ---------------------------------------------------------------------------
-- Constraints (PK, UNIQUE, FK, CHECK)
-- ---------------------------------------------------------------------------
SELECT
  conname,
  pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'hive3.hives'::regclass
ORDER BY conname;

-- ---------------------------------------------------------------------------
-- Indexes (including unique index backing constraints)
-- ---------------------------------------------------------------------------
SELECT
  i.relname AS index_name,
  pg_get_indexdef(i.oid) AS index_def
FROM pg_index ix
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_class t ON t.oid = ix.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'hive3'
  AND t.relname = 'hives'
ORDER BY i.relname;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
SELECT
  tgname AS trigger_name,
  pg_get_triggerdef(t.oid, true) AS trigger_def
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'hive3'
  AND c.relname = 'hives'
  AND NOT t.tgisinternal
ORDER BY tgname;

-- ---------------------------------------------------------------------------
-- Trigger function (updated_at)
-- ---------------------------------------------------------------------------
SELECT
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS function_def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'hive3'
  AND p.proname = 'set_updated_at';

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------
SELECT
  polname,
  polcmd,
  polroles::regrole[] AS roles,
  pg_get_expr(polqual, polrelid) AS using_expr,
  pg_get_expr(polwithcheck, polrelid) AS with_check_expr
FROM pg_policy
WHERE polrelid = 'hive3.hives'::regclass
ORDER BY polname;

-- ---------------------------------------------------------------------------
-- Table privileges
-- ---------------------------------------------------------------------------
SELECT
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'hive3'
  AND table_name = 'hives'
ORDER BY grantee, privilege_type;

-- ---------------------------------------------------------------------------
-- Schema USAGE (authenticated)
-- ---------------------------------------------------------------------------
SELECT
  nspname AS schema_name,
  pg_catalog.has_schema_privilege('authenticated', n.oid, 'USAGE') AS authenticated_usage
FROM pg_namespace n
WHERE nspname = 'hive3';

-- ---------------------------------------------------------------------------
-- Row count (metadata only; do not paste wide row samples into git)
-- ---------------------------------------------------------------------------
SELECT count(*) AS hive_row_count FROM hive3.hives;

-- ---------------------------------------------------------------------------
-- Supabase migration history (expect absent until post-apply qualification)
-- ---------------------------------------------------------------------------
SELECT
  version,
  name
FROM supabase_migrations.schema_migrations
WHERE version = '20261020120000'
ORDER BY version;

-- Manual evidence (not SQL): Dashboard → Settings → API → Exposed schemas — is hive3 listed?
