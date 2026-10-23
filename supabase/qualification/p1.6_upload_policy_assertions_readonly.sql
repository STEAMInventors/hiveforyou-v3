-- P1.6 — Read-only structural assertions for upload_product_policy (run after migration apply).
-- Expect failures until 20261021160000_hive3_m1_upload_product_policy.sql is applied.
-- Supabase SQL Editor: run this file as plain SQL (no psql meta-commands).
-- psql CLI (optional): \set ON_ERROR_STOP on  — then \i this file

DO $$
BEGIN
  IF to_regclass('hive3.upload_product_policy') IS NULL THEN
    RAISE EXCEPTION 'missing hive3.upload_product_policy';
  END IF;
  IF to_regclass('hive3.upload_product_policy_audit') IS NULL THEN
    RAISE EXCEPTION 'missing hive3.upload_product_policy_audit';
  END IF;
END $$;

DO $$
DECLARE
  v_active integer;
BEGIN
  SELECT count(*) INTO v_active FROM hive3.upload_product_policy WHERE is_active;
  IF v_active <> 1 THEN
    RAISE EXCEPTION 'expected exactly one active upload_product_policy row, got %', v_active;
  END IF;
END $$;

DO $$
DECLARE
  v_row hive3.upload_product_policy%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM hive3.upload_product_policy WHERE is_active LIMIT 1;
  IF v_row.free_uploads_per_utc_month <> 10 THEN
    RAISE EXCEPTION 'unexpected free_uploads_per_utc_month %', v_row.free_uploads_per_utc_month;
  END IF;
  IF v_row.max_file_bytes <> 26214400 THEN
    RAISE EXCEPTION 'unexpected max_file_bytes %', v_row.max_file_bytes;
  END IF;
  IF v_row.commercial_pack_upload_count <> 10 OR v_row.commercial_pack_price_cents <> 500 THEN
    RAISE EXCEPTION 'unexpected commercial pack terms';
  END IF;
  IF v_row.payments_enabled IS NOT FALSE THEN
    RAISE EXCEPTION 'payments_enabled must be false for P1.6';
  END IF;
END $$;

DO $$
BEGIN
  IF hive3.m1_free_upload_limit() <> 10 THEN
    RAISE EXCEPTION 'm1_free_upload_limit drift';
  END IF;
  IF hive3.m1_upload_max_bytes() <> 26214400 THEN
    RAISE EXCEPTION 'm1_upload_max_bytes drift';
  END IF;
  IF hive3.m1_allowed_upload_mime('application/pdf') IS NOT TRUE THEN
    RAISE EXCEPTION 'm1_allowed_upload_mime rejected pdf';
  END IF;
  IF hive3.m1_allowed_upload_mime('text/plain') IS NOT FALSE THEN
    RAISE EXCEPTION 'm1_allowed_upload_mime accepted text/plain';
  END IF;
END $$;

-- Authenticated must not read policy tables directly (RLS, no grants).
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'hive3.upload_product_policy', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated must not SELECT upload_product_policy';
  END IF;
END $$;
