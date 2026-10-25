-- P1.P Gate 2b (selected-Pack slice) — Read-only structural assertions (run after migration apply).
-- Migration: 20261024120000_hive3_p2px_gate2b_pack_extraction.sql
-- Supabase SQL Editor: run as plain SQL. No data is written.

DO $$
BEGIN
  IF to_regclass('hive3.pack_extraction_prompts') IS NULL THEN
    RAISE EXCEPTION 'missing hive3.pack_extraction_prompts';
  END IF;
  IF to_regclass('hive3.extraction_batches') IS NULL THEN
    RAISE EXCEPTION 'missing hive3.extraction_batches';
  END IF;
END $$;

-- Required constraints (idempotency key, digest/text integrity, size caps, status coupling).
DO $$
DECLARE
  v_required text[] := ARRAY[
    'pack_extraction_prompts_digest_format',
    'pack_extraction_prompts_digest_matches_text',
    'pack_extraction_prompts_system_text_size',
    'extraction_batches_idempotency_key',
    'extraction_batches_status_disposition',
    'extraction_batches_succeeded_has_output',
    'extraction_batches_failed_has_error',
    'extraction_batches_error_reason_safe',
    'extraction_batches_extraction_size',
    'extraction_batches_validation_size'
  ];
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY v_required LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = v_name) THEN
      RAISE EXCEPTION 'missing constraint %', v_name;
    END IF;
  END LOOP;
END $$;

-- Hive binding and immutability triggers.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'hive3.extraction_batches'::regclass
      AND tgname = 'extraction_batches_bind_hive'
  ) THEN
    RAISE EXCEPTION 'missing extraction_batches_bind_hive trigger';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'hive3.extraction_batches'::regclass
      AND tgname = 'extraction_batches_immutable'
  ) THEN
    RAISE EXCEPTION 'missing extraction_batches_immutable trigger';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'hive3.pack_extraction_prompts'::regclass
      AND tgname = 'pack_extraction_prompts_immutable'
  ) THEN
    RAISE EXCEPTION 'missing pack_extraction_prompts_immutable trigger';
  END IF;
END $$;

-- RLS enabled + forced; no policies (worker-only via DEFINER RPCs).
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['pack_extraction_prompts', 'extraction_batches'] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'hive3'
        AND c.relname = v_table
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION '% must have RLS enabled and forced', v_table;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'hive3' AND tablename = v_table) THEN
      RAISE EXCEPTION '% must not have RLS policies', v_table;
    END IF;
  END LOOP;
END $$;

-- anon / authenticated have no direct table privileges.
DO $$
DECLARE
  v_table text;
  v_role text;
  v_priv text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['hive3.pack_extraction_prompts', 'hive3.extraction_batches'] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
        IF has_table_privilege(v_role, v_table, v_priv) THEN
          RAISE EXCEPTION '% must not % on %', v_role, v_priv, v_table;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- Worker RPCs: service_role only (no PUBLIC / anon / authenticated EXECUTE).
DO $$
DECLARE
  v_worker_rpcs text[] := ARRAY[
    'public.hive3_p2px_worker_put_extraction_prompt(jsonb, uuid)',
    'public.hive3_p2px_worker_get_run_batch(uuid, uuid, text, integer)',
    'public.hive3_p2px_worker_put_extraction_batch(uuid, jsonb)',
    'public.hive3_p2px_worker_find_reusable_batch(uuid, text, text, text, text, integer, integer)'
  ];
  v_sig text;
  v_role text;
  v_public_execute boolean;
BEGIN
  FOREACH v_sig IN ARRAY v_worker_rpcs LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'missing worker RPC %', v_sig;
    END IF;
    SELECT EXISTS (
      SELECT 1
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      WHERE p.oid = to_regprocedure(v_sig)
        AND acl.privilege_type = 'EXECUTE'
        AND acl.grantee = 0
    ) INTO v_public_execute;
    IF v_public_execute THEN
      RAISE EXCEPTION 'PUBLIC must not EXECUTE %', v_sig;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_function_privilege(v_role, v_sig, 'EXECUTE') THEN
        RAISE EXCEPTION '% must not EXECUTE %', v_role, v_sig;
      END IF;
    END LOOP;
    IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role must EXECUTE %', v_sig;
    END IF;
  END LOOP;
END $$;

-- Owner read RPC: authenticated yes, anon no.
DO $$
BEGIN
  IF to_regprocedure('public.hive3_p2px_owner_list_extraction_batches(uuid)') IS NULL THEN
    RAISE EXCEPTION 'missing hive3_p2px_owner_list_extraction_batches';
  END IF;
  IF NOT has_function_privilege(
    'authenticated', 'public.hive3_p2px_owner_list_extraction_batches(uuid)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated must EXECUTE owner_list_extraction_batches';
  END IF;
  IF has_function_privilege(
    'anon', 'public.hive3_p2px_owner_list_extraction_batches(uuid)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anon must not EXECUTE owner_list_extraction_batches';
  END IF;
END $$;

-- Data integrity (read-only): no cross-Hive batches, prompt digests consistent.
SELECT
  (SELECT count(*) FROM hive3.extraction_batches b
     JOIN hive3.study_runs r ON r.id = b.study_run_id
     WHERE r.hive_id <> b.hive_id) AS batches_run_hive_mismatch,
  (SELECT count(*) FROM hive3.extraction_batches b
     JOIN hive3.source_documents d ON d.id = b.source_document_id
     WHERE d.hive_id <> b.hive_id) AS batches_source_hive_mismatch,
  (SELECT count(*) FROM hive3.extraction_batches b
     JOIN hive3.extraction_batches o ON o.id = b.reused_from_batch_id
     WHERE o.hive_id <> b.hive_id) AS batches_cross_hive_reuse;
