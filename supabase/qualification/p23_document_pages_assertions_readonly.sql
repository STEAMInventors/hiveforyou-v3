-- P2.3 Slice 1 (P1.P Gate 2b remainder) — Read-only structural assertions for hive3.document_pages.
-- Migration: 20261025150000_hive3_p23_document_pages.sql
-- Supabase SQL Editor: run as plain SQL. No data is written.

DO $$
BEGIN
  IF to_regclass('hive3.document_pages') IS NULL THEN
    RAISE EXCEPTION 'missing hive3.document_pages';
  END IF;
END $$;

-- Required constraints (uniqueness, page bounds, digest/text integrity, 64 KiB cap, method/status).
DO $$
DECLARE
  v_required text[] := ARRAY[
    'document_pages_source_generation_page_key',
    'document_pages_page_set_digest_format',
    'document_pages_page_bounds',
    'document_pages_source_sha256_format',
    'document_pages_read_fingerprint_not_blank',
    'document_pages_page_text_sha256_format',
    'document_pages_page_text_sha256_matches',
    'document_pages_page_byte_length_matches',
    'document_pages_page_text_size',
    'document_pages_extraction_method_check',
    'document_pages_extraction_status_check',
    'document_pages_provenance_size'
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
    WHERE tgrelid = 'hive3.document_pages'::regclass
      AND tgname = 'document_pages_bind_hive'
  ) THEN
    RAISE EXCEPTION 'missing document_pages_bind_hive trigger';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'hive3.document_pages'::regclass
      AND tgname = 'document_pages_immutable'
  ) THEN
    RAISE EXCEPTION 'missing document_pages_immutable trigger';
  END IF;
END $$;

-- RLS enabled + forced; no policies (worker-only via DEFINER RPCs).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'hive3'
      AND c.relname = 'document_pages'
      AND c.relrowsecurity
      AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'document_pages must have RLS enabled and forced';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'hive3' AND tablename = 'document_pages') THEN
    RAISE EXCEPTION 'document_pages must not have RLS policies';
  END IF;
END $$;

-- anon / authenticated have no direct table privileges.
DO $$
DECLARE
  v_role text;
  v_priv text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      IF has_table_privilege(v_role, 'hive3.document_pages', v_priv) THEN
        RAISE EXCEPTION '% must not % on hive3.document_pages', v_role, v_priv;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Worker RPCs: service_role only (no PUBLIC / anon / authenticated EXECUTE).
DO $$
DECLARE
  v_worker_rpcs text[] := ARRAY[
    'public.hive3_p23_worker_put_document_pages(uuid, uuid, text, text, text, integer, jsonb)',
    'public.hive3_p23_worker_list_document_pages(uuid, uuid, text, text)'
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

-- Data integrity (read-only): no cross-Hive pages, source_sha256 consistent with source_documents.
SELECT
  (SELECT count(*) FROM hive3.document_pages p
     JOIN hive3.source_documents d ON d.id = p.source_document_id
     WHERE d.hive_id <> p.hive_id) AS pages_source_hive_mismatch,
  (SELECT count(*) FROM hive3.document_pages p
     JOIN hive3.study_runs r ON r.id = p.first_study_run_id
     WHERE r.hive_id <> p.hive_id) AS pages_run_hive_mismatch,
  (SELECT count(*) FROM hive3.document_pages p
     JOIN hive3.source_documents d ON d.id = p.source_document_id
     WHERE lower(btrim(d.sha256)) <> lower(btrim(p.source_sha256))) AS pages_source_sha256_mismatch;
