-- P2.3 Slice 1 (P1.P Gate 2b remainder) — hive3.document_pages + Worker service_role RPCs.
-- Authority: docs/NEXT.md (P2.3 Slice 1),
--            docs/HIVEFORYOU-V3-DEVELOPMENT-PLAN-database-first-PROPOSED.md §3.1.1 (A3, A4 T2, A5, A6), §3.1.6 (T2),
--            docs/HIVEFORYOU-V3-DATABASE-DESIGN-v0.1.md §2 (document_pages).
-- Depends on: 20261021150000 (source_documents), 20261022100000 (study_runs), 20261024120000 (p2px_reject_update).
-- Scope: persisted Reader source pages and provenance (T2 <= 64 KiB per page text) for independent P2.3 verification.
-- Do not execute without operator authorization.

BEGIN;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hive3.document_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hive_id uuid NOT NULL REFERENCES hive3.hives (id) ON DELETE CASCADE,
  source_document_id uuid NOT NULL REFERENCES hive3.source_documents (id) ON DELETE CASCADE,
  first_study_run_id uuid REFERENCES hive3.study_runs (id) ON DELETE SET NULL,
  source_sha256 text NOT NULL,
  read_fingerprint text NOT NULL,
  page_set_digest text NOT NULL,
  page_count integer NOT NULL,
  page_number integer NOT NULL,
  page_text text NOT NULL,
  page_text_sha256 text NOT NULL,
  page_byte_length integer NOT NULL,
  extraction_method text NOT NULL,
  extraction_status text NOT NULL DEFAULT 'SUCCEEDED',
  provenance_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_pages_source_generation_page_key UNIQUE (
    source_document_id, page_set_digest, page_number
  ),
  CONSTRAINT document_pages_page_bounds CHECK (
    page_count >= 1 AND page_number >= 1 AND page_number <= page_count
  ),
  CONSTRAINT document_pages_source_sha256_format CHECK (
    source_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT document_pages_read_fingerprint_not_blank CHECK (
    char_length(btrim(read_fingerprint)) > 0 AND char_length(read_fingerprint) <= 128
  ),
  CONSTRAINT document_pages_page_set_digest_format CHECK (
    page_set_digest ~ '^sha256:[0-9a-f]{64}$'
  ),
  CONSTRAINT document_pages_page_text_sha256_format CHECK (
    page_text_sha256 ~ '^sha256:[0-9a-f]{64}$'
  ),
  CONSTRAINT document_pages_page_text_sha256_matches CHECK (
    page_text_sha256 = 'sha256:' || encode(sha256(convert_to(page_text, 'UTF8')), 'hex')
  ),
  CONSTRAINT document_pages_page_byte_length_matches CHECK (
    page_byte_length = octet_length(convert_to(page_text, 'UTF8'))
  ),
  CONSTRAINT document_pages_page_text_size CHECK (
    octet_length(convert_to(page_text, 'UTF8')) <= 65536
  ),
  CONSTRAINT document_pages_extraction_method_check CHECK (
    extraction_method IN ('pdf_native', 'image_ocr_local', 'image_ocr_litellm', 'docx_render_v1')
  ),
  CONSTRAINT document_pages_extraction_status_check CHECK (
    extraction_status IN ('SUCCEEDED')
  ),
  CONSTRAINT document_pages_provenance_size CHECK (
    jsonb_typeof(provenance_json) = 'object' AND octet_length(provenance_json::text) <= 65536
  )
);

COMMENT ON TABLE hive3.document_pages IS
  'Persisted Reader-prepared source pages and provenance (Plan Revision 2 T2 <= 64 KiB/page). Insert-only; Worker service_role RPCs only.';

CREATE INDEX IF NOT EXISTS document_pages_hive_source_idx
  ON hive3.document_pages (hive_id, source_document_id, page_number);

CREATE INDEX IF NOT EXISTS document_pages_hive_source_generation_idx
  ON hive3.document_pages (
    hive_id, source_document_id, read_fingerprint, page_set_digest, page_number
  );

-- ---------------------------------------------------------------------------
-- Page-set digest (immutable read generation identity; Worker + SQL must match)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION hive3.p23_compute_page_set_digest(
  p_source_sha256 text,
  p_page_count integer,
  p_pages jsonb
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = hive3, public
AS $$
DECLARE
  v_source text := lower(btrim(p_source_sha256));
  v_hashes text;
BEGIN
  IF v_source !~ '^[0-9a-f]{64}$' OR p_page_count IS NULL OR p_page_count < 1 THEN
    RETURN NULL;
  END IF;
  IF p_pages IS NULL OR jsonb_typeof(p_pages) <> 'array' OR jsonb_array_length(p_pages) <> p_page_count THEN
    RETURN NULL;
  END IF;

  SELECT string_agg(lower(btrim(elem ->> 'page_text_sha256')), E'\n' ORDER BY (elem ->> 'page_number')::integer)
  INTO v_hashes
  FROM jsonb_array_elements(p_pages) AS elem;

  IF v_hashes IS NULL OR v_hashes = '' THEN
    RETURN NULL;
  END IF;

  RETURN 'sha256:' || encode(
    sha256(
      convert_to(
        'document-page-set@1' || E'\n'
          || v_source || E'\n'
          || p_page_count::text || E'\n'
          || v_hashes || E'\n',
        'UTF8'
      )
    ),
    'hex'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Triggers: Hive/source binding and immutability
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION hive3.p23_document_pages_bind_hive()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = hive3, public
AS $$
DECLARE
  v_doc hive3.source_documents%ROWTYPE;
  v_run_hive uuid;
BEGIN
  SELECT * INTO v_doc FROM hive3.source_documents WHERE id = NEW.source_document_id;
  IF NOT FOUND OR v_doc.deleted_at IS NOT NULL OR v_doc.status <> 'registered' THEN
    RAISE EXCEPTION 'document_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NEW.first_study_run_id IS NOT NULL THEN
    SELECT hive_id INTO v_run_hive FROM hive3.study_runs WHERE id = NEW.first_study_run_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'study_run_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_run_hive <> v_doc.hive_id THEN
      RAISE EXCEPTION 'page_hive_mismatch' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.hive_id IS NOT NULL AND NEW.hive_id <> v_doc.hive_id THEN
    RAISE EXCEPTION 'page_hive_mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_doc.sha256 IS NULL OR lower(btrim(v_doc.sha256)) <> lower(btrim(NEW.source_sha256)) THEN
    RAISE EXCEPTION 'page_source_sha256_mismatch' USING ERRCODE = 'P0001';
  END IF;

  NEW.hive_id := v_doc.hive_id;
  NEW.source_sha256 := lower(btrim(NEW.source_sha256));
  NEW.read_fingerprint := btrim(NEW.read_fingerprint);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS document_pages_bind_hive ON hive3.document_pages;
CREATE TRIGGER document_pages_bind_hive
  BEFORE INSERT ON hive3.document_pages
  FOR EACH ROW EXECUTE FUNCTION hive3.p23_document_pages_bind_hive();

DROP TRIGGER IF EXISTS document_pages_immutable ON hive3.document_pages;
CREATE TRIGGER document_pages_immutable
  BEFORE UPDATE ON hive3.document_pages
  FOR EACH ROW EXECUTE FUNCTION hive3.p2px_reject_update('first_study_run_id');

-- ---------------------------------------------------------------------------
-- Worker RPCs (service_role only)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.hive3_p23_worker_put_document_pages(
  uuid, uuid, text, text, integer, jsonb
);
DROP FUNCTION IF EXISTS public.hive3_p23_worker_list_document_pages(uuid, uuid);
DROP FUNCTION IF EXISTS public.hive3_p2px_worker_find_reusable_batch(
  uuid, text, text, text, text, integer, integer
);

CREATE OR REPLACE FUNCTION public.hive3_p23_worker_put_document_pages(
  p_study_run_id uuid,
  p_source_document_id uuid,
  p_source_sha256 text,
  p_read_fingerprint text,
  p_page_set_digest text,
  p_page_count integer,
  p_pages jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hive3, public
AS $$
DECLARE
  v_run hive3.study_runs%ROWTYPE;
  v_doc hive3.source_documents%ROWTYPE;
  v_sha text := lower(btrim(coalesce(p_source_sha256, '')));
  v_fp text := btrim(coalesce(p_read_fingerprint, ''));
  v_set_digest text := lower(btrim(coalesce(p_page_set_digest, '')));
  v_expected_digest text;
  v_elem jsonb;
  v_idx integer := 0;
  v_page_num integer;
  v_page_text text;
  v_page_sha text;
  v_byte_len integer;
  v_method text;
  v_prov jsonb;
  v_existing hive3.document_pages%ROWTYPE;
  v_inserted integer := 0;
  v_replayed integer := 0;
BEGIN
  SELECT * INTO v_run FROM hive3.study_runs WHERE id = p_study_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'study_run_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_doc FROM hive3.source_documents WHERE id = p_source_document_id;
  IF NOT FOUND OR v_doc.deleted_at IS NOT NULL OR v_doc.status <> 'registered' THEN
    RAISE EXCEPTION 'document_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_doc.hive_id <> v_run.hive_id THEN
    RAISE EXCEPTION 'page_hive_mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_doc.sha256 IS NULL OR lower(btrim(v_doc.sha256)) <> v_sha OR v_sha !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'page_source_sha256_mismatch' USING ERRCODE = 'P0001';
  END IF;

  IF char_length(v_fp) = 0 OR char_length(v_fp) > 128 THEN
    RAISE EXCEPTION 'page_read_fingerprint_invalid' USING ERRCODE = 'P0001';
  END IF;

  IF v_set_digest !~ '^sha256:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'page_set_digest_invalid' USING ERRCODE = 'P0001';
  END IF;

  IF p_page_count IS NULL OR p_page_count < 1
    OR p_pages IS NULL OR jsonb_typeof(p_pages) <> 'array'
    OR jsonb_array_length(p_pages) <> p_page_count THEN
    RAISE EXCEPTION 'page_numbering_invalid' USING ERRCODE = 'P0001';
  END IF;

  -- Validate contiguous 1..p_page_count numbering and bounds before writing.
  FOR v_elem IN
    SELECT value
    FROM jsonb_array_elements(p_pages)
    ORDER BY CASE
      WHEN jsonb_typeof(value -> 'page_number') = 'number'
        AND (value ->> 'page_number') ~ '^[0-9]+$'
      THEN (value ->> 'page_number')::integer
      ELSE -1
    END
  LOOP
    v_idx := v_idx + 1;
    IF jsonb_typeof(v_elem) <> 'object'
      OR jsonb_typeof(v_elem -> 'page_number') <> 'number'
      OR (v_elem ->> 'page_number') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'page_numbering_invalid' USING ERRCODE = 'P0001';
    END IF;
    v_page_num := (v_elem ->> 'page_number')::integer;
    IF v_page_num <> v_idx THEN
      RAISE EXCEPTION 'page_numbering_invalid' USING ERRCODE = 'P0001';
    END IF;

    IF jsonb_typeof(v_elem -> 'page_text') <> 'string' THEN
      RAISE EXCEPTION 'page_invalid' USING ERRCODE = 'P0001';
    END IF;
    v_page_text := v_elem ->> 'page_text';
    v_byte_len := octet_length(convert_to(v_page_text, 'UTF8'));
    IF v_byte_len > 65536 THEN
      RAISE EXCEPTION 'page_payload_too_large' USING ERRCODE = 'P0001';
    END IF;

    v_page_sha := 'sha256:' || encode(sha256(convert_to(v_page_text, 'UTF8')), 'hex');
    IF (v_elem ->> 'page_text_sha256') IS DISTINCT FROM v_page_sha
      OR COALESCE((v_elem ->> 'page_byte_length')::integer, -1) <> v_byte_len THEN
      RAISE EXCEPTION 'page_invalid' USING ERRCODE = 'P0001';
    END IF;

    v_method := v_elem ->> 'extraction_method';
    IF v_method IS NULL
      OR v_method NOT IN ('pdf_native', 'image_ocr_local', 'image_ocr_litellm', 'docx_render_v1') THEN
      RAISE EXCEPTION 'page_invalid' USING ERRCODE = 'P0001';
    END IF;

    v_prov := v_elem -> 'provenance_json';
    IF v_prov IS NULL OR jsonb_typeof(v_prov) <> 'object' THEN
      RAISE EXCEPTION 'page_invalid' USING ERRCODE = 'P0001';
    END IF;
    IF octet_length(v_prov::text) > 65536 THEN
      RAISE EXCEPTION 'page_payload_too_large' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  v_expected_digest := hive3.p23_compute_page_set_digest(v_sha, p_page_count, p_pages);
  IF v_expected_digest IS NULL OR v_expected_digest <> v_set_digest THEN
    RAISE EXCEPTION 'page_set_digest_mismatch' USING ERRCODE = 'P0001';
  END IF;

  FOR v_elem IN
    SELECT value
    FROM jsonb_array_elements(p_pages)
    ORDER BY ((value ->> 'page_number')::integer)
  LOOP
    v_page_num := (v_elem ->> 'page_number')::integer;
    v_page_text := v_elem ->> 'page_text';
    v_page_sha := v_elem ->> 'page_text_sha256';
    v_byte_len := (v_elem ->> 'page_byte_length')::integer;
    v_method := v_elem ->> 'extraction_method';
    v_prov := v_elem -> 'provenance_json';

    SELECT * INTO v_existing
    FROM hive3.document_pages
    WHERE source_document_id = p_source_document_id
      AND page_set_digest = v_set_digest
      AND page_number = v_page_num;

    IF FOUND THEN
      IF v_existing.hive_id = v_run.hive_id
        AND v_existing.source_sha256 = v_sha
        AND v_existing.read_fingerprint = v_fp
        AND v_existing.page_set_digest = v_set_digest
        AND v_existing.page_count = p_page_count
        AND v_existing.page_text_sha256 = v_page_sha
        AND v_existing.page_byte_length = v_byte_len
        AND v_existing.page_text = v_page_text
        AND v_existing.extraction_method = v_method THEN
        v_replayed := v_replayed + 1;
      ELSE
        RAISE EXCEPTION 'page_hash_conflict' USING ERRCODE = 'P0001';
      END IF;
    ELSE
      BEGIN
        INSERT INTO hive3.document_pages (
          hive_id,
          source_document_id,
          first_study_run_id,
          source_sha256,
          read_fingerprint,
          page_set_digest,
          page_count,
          page_number,
          page_text,
          page_text_sha256,
          page_byte_length,
          extraction_method,
          extraction_status,
          provenance_json
        )
        VALUES (
          v_run.hive_id,
          p_source_document_id,
          p_study_run_id,
          v_sha,
          v_fp,
          v_set_digest,
          p_page_count,
          v_page_num,
          v_page_text,
          v_page_sha,
          v_byte_len,
          v_method,
          'SUCCEEDED',
          v_prov
        );
        v_inserted := v_inserted + 1;
      EXCEPTION
        WHEN unique_violation THEN
          SELECT * INTO v_existing
          FROM hive3.document_pages
          WHERE source_document_id = p_source_document_id
            AND page_set_digest = v_set_digest
            AND page_number = v_page_num;
          IF FOUND
            AND v_existing.hive_id = v_run.hive_id
            AND v_existing.source_sha256 = v_sha
            AND v_existing.read_fingerprint = v_fp
            AND v_existing.page_set_digest = v_set_digest
            AND v_existing.page_count = p_page_count
            AND v_existing.page_text_sha256 = v_page_sha
            AND v_existing.page_byte_length = v_byte_len
            AND v_existing.page_text = v_page_text
            AND v_existing.extraction_method = v_method THEN
            v_replayed := v_replayed + 1;
          ELSE
            RAISE EXCEPTION 'page_hash_conflict' USING ERRCODE = 'P0001';
          END IF;
      END;
    END IF;
  END LOOP;

  RETURN json_build_object(
    'source_document_id', p_source_document_id,
    'hive_id', v_run.hive_id,
    'source_sha256', v_sha,
    'read_fingerprint', v_fp,
    'page_set_digest', v_set_digest,
    'page_count', p_page_count,
    'inserted_count', v_inserted,
    'replayed_count', v_replayed
  );
EXCEPTION
  WHEN check_violation OR not_null_violation THEN
    RAISE EXCEPTION 'page_invalid' USING ERRCODE = 'P0001';
END;
$$;

CREATE OR REPLACE FUNCTION public.hive3_p23_worker_list_document_pages(
  p_study_run_id uuid,
  p_source_document_id uuid,
  p_read_fingerprint text,
  p_page_set_digest text
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = hive3, public
AS $$
DECLARE
  v_run hive3.study_runs%ROWTYPE;
  v_doc hive3.source_documents%ROWTYPE;
  v_fp text := btrim(coalesce(p_read_fingerprint, ''));
  v_set_digest text := lower(btrim(coalesce(p_page_set_digest, '')));
  v_pages json;
  v_page_count integer;
BEGIN
  SELECT * INTO v_run FROM hive3.study_runs WHERE id = p_study_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'study_run_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_doc FROM hive3.source_documents WHERE id = p_source_document_id;
  IF NOT FOUND OR v_doc.deleted_at IS NOT NULL OR v_doc.status <> 'registered' THEN
    RAISE EXCEPTION 'document_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_doc.hive_id <> v_run.hive_id THEN
    RAISE EXCEPTION 'page_hive_mismatch' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_fp) = 0 OR char_length(v_fp) > 128 THEN
    RAISE EXCEPTION 'page_read_fingerprint_invalid' USING ERRCODE = 'P0001';
  END IF;

  IF v_set_digest !~ '^sha256:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'page_set_digest_invalid' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(
    json_agg(
      json_build_object(
        'id', p.id,
        'hive_id', p.hive_id,
        'source_document_id', p.source_document_id,
        'first_study_run_id', p.first_study_run_id,
        'source_sha256', p.source_sha256,
        'read_fingerprint', p.read_fingerprint,
        'page_set_digest', p.page_set_digest,
        'page_count', p.page_count,
        'page_number', p.page_number,
        'page_text', p.page_text,
        'page_text_sha256', p.page_text_sha256,
        'page_byte_length', p.page_byte_length,
        'extraction_method', p.extraction_method,
        'extraction_status', p.extraction_status,
        'provenance_json', p.provenance_json,
        'created_at', p.created_at
      )
      ORDER BY p.page_number ASC
    ),
    '[]'::json
  )
  INTO v_pages
  FROM hive3.document_pages p
  WHERE p.source_document_id = p_source_document_id
    AND p.hive_id = v_run.hive_id
    AND p.read_fingerprint = v_fp
    AND p.page_set_digest = v_set_digest;

  IF json_array_length(v_pages) > 0 THEN
    v_page_count := (v_pages -> 0 ->> 'page_count')::integer;
    IF v_page_count IS NULL
      OR v_page_count < 1
      OR json_array_length(v_pages) <> v_page_count THEN
      RAISE EXCEPTION 'page_generation_incomplete' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN json_build_object(
    'found', json_array_length(v_pages) > 0,
    'source_document_id', v_doc.id,
    'hive_id', v_doc.hive_id,
    'source_sha256', lower(btrim(v_doc.sha256)),
    'read_fingerprint', v_fp,
    'page_set_digest', v_set_digest,
    'pages', v_pages
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------

ALTER TABLE hive3.document_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE hive3.document_pages FORCE ROW LEVEL SECURITY;

-- No authenticated policies: document_pages is worker-only via DEFINER RPCs.

REVOKE ALL ON hive3.document_pages FROM PUBLIC;
REVOKE ALL ON hive3.document_pages FROM anon;
REVOKE ALL ON hive3.document_pages FROM authenticated;

REVOKE ALL ON FUNCTION public.hive3_p23_worker_put_document_pages(
  uuid, uuid, text, text, text, integer, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p23_worker_put_document_pages(
  uuid, uuid, text, text, text, integer, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.hive3_p23_worker_put_document_pages(
  uuid, uuid, text, text, text, integer, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_p23_worker_put_document_pages(
  uuid, uuid, text, text, text, integer, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.hive3_p23_worker_list_document_pages(
  uuid, uuid, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p23_worker_list_document_pages(
  uuid, uuid, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.hive3_p23_worker_list_document_pages(
  uuid, uuid, text, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_p23_worker_list_document_pages(
  uuid, uuid, text, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- extraction_batches: bind each batch to the persisted page-set generation
-- (Gate 2b table already applied; nullable for legacy rows without pages)
-- ---------------------------------------------------------------------------

ALTER TABLE hive3.extraction_batches
  ADD COLUMN IF NOT EXISTS page_set_digest text;

ALTER TABLE hive3.extraction_batches
  DROP CONSTRAINT IF EXISTS extraction_batches_page_set_digest_format;

ALTER TABLE hive3.extraction_batches
  ADD CONSTRAINT extraction_batches_page_set_digest_format CHECK (
    page_set_digest IS NULL OR page_set_digest ~ '^sha256:[0-9a-f]{64}$'
  );

DROP INDEX IF EXISTS extraction_batches_hive_reuse_idx;

CREATE INDEX IF NOT EXISTS extraction_batches_hive_reuse_idx
  ON hive3.extraction_batches (
    hive_id,
    source_sha256,
    read_fingerprint,
    page_set_digest,
    prompt_digest,
    model_alias,
    page_start,
    page_end
  )
  WHERE status = 'SUCCEEDED';

CREATE OR REPLACE FUNCTION public.hive3_p2px_worker_put_extraction_batch(
  p_study_run_id uuid,
  p_batch jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hive3, public
AS $$
DECLARE
  v_source uuid := (p_batch ->> 'source_document_id')::uuid;
  v_digest text := btrim(p_batch ->> 'prompt_digest');
  v_page_start integer := (p_batch ->> 'page_start')::integer;
  v_sha text := p_batch ->> 'extraction_sha256';
  v_status text := p_batch ->> 'status';
  v_disposition text := p_batch ->> 'disposition';
  v_page_set text := lower(btrim(coalesce(p_batch ->> 'page_set_digest', '')));
  v_existing hive3.extraction_batches%ROWTYPE;
  v_row hive3.extraction_batches%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM hive3.study_runs WHERE id = p_study_run_id) THEN
    RAISE EXCEPTION 'study_run_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_page_set = '' OR v_page_set !~ '^sha256:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'page_set_digest_invalid' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_existing
  FROM hive3.extraction_batches
  WHERE study_run_id = p_study_run_id
    AND source_document_id = v_source
    AND prompt_digest = v_digest
    AND page_start = v_page_start;
  IF FOUND THEN
    IF v_existing.extraction_sha256 IS NOT DISTINCT FROM v_sha
      AND v_existing.status = v_status
      AND v_existing.disposition = v_disposition THEN
      RETURN json_build_object('inserted', false, 'batch', hive3.p2px_batch_summary_json(v_existing));
    END IF;
    RAISE EXCEPTION 'batch_hash_conflict' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO hive3.extraction_batches (
    hive_id, study_run_id, source_document_id, source_sha256, read_fingerprint, page_set_digest,
    prompt_digest, pack_id, pack_version, pack_digest, output_contract_version, partition_id,
    page_start, page_end, is_partial, model_alias, provider_model, gateway_request_id,
    input_tokens, output_tokens, cached_input_tokens, cache_write_tokens, cache_status,
    latency_ms, finish_reason, extraction_json, extraction_sha256, extraction_byte_length,
    validation_json, accepted_facts_json, disposition, classification_status,
    primary_document_type_id, validator_version, status, error_code, error_reason,
    reused_from_batch_id
  )
  VALUES (
    (SELECT hive_id FROM hive3.study_runs WHERE id = p_study_run_id),
    p_study_run_id,
    v_source,
    p_batch ->> 'source_sha256',
    p_batch ->> 'read_fingerprint',
    v_page_set,
    v_digest,
    p_batch ->> 'pack_id',
    p_batch ->> 'pack_version',
    p_batch ->> 'pack_digest',
    p_batch ->> 'output_contract_version',
    p_batch ->> 'partition_id',
    v_page_start,
    (p_batch ->> 'page_end')::integer,
    coalesce((p_batch ->> 'is_partial')::boolean, false),
    p_batch ->> 'model_alias',
    p_batch ->> 'provider_model',
    p_batch ->> 'gateway_request_id',
    (p_batch ->> 'input_tokens')::integer,
    (p_batch ->> 'output_tokens')::integer,
    (p_batch ->> 'cached_input_tokens')::integer,
    (p_batch ->> 'cache_write_tokens')::integer,
    coalesce(p_batch ->> 'cache_status', 'NOT_REPORTED'),
    (p_batch ->> 'latency_ms')::integer,
    p_batch ->> 'finish_reason',
    CASE WHEN jsonb_typeof(p_batch -> 'extraction_json') IN ('object', 'array')
      THEN p_batch -> 'extraction_json' ELSE NULL END,
    v_sha,
    (p_batch ->> 'extraction_byte_length')::integer,
    p_batch -> 'validation_json',
    coalesce(p_batch -> 'accepted_facts_json', '[]'::jsonb),
    v_disposition,
    p_batch ->> 'classification_status',
    p_batch ->> 'primary_document_type_id',
    p_batch ->> 'validator_version',
    v_status,
    p_batch ->> 'error_code',
    p_batch ->> 'error_reason',
    (p_batch ->> 'reused_from_batch_id')::uuid
  )
  RETURNING * INTO v_row;

  RETURN json_build_object('inserted', true, 'batch', hive3.p2px_batch_summary_json(v_row));
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM hive3.extraction_batches
    WHERE study_run_id = p_study_run_id
      AND source_document_id = v_source
      AND prompt_digest = v_digest
      AND page_start = v_page_start;
    IF FOUND
      AND v_existing.extraction_sha256 IS NOT DISTINCT FROM v_sha
      AND v_existing.status = v_status
      AND v_existing.disposition = v_disposition THEN
      RETURN json_build_object('inserted', false, 'batch', hive3.p2px_batch_summary_json(v_existing));
    END IF;
    RAISE EXCEPTION 'batch_hash_conflict' USING ERRCODE = 'P0001';
  WHEN check_violation OR not_null_violation THEN
    RAISE EXCEPTION 'batch_invalid' USING ERRCODE = 'P0001';
END;
$$;

CREATE OR REPLACE FUNCTION public.hive3_p2px_worker_find_reusable_batch(
  p_study_run_id uuid,
  p_source_sha256 text,
  p_read_fingerprint text,
  p_page_set_digest text,
  p_prompt_digest text,
  p_model_alias text,
  p_page_start integer,
  p_page_end integer
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = hive3, public
AS $$
DECLARE
  v_hive uuid;
  v_page_set text := lower(btrim(coalesce(p_page_set_digest, '')));
  v_row hive3.extraction_batches%ROWTYPE;
BEGIN
  SELECT hive_id INTO v_hive FROM hive3.study_runs WHERE id = p_study_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'study_run_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_page_set = '' OR v_page_set !~ '^sha256:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'page_set_digest_invalid' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_row
  FROM hive3.extraction_batches b
  WHERE b.hive_id = v_hive
    AND b.study_run_id <> p_study_run_id
    AND b.source_sha256 = btrim(p_source_sha256)
    AND b.read_fingerprint = btrim(p_read_fingerprint)
    AND b.page_set_digest = v_page_set
    AND b.prompt_digest = btrim(p_prompt_digest)
    AND b.model_alias = btrim(p_model_alias)
    AND b.page_start = p_page_start
    AND b.page_end = p_page_end
    AND b.status = 'SUCCEEDED'
    AND b.disposition IN ('VALID', 'VALID_WITH_REJECTIONS')
  ORDER BY b.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('found', false);
  END IF;

  RETURN json_build_object(
    'found', true,
    'batch', json_build_object(
      'id', v_row.id,
      'provider_model', v_row.provider_model,
      'finish_reason', v_row.finish_reason,
      'extraction_json', v_row.extraction_json,
      'extraction_sha256', v_row.extraction_sha256,
      'extraction_byte_length', v_row.extraction_byte_length,
      'validation_json', v_row.validation_json,
      'accepted_facts_json', v_row.accepted_facts_json,
      'disposition', v_row.disposition,
      'classification_status', v_row.classification_status,
      'primary_document_type_id', v_row.primary_document_type_id,
      'validator_version', v_row.validator_version
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.hive3_p2px_worker_find_reusable_batch(
  uuid, text, text, text, text, text, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p2px_worker_find_reusable_batch(
  uuid, text, text, text, text, text, integer, integer
) FROM anon;
REVOKE ALL ON FUNCTION public.hive3_p2px_worker_find_reusable_batch(
  uuid, text, text, text, text, text, integer, integer
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_p2px_worker_find_reusable_batch(
  uuid, text, text, text, text, text, integer, integer
) TO service_role;

COMMIT;
