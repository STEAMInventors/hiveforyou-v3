-- P2.3 Gate 2c — Read-only structural assertions for hive3.facts + hive3.fact_evidence.
-- Migration: 20261025180000_hive3_p23_gate2c_facts.sql
-- Supabase SQL Editor: run as plain SQL. No data is written.

DO $$
BEGIN
  IF to_regclass('hive3.facts') IS NULL THEN
    RAISE EXCEPTION 'missing hive3.facts';
  END IF;
  IF to_regclass('hive3.fact_evidence') IS NULL THEN
    RAISE EXCEPTION 'missing hive3.fact_evidence';
  END IF;
END $$;

DO $$
DECLARE
  v_required text[] := ARRAY[
    'facts_idempotency_key',
    'facts_verification_disposition_check',
    'facts_verification_reason_safe',
    'facts_verified_has_no_reason',
    'facts_nonverified_has_reason',
    'facts_value_json_size',
    'fact_evidence_idempotency_key',
    'fact_evidence_exact_quote_size'
  ];
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY v_required LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = v_name) THEN
      RAISE EXCEPTION 'missing constraint %', v_name;
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'hive3.facts'::regclass AND tgname = 'facts_bind_scope'
  ) THEN
    RAISE EXCEPTION 'missing facts_bind_scope trigger';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'hive3.facts'::regclass AND tgname = 'facts_immutable'
  ) THEN
    RAISE EXCEPTION 'missing facts_immutable trigger';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.hive3_p23_worker_list_run_batches_for_verify(uuid)') IS NULL THEN
    RAISE EXCEPTION 'missing hive3_p23_worker_list_run_batches_for_verify';
  END IF;
  IF to_regprocedure('public.hive3_p23_worker_put_fact_verification(uuid, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'missing hive3_p23_worker_put_fact_verification';
  END IF;
  IF to_regprocedure('public.hive3_p23_worker_count_fact_verifications(uuid)') IS NULL THEN
    RAISE EXCEPTION 'missing hive3_p23_worker_count_fact_verifications';
  END IF;
END $$;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'hive3.facts', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated must not SELECT hive3.facts directly';
  END IF;
  IF has_table_privilege('authenticated', 'hive3.fact_evidence', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated must not SELECT hive3.fact_evidence directly';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT has_function_privilege(
    'service_role', 'public.hive3_p23_worker_put_fact_verification(uuid, jsonb)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role must EXECUTE put_fact_verification';
  END IF;
  IF has_function_privilege(
    'authenticated', 'public.hive3_p23_worker_put_fact_verification(uuid, jsonb)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated must not EXECUTE put_fact_verification';
  END IF;
END $$;
