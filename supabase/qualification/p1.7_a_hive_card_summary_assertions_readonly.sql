-- P1.7-A read-only qualification for hive3_m1_list_hives card summary fields.
-- Run in Supabase SQL Editor after applying 20261021180000_hive3_m1_hive_card_summary.sql.
-- Does not mutate data.

-- 1) Function exists and is invoker-scoped (authenticated callers use RLS via hive3).
SELECT
  p.proname AS function_name,
  p.prosecdef AS security_definer,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'hive3_m1_list_hives';

-- 2) EXECUTE granted to authenticated (not PUBLIC-only revoke check).
SELECT
  has_function_privilege('authenticated', 'public.hive3_m1_list_hives()', 'EXECUTE') AS authenticated_can_execute;

-- 3) Function body references aggregate fields (smoke on definition text).
SELECT
  strpos(pg_get_functiondef('public.hive3_m1_list_hives()'::regprocedure), 'registered_document_count') > 0
    AS includes_registered_document_count,
  strpos(pg_get_functiondef('public.hive3_m1_list_hives()'::regprocedure), 'preview_filenames') > 0
    AS includes_preview_filenames;

-- 4) hive3 tables are not exposed as PostgREST API tables (schema isolation).
SELECT count(*) AS hive3_public_api_tables
FROM pg_catalog.pg_tables
WHERE schemaname = 'hive3';

-- 5) Sample shape (requires signed-in session as owner with at least one hive):
-- SET request.jwt.claim.sub = '<owner-uuid>';
-- SELECT public.hive3_m1_list_hives();
-- Expect each element to include registered_document_count (integer) and preview_filenames (json array).
