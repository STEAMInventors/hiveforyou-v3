-- P1.7 — Upload count / failed-attempt recovery (read-only assertions).
-- Run after 20261021190000_hive3_m1_upload_prepare_quota_dismiss.sql is applied.

-- Prepare must enforce quota before inserting new pending rows.
SELECT CASE
  WHEN pg_get_functiondef('public.hive3_m1_prepare_source_document_upload(uuid, text, text, text, bigint)'::regprocedure)
    ~* 'm1_count_quota_used'
    AND pg_get_functiondef('public.hive3_m1_prepare_source_document_upload(uuid, text, text, text, bigint)'::regprocedure)
    ~* 'quota_exceeded'
  THEN 'pass: prepare quota guard present'
  ELSE 'fail: prepare missing quota guard'
END AS p1_7_prepare_quota_guard;

-- Dismiss RPC exists and is granted to authenticated (storage cleanup remains in Edge).
SELECT CASE
  WHEN to_regprocedure('public.hive3_m1_dismiss_failed_source_document(uuid, text)') IS NOT NULL
    AND has_function_privilege('authenticated', 'public.hive3_m1_dismiss_failed_source_document(uuid, text)', 'EXECUTE')
  THEN 'pass: dismiss RPC present'
  ELSE 'fail: dismiss RPC missing or not granted'
END AS p1_7_dismiss_rpc;

SELECT CASE
  WHEN pg_get_functiondef('public.hive3_m1_dismiss_failed_source_document(uuid, text)'::regprocedure) ~* 'status = ''failed'''
  THEN 'pass: dismiss limited to failed status'
  ELSE 'fail: dismiss status guard missing'
END AS p1_7_dismiss_failed_only;
