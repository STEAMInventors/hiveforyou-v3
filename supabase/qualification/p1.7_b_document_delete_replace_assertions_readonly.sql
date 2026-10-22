-- P1.7-B — Read-only qualification: document delete/replace + study lock RPCs exist.
-- Run after 20261021200000_hive3_m1_document_delete_replace_study_lock.sql apply.

SELECT
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'hive3_m1_begin_registered_source_document_deletion'
  ) AS has_begin_delete,
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'hive3_m1_finalize_registered_source_document_deletion'
  ) AS has_finalize_delete,
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'hive3_m1_lock_hive_registered_sources_for_study'
  ) AS has_study_lock,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'hive3'
      AND table_name = 'source_documents'
      AND column_name = 'study_locked_at'
  ) AS has_study_locked_at,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'hive3'
      AND table_name = 'source_documents'
      AND column_name = 'deleting_at'
  ) AS has_deleting_at,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'hive3'
      AND table_name = 'source_documents'
      AND column_name = 'supersedes_document_id'
  ) AS has_supersedes_column,
  EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'hive3'
      AND indexname = 'source_documents_one_active_replacement_idx'
  ) AS has_replacement_unique_idx;

-- Six-arg prepare replaces five-arg (P1.7-B); must not remain callable on PUBLIC.
SELECT CASE
  WHEN to_regprocedure('public.hive3_m1_prepare_source_document_upload(uuid, text, text, text, bigint, uuid)') IS NOT NULL
    AND to_regprocedure('public.hive3_m1_prepare_source_document_upload(uuid, text, text, text, bigint)') IS NULL
    AND has_function_privilege('authenticated', 'public.hive3_m1_prepare_source_document_upload(uuid, text, text, text, bigint, uuid)', 'EXECUTE')
    AND NOT has_function_privilege('PUBLIC', 'public.hive3_m1_prepare_source_document_upload(uuid, text, text, text, bigint, uuid)', 'EXECUTE')
  THEN 'pass: prepare six-arg signature and grants'
  ELSE 'fail: prepare signature or grants incorrect'
END AS p1_7_b_prepare_signature_grants;

SELECT CASE
  WHEN pg_get_functiondef('public.hive3_m1_prepare_source_document_upload(uuid, text, text, text, bigint, uuid)'::regprocedure)
    ~* 'p_supersedes_document_id'
    AND pg_get_functiondef('public.hive3_m1_prepare_source_document_upload(uuid, text, text, text, bigint, uuid)'::regprocedure)
    ~* 'replacement_in_progress'
  THEN 'pass: prepare replacement guards'
  ELSE 'fail: prepare missing replacement guards'
END AS p1_7_b_prepare_replacement;

SELECT CASE
  WHEN pg_get_functiondef('public.hive3_m1_complete_source_document_upload(uuid, text, text, bigint)'::regprocedure)
    ~* 'replacement_cleanup_pending'
    AND pg_get_functiondef('public.hive3_m1_complete_source_document_upload(uuid, text, text, bigint)'::regprocedure)
    ~* 'supersedes_document_id'
  THEN 'pass: complete replacement replay cleanup fields'
  ELSE 'fail: complete missing replacement replay cleanup'
END AS p1_7_b_complete_replacement_replay;

SELECT CASE
  WHEN has_function_privilege('authenticated', 'public.hive3_m1_begin_registered_source_document_deletion(uuid, text)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.hive3_m1_finalize_registered_source_document_deletion(uuid, text)', 'EXECUTE')
    AND NOT has_function_privilege('PUBLIC', 'public.hive3_m1_begin_registered_source_document_deletion(uuid, text)', 'EXECUTE')
    AND NOT has_function_privilege('PUBLIC', 'public.hive3_m1_lock_hive_registered_sources_for_study(uuid)', 'EXECUTE')
  THEN 'pass: P1.7-B RPC grants'
  ELSE 'fail: P1.7-B RPC grants'
END AS p1_7_b_rpc_grants;
