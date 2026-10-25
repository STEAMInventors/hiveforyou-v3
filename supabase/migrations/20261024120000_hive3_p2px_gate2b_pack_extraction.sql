-- P1.P Gate 2b (selected-Pack slice) — pack_extraction_prompts + extraction_batches (T5).
-- Authority: docs/design/p2.2-px/PACK-EXTRACTION-PROMPT-ARCHITECTURE.md §10,
--            docs/HIVEFORYOU-V3-DEVELOPMENT-PLAN-database-first-PROPOSED.md §3.1.6 (T5).
-- Depends on: 20261022100000 (Gate 1), 20261022210000 (P1.5 submit), upload baseline.
-- Scope: selected-Pack extraction only. document_pages, extraction_schemas and generic-path
--        batch columns remain for the deferred generic design / later Gate 2b slice.
-- Do not execute without operator authorization.

BEGIN;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hive3.pack_extraction_prompts (
  prompt_digest text PRIMARY KEY,
  prompt_template_version text NOT NULL,
  extraction_rules_version text NOT NULL,
  output_contract_version text NOT NULL,
  pack_id text NOT NULL,
  pack_version text NOT NULL,
  pack_digest text NOT NULL,
  pack_canonical_digest text NOT NULL,
  catalog_digest text NOT NULL,
  output_schema_digest text NOT NULL,
  partition_id text,
  partition_plan_digest text,
  system_text text NOT NULL,
  prompt_byte_length integer NOT NULL,
  estimated_prompt_tokens integer NOT NULL,
  first_study_run_id uuid REFERENCES hive3.study_runs (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pack_extraction_prompts_digest_format CHECK (prompt_digest ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT pack_extraction_prompts_digest_matches_text CHECK (
    prompt_digest = 'sha256:' || encode(sha256(convert_to(system_text, 'UTF8')), 'hex')
  ),
  CONSTRAINT pack_extraction_prompts_byte_length CHECK (
    prompt_byte_length = octet_length(convert_to(system_text, 'UTF8'))
  ),
  CONSTRAINT pack_extraction_prompts_system_text_size CHECK (
    octet_length(convert_to(system_text, 'UTF8')) <= 1048576
  )
);

COMMENT ON TABLE hive3.pack_extraction_prompts IS
  'Compiled selected-Pack system prompt stored once per prompt_digest (pack data + fixed Hive text; no tenant data). Insert-only; service-role RPCs only.';

CREATE TABLE IF NOT EXISTS hive3.extraction_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hive_id uuid NOT NULL REFERENCES hive3.hives (id) ON DELETE CASCADE,
  study_run_id uuid NOT NULL REFERENCES hive3.study_runs (id) ON DELETE CASCADE,
  source_document_id uuid NOT NULL REFERENCES hive3.source_documents (id) ON DELETE CASCADE,
  source_sha256 text NOT NULL,
  read_fingerprint text NOT NULL,
  prompt_digest text NOT NULL REFERENCES hive3.pack_extraction_prompts (prompt_digest),
  pack_id text NOT NULL,
  pack_version text NOT NULL,
  pack_digest text NOT NULL,
  output_contract_version text NOT NULL,
  partition_id text,
  page_start integer NOT NULL,
  page_end integer NOT NULL,
  is_partial boolean NOT NULL DEFAULT false,
  model_alias text NOT NULL,
  provider_model text,
  gateway_request_id text,
  input_tokens integer,
  output_tokens integer,
  cached_input_tokens integer,
  cache_write_tokens integer,
  cache_status text NOT NULL DEFAULT 'NOT_REPORTED',
  latency_ms integer,
  finish_reason text,
  extraction_json jsonb,
  extraction_sha256 text,
  extraction_byte_length integer,
  validation_json jsonb NOT NULL,
  accepted_facts_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  disposition text NOT NULL,
  classification_status text,
  primary_document_type_id text,
  validator_version text NOT NULL,
  status text NOT NULL,
  error_code text,
  error_reason text,
  reused_from_batch_id uuid REFERENCES hive3.extraction_batches (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT extraction_batches_page_range CHECK (page_start >= 1 AND page_end >= page_start),
  CONSTRAINT extraction_batches_status_check CHECK (status IN ('SUCCEEDED', 'FAILED')),
  CONSTRAINT extraction_batches_disposition_check CHECK (
    disposition IN ('VALID', 'VALID_WITH_REJECTIONS', 'UNRECOGNIZED', 'UNUSABLE')
  ),
  CONSTRAINT extraction_batches_status_disposition CHECK (
    (status = 'FAILED') = (disposition = 'UNUSABLE')
  ),
  CONSTRAINT extraction_batches_succeeded_has_output CHECK (
    status = 'FAILED' OR extraction_json IS NOT NULL
  ),
  CONSTRAINT extraction_batches_failed_has_error CHECK (
    status = 'SUCCEEDED' OR (error_code IS NOT NULL AND error_reason IS NOT NULL)
  ),
  CONSTRAINT extraction_batches_cache_status_check CHECK (
    cache_status IN ('HIT', 'PARTIAL', 'MISS', 'NOT_REPORTED')
  ),
  CONSTRAINT extraction_batches_classification_status_check CHECK (
    classification_status IS NULL
    OR classification_status IN ('CLASSIFIED', 'AMBIGUOUS', 'COMPOUND', 'UNRECOGNIZED')
  ),
  CONSTRAINT extraction_batches_error_reason_safe CHECK (
    error_reason IS NULL OR error_reason ~ '^[a-z0-9_]{1,64}$'
  ),
  CONSTRAINT extraction_batches_extraction_size CHECK (
    extraction_json IS NULL OR octet_length(extraction_json::text) <= 2097152
  ),
  CONSTRAINT extraction_batches_accepted_facts_size CHECK (
    octet_length(accepted_facts_json::text) <= 2097152
  ),
  CONSTRAINT extraction_batches_validation_size CHECK (
    octet_length(validation_json::text) <= 524288
  ),
  CONSTRAINT extraction_batches_idempotency_key UNIQUE (
    study_run_id, source_document_id, prompt_digest, page_start
  )
);

COMMENT ON TABLE hive3.extraction_batches IS
  'Selected-Pack extraction per document window: complete candidate JSON, validation, pins, usage. Insert-only; reuse never crosses Hives.';

CREATE INDEX IF NOT EXISTS extraction_batches_study_run_idx
  ON hive3.extraction_batches (study_run_id, source_document_id, page_start);

CREATE INDEX IF NOT EXISTS extraction_batches_hive_reuse_idx
  ON hive3.extraction_batches (
    hive_id, source_sha256, read_fingerprint, prompt_digest, model_alias, page_start, page_end
  )
  WHERE status = 'SUCCEEDED';

-- ---------------------------------------------------------------------------
-- Triggers: Hive binding and immutability
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION hive3.p2px_extraction_batches_bind_hive()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = hive3, public
AS $$
DECLARE
  v_run_hive uuid;
  v_source_hive uuid;
BEGIN
  SELECT hive_id INTO v_run_hive FROM hive3.study_runs WHERE id = NEW.study_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'study_run_not_found' USING ERRCODE = 'P0002';
  END IF;
  SELECT hive_id INTO v_source_hive FROM hive3.source_documents WHERE id = NEW.source_document_id;
  IF NOT FOUND OR v_source_hive <> v_run_hive THEN
    RAISE EXCEPTION 'batch_hive_mismatch' USING ERRCODE = '42501';
  END IF;
  NEW.hive_id := v_run_hive;
  IF NEW.reused_from_batch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM hive3.extraction_batches b
    WHERE b.id = NEW.reused_from_batch_id AND b.hive_id = v_run_hive
  ) THEN
    RAISE EXCEPTION 'batch_hive_mismatch' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS extraction_batches_bind_hive ON hive3.extraction_batches;
CREATE TRIGGER extraction_batches_bind_hive
  BEFORE INSERT ON hive3.extraction_batches
  FOR EACH ROW EXECUTE FUNCTION hive3.p2px_extraction_batches_bind_hive();

-- TG_ARGV[0] names the one FK column an ON DELETE SET NULL cascade may clear (Hive deletion).
CREATE OR REPLACE FUNCTION hive3.p2px_reject_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_nullable_fk text := TG_ARGV[0];
BEGIN
  IF v_nullable_fk IS NOT NULL
    AND (to_jsonb(NEW) - v_nullable_fk) = (to_jsonb(OLD) - v_nullable_fk)
    AND to_jsonb(NEW) -> v_nullable_fk = 'null'::jsonb THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'extraction_row_immutable' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS pack_extraction_prompts_immutable ON hive3.pack_extraction_prompts;
CREATE TRIGGER pack_extraction_prompts_immutable
  BEFORE UPDATE ON hive3.pack_extraction_prompts
  FOR EACH ROW EXECUTE FUNCTION hive3.p2px_reject_update('first_study_run_id');

DROP TRIGGER IF EXISTS extraction_batches_immutable ON hive3.extraction_batches;
CREATE TRIGGER extraction_batches_immutable
  BEFORE UPDATE ON hive3.extraction_batches
  FOR EACH ROW EXECUTE FUNCTION hive3.p2px_reject_update('reused_from_batch_id');

-- ---------------------------------------------------------------------------
-- JSON projections
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION hive3.p2px_batch_summary_json(p_row hive3.extraction_batches)
RETURNS json
LANGUAGE sql
STABLE
AS $$
  SELECT json_build_object(
    'id', p_row.id,
    'study_run_id', p_row.study_run_id,
    'source_document_id', p_row.source_document_id,
    'prompt_digest', p_row.prompt_digest,
    'page_start', p_row.page_start,
    'page_end', p_row.page_end,
    'status', p_row.status,
    'disposition', p_row.disposition,
    'classification_status', p_row.classification_status,
    'primary_document_type_id', p_row.primary_document_type_id,
    'extraction_sha256', p_row.extraction_sha256,
    'validation_json', p_row.validation_json,
    'error_code', p_row.error_code,
    'error_reason', p_row.error_reason,
    'reused_from_batch_id', p_row.reused_from_batch_id
  );
$$;

-- ---------------------------------------------------------------------------
-- Worker RPCs (service_role only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hive3_p2px_worker_put_extraction_prompt(
  p_prompt jsonb,
  p_first_study_run_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hive3, public
AS $$
DECLARE
  v_digest text := btrim(p_prompt ->> 'prompt_digest');
  v_text text := p_prompt ->> 'system_text';
  v_existing hive3.pack_extraction_prompts%ROWTYPE;
BEGIN
  SELECT * INTO v_existing FROM hive3.pack_extraction_prompts WHERE prompt_digest = v_digest;
  IF FOUND THEN
    IF v_existing.system_text = v_text THEN
      RETURN json_build_object('prompt_digest', v_digest, 'inserted', false);
    END IF;
    RAISE EXCEPTION 'prompt_digest_collision' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO hive3.pack_extraction_prompts (
    prompt_digest, prompt_template_version, extraction_rules_version, output_contract_version,
    pack_id, pack_version, pack_digest, pack_canonical_digest, catalog_digest,
    output_schema_digest, partition_id, partition_plan_digest, system_text,
    prompt_byte_length, estimated_prompt_tokens, first_study_run_id
  )
  VALUES (
    v_digest,
    p_prompt ->> 'prompt_template_version',
    p_prompt ->> 'extraction_rules_version',
    p_prompt ->> 'output_contract_version',
    p_prompt ->> 'pack_id',
    p_prompt ->> 'pack_version',
    p_prompt ->> 'pack_digest',
    p_prompt ->> 'pack_canonical_digest',
    p_prompt ->> 'catalog_digest',
    p_prompt ->> 'output_schema_digest',
    p_prompt ->> 'partition_id',
    p_prompt ->> 'partition_plan_digest',
    v_text,
    (p_prompt ->> 'prompt_byte_length')::integer,
    (p_prompt ->> 'estimated_prompt_tokens')::integer,
    p_first_study_run_id
  );
  RETURN json_build_object('prompt_digest', v_digest, 'inserted', true);
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing FROM hive3.pack_extraction_prompts WHERE prompt_digest = v_digest;
    IF FOUND AND v_existing.system_text = v_text THEN
      RETURN json_build_object('prompt_digest', v_digest, 'inserted', false);
    END IF;
    RAISE EXCEPTION 'prompt_digest_collision' USING ERRCODE = 'P0001';
  WHEN check_violation THEN
    RAISE EXCEPTION 'prompt_invalid' USING ERRCODE = 'P0001';
END;
$$;

CREATE OR REPLACE FUNCTION public.hive3_p2px_worker_get_run_batch(
  p_study_run_id uuid,
  p_source_document_id uuid,
  p_prompt_digest text,
  p_page_start integer
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = hive3, public
AS $$
DECLARE
  v_row hive3.extraction_batches%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM hive3.extraction_batches
  WHERE study_run_id = p_study_run_id
    AND source_document_id = p_source_document_id
    AND prompt_digest = btrim(p_prompt_digest)
    AND page_start = p_page_start;
  IF NOT FOUND THEN
    RETURN json_build_object('found', false);
  END IF;
  RETURN json_build_object('found', true, 'batch', hive3.p2px_batch_summary_json(v_row));
END;
$$;

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
  v_existing hive3.extraction_batches%ROWTYPE;
  v_row hive3.extraction_batches%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM hive3.study_runs WHERE id = p_study_run_id) THEN
    RAISE EXCEPTION 'study_run_not_found' USING ERRCODE = 'P0002';
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
    hive_id, study_run_id, source_document_id, source_sha256, read_fingerprint, prompt_digest,
    pack_id, pack_version, pack_digest, output_contract_version, partition_id,
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
  v_row hive3.extraction_batches%ROWTYPE;
BEGIN
  SELECT hive_id INTO v_hive FROM hive3.study_runs WHERE id = p_study_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'study_run_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_row
  FROM hive3.extraction_batches b
  WHERE b.hive_id = v_hive
    AND b.study_run_id <> p_study_run_id
    AND b.source_sha256 = btrim(p_source_sha256)
    AND b.read_fingerprint = btrim(p_read_fingerprint)
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

-- ---------------------------------------------------------------------------
-- Owner read RPC (authenticated; owner-scoped; no prompt text, no raw candidate JSON)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hive3_p2px_owner_list_extraction_batches(p_study_run_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = hive3, public
AS $$
DECLARE
  v_run hive3.study_runs%ROWTYPE;
BEGIN
  SELECT r.* INTO v_run
  FROM hive3.study_runs r
  JOIN hive3.hives h ON h.id = r.hive_id
  WHERE r.id = p_study_run_id
    AND h.owner_user_id = auth.uid()
    AND h.archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  RETURN json_build_object(
    'contract_version', 'pack-extraction-owner-view@1',
    'study_run_id', v_run.id,
    'hive_id', v_run.hive_id,
    'batches', coalesce(
      (
        SELECT json_agg(
          json_build_object(
            'batch_id', b.id,
            'source_document_id', b.source_document_id,
            'filename', d.filename,
            'page_start', b.page_start,
            'page_end', b.page_end,
            'is_partial', b.is_partial,
            'status', b.status,
            'disposition', b.disposition,
            'classification_status', b.classification_status,
            'primary_document_type_id', b.primary_document_type_id,
            'pack_id', b.pack_id,
            'pack_version', b.pack_version,
            'counts', b.validation_json -> 'counts',
            'rejection_reason_codes', coalesce(
              (
                SELECT json_agg(DISTINCT r ->> 'reason_code')
                FROM jsonb_array_elements(b.validation_json -> 'rejections') AS r
              ),
              '[]'::json
            ),
            'error_code', b.error_code,
            'error_reason', b.error_reason,
            'reused', b.reused_from_batch_id IS NOT NULL,
            'accepted_facts', b.accepted_facts_json
          )
          ORDER BY d.created_at, b.source_document_id, b.page_start
        )
        FROM hive3.extraction_batches b
        JOIN hive3.source_documents d ON d.id = b.source_document_id
        WHERE b.study_run_id = v_run.id
          AND b.hive_id = v_run.hive_id
      ),
      '[]'::json
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------

ALTER TABLE hive3.pack_extraction_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hive3.pack_extraction_prompts FORCE ROW LEVEL SECURITY;
ALTER TABLE hive3.extraction_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE hive3.extraction_batches FORCE ROW LEVEL SECURITY;

-- No authenticated policies: both tables are worker-only via DEFINER RPCs.

REVOKE ALL ON hive3.pack_extraction_prompts FROM PUBLIC;
REVOKE ALL ON hive3.pack_extraction_prompts FROM anon;
REVOKE ALL ON hive3.pack_extraction_prompts FROM authenticated;
REVOKE ALL ON hive3.extraction_batches FROM PUBLIC;
REVOKE ALL ON hive3.extraction_batches FROM anon;
REVOKE ALL ON hive3.extraction_batches FROM authenticated;

REVOKE ALL ON FUNCTION public.hive3_p2px_worker_put_extraction_prompt(jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p2px_worker_put_extraction_prompt(jsonb, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hive3_p2px_worker_put_extraction_prompt(jsonb, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_p2px_worker_put_extraction_prompt(jsonb, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.hive3_p2px_worker_get_run_batch(uuid, uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p2px_worker_get_run_batch(uuid, uuid, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.hive3_p2px_worker_get_run_batch(uuid, uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_p2px_worker_get_run_batch(uuid, uuid, text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.hive3_p2px_worker_put_extraction_batch(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p2px_worker_put_extraction_batch(uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.hive3_p2px_worker_put_extraction_batch(uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_p2px_worker_put_extraction_batch(uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.hive3_p2px_worker_find_reusable_batch(
  uuid, text, text, text, text, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p2px_worker_find_reusable_batch(
  uuid, text, text, text, text, integer, integer
) FROM anon;
REVOKE ALL ON FUNCTION public.hive3_p2px_worker_find_reusable_batch(
  uuid, text, text, text, text, integer, integer
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_p2px_worker_find_reusable_batch(
  uuid, text, text, text, text, integer, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.hive3_p2px_owner_list_extraction_batches(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p2px_owner_list_extraction_batches(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hive3_p2px_owner_list_extraction_batches(uuid) TO authenticated;

COMMIT;
