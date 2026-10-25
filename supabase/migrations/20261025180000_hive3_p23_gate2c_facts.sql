-- P2.3 Gate 2c — hive3.facts + hive3.fact_evidence (selected-Pack verification slice).
-- Authority: docs/NEXT.md (P2.3), docs/HIVEFORYOU-V3-DEVELOPMENT-PLAN-database-first-PROPOSED.md §3.1.2 (Gate 2c),
--            docs/HIVEFORYOU-V3-DATABASE-DESIGN-v0.1.md §2 (facts, fact_evidence).
-- Depends on: 20261024120000 (extraction_batches), 20261025150000 (document_pages).
-- Scope: durable independent evidence-verification dispositions for accepted Pack candidates.
-- Do not execute without operator authorization.

BEGIN;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hive3.facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hive_id uuid NOT NULL REFERENCES hive3.hives (id) ON DELETE CASCADE,
  study_run_id uuid NOT NULL REFERENCES hive3.study_runs (id) ON DELETE CASCADE,
  source_document_id uuid NOT NULL REFERENCES hive3.source_documents (id) ON DELETE CASCADE,
  origin_batch_id uuid NOT NULL REFERENCES hive3.extraction_batches (id) ON DELETE CASCADE,
  candidate_key text NOT NULL,
  kind text NOT NULL DEFAULT 'pack_extraction_candidate',
  pack_id text NOT NULL,
  pack_version text NOT NULL,
  record_type_id text NOT NULL,
  record_local_id text NOT NULL,
  parent_record_local_id text,
  segment_index integer NOT NULL,
  fact_id text NOT NULL,
  candidate_status text NOT NULL,
  value_json jsonb,
  source_sha256 text NOT NULL,
  read_fingerprint text NOT NULL,
  page_set_digest text NOT NULL,
  verification_disposition text NOT NULL,
  verification_reason_code text,
  verifier_version text NOT NULL,
  evidence_anchors_verified integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facts_candidate_key_format CHECK (candidate_key ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT facts_kind_check CHECK (kind IN ('pack_extraction_candidate')),
  CONSTRAINT facts_candidate_status_check CHECK (
    candidate_status IN ('OBSERVED', 'UNCERTAIN', 'NOT_FOUND', 'NOT_APPLICABLE')
  ),
  CONSTRAINT facts_verification_disposition_check CHECK (
    verification_disposition IN ('VERIFIED', 'REJECTED', 'UNRESOLVED')
  ),
  CONSTRAINT facts_verification_reason_safe CHECK (
    verification_reason_code IS NULL OR verification_reason_code ~ '^[a-z0-9_]{1,64}$'
  ),
  CONSTRAINT facts_verified_has_no_reason CHECK (
    verification_disposition <> 'VERIFIED' OR verification_reason_code IS NULL
  ),
  CONSTRAINT facts_nonverified_has_reason CHECK (
    verification_disposition = 'VERIFIED' OR verification_reason_code IS NOT NULL
  ),
  CONSTRAINT facts_source_sha256_format CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT facts_read_fingerprint_not_blank CHECK (
    char_length(btrim(read_fingerprint)) > 0 AND char_length(read_fingerprint) <= 128
  ),
  CONSTRAINT facts_page_set_digest_format CHECK (
    page_set_digest ~ '^sha256:[0-9a-f]{64}$'
  ),
  CONSTRAINT facts_segment_index_nonneg CHECK (segment_index >= 0),
  CONSTRAINT facts_value_json_size CHECK (
    value_json IS NULL OR octet_length(value_json::text) <= 65536
  ),
  CONSTRAINT facts_idempotency_key UNIQUE (study_run_id, origin_batch_id, candidate_key)
);

COMMENT ON TABLE hive3.facts IS
  'Gate 2c verified observations (selected-Pack slice). Insert-only; Worker service_role RPCs only.';

CREATE INDEX IF NOT EXISTS facts_study_run_idx
  ON hive3.facts (study_run_id, source_document_id);

CREATE INDEX IF NOT EXISTS facts_hive_batch_idx
  ON hive3.facts (hive_id, origin_batch_id);

CREATE TABLE IF NOT EXISTS hive3.fact_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_id uuid NOT NULL REFERENCES hive3.facts (id) ON DELETE CASCADE,
  source_document_id uuid NOT NULL REFERENCES hive3.source_documents (id) ON DELETE CASCADE,
  document_page_id uuid REFERENCES hive3.document_pages (id) ON DELETE SET NULL,
  anchor_index integer NOT NULL,
  page_number integer NOT NULL,
  exact_quote text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fact_evidence_anchor_index_nonneg CHECK (anchor_index >= 0),
  CONSTRAINT fact_evidence_page_number_pos CHECK (page_number >= 1),
  CONSTRAINT fact_evidence_exact_quote_size CHECK (
    exact_quote IS NULL OR octet_length(convert_to(exact_quote, 'UTF8')) <= 8192
  ),
  CONSTRAINT fact_evidence_idempotency_key UNIQUE (fact_id, anchor_index)
);

COMMENT ON TABLE hive3.fact_evidence IS
  'Quote/page anchors for Gate 2c facts. Insert-only; Worker service_role RPCs only.';

CREATE INDEX IF NOT EXISTS fact_evidence_fact_idx ON hive3.fact_evidence (fact_id);

-- ---------------------------------------------------------------------------
-- Triggers: Hive/run/batch binding and immutability
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION hive3.p23_facts_bind_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = hive3, public
AS $$
DECLARE
  v_run hive3.study_runs%ROWTYPE;
  v_batch hive3.extraction_batches%ROWTYPE;
  v_doc hive3.source_documents%ROWTYPE;
BEGIN
  SELECT * INTO v_run FROM hive3.study_runs WHERE id = NEW.study_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'study_run_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_batch FROM hive3.extraction_batches WHERE id = NEW.origin_batch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_batch.study_run_id <> NEW.study_run_id THEN
    RAISE EXCEPTION 'fact_batch_run_mismatch' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_doc FROM hive3.source_documents WHERE id = NEW.source_document_id;
  IF NOT FOUND OR v_doc.deleted_at IS NOT NULL OR v_doc.status <> 'registered' THEN
    RAISE EXCEPTION 'document_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_doc.hive_id <> v_run.hive_id OR v_batch.hive_id <> v_run.hive_id THEN
    RAISE EXCEPTION 'fact_hive_mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_batch.source_document_id <> NEW.source_document_id THEN
    RAISE EXCEPTION 'fact_source_mismatch' USING ERRCODE = 'P0001';
  END IF;

  NEW.hive_id := v_run.hive_id;
  NEW.source_sha256 := lower(btrim(NEW.source_sha256));
  NEW.read_fingerprint := btrim(NEW.read_fingerprint);
  NEW.page_set_digest := lower(btrim(NEW.page_set_digest));
  NEW.candidate_key := lower(btrim(NEW.candidate_key));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS facts_bind_scope ON hive3.facts;
CREATE TRIGGER facts_bind_scope
  BEFORE INSERT ON hive3.facts
  FOR EACH ROW EXECUTE FUNCTION hive3.p23_facts_bind_scope();

DROP TRIGGER IF EXISTS facts_immutable ON hive3.facts;
CREATE TRIGGER facts_immutable
  BEFORE UPDATE ON hive3.facts
  FOR EACH ROW EXECUTE FUNCTION hive3.p2px_reject_update();

CREATE OR REPLACE FUNCTION hive3.p23_fact_evidence_bind_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = hive3, public
AS $$
DECLARE
  v_fact hive3.facts%ROWTYPE;
  v_page hive3.document_pages%ROWTYPE;
BEGIN
  SELECT * INTO v_fact FROM hive3.facts WHERE id = NEW.fact_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fact_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NEW.source_document_id <> v_fact.source_document_id THEN
    RAISE EXCEPTION 'fact_evidence_source_mismatch' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.document_page_id IS NOT NULL THEN
    SELECT * INTO v_page FROM hive3.document_pages WHERE id = NEW.document_page_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'document_page_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_page.source_document_id <> v_fact.source_document_id
      OR v_page.hive_id <> v_fact.hive_id
      OR v_page.page_number <> NEW.page_number THEN
      RAISE EXCEPTION 'fact_evidence_page_mismatch' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fact_evidence_bind_scope ON hive3.fact_evidence;
CREATE TRIGGER fact_evidence_bind_scope
  BEFORE INSERT ON hive3.fact_evidence
  FOR EACH ROW EXECUTE FUNCTION hive3.p23_fact_evidence_bind_scope();

DROP TRIGGER IF EXISTS fact_evidence_immutable ON hive3.fact_evidence;
CREATE TRIGGER fact_evidence_immutable
  BEFORE UPDATE ON hive3.fact_evidence
  FOR EACH ROW EXECUTE FUNCTION hive3.p2px_reject_update();

-- ---------------------------------------------------------------------------
-- Worker RPCs (service_role only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hive3_p23_worker_list_run_batches_for_verify(p_study_run_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = hive3, public
AS $$
DECLARE
  v_run hive3.study_runs%ROWTYPE;
BEGIN
  SELECT * INTO v_run FROM hive3.study_runs WHERE id = p_study_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'study_run_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN json_build_object(
    'study_run_id', v_run.id,
    'hive_id', v_run.hive_id,
    'batches', coalesce(
      (
        SELECT json_agg(
          json_build_object(
            'batch_id', b.id,
            'source_document_id', b.source_document_id,
            'source_sha256', b.source_sha256,
            'read_fingerprint', b.read_fingerprint,
            'page_set_digest', b.page_set_digest,
            'pack_id', b.pack_id,
            'pack_version', b.pack_version,
            'accepted_facts_json', b.accepted_facts_json
          )
          ORDER BY b.source_document_id, b.page_start
        )
        FROM hive3.extraction_batches b
        WHERE b.study_run_id = v_run.id
          AND b.hive_id = v_run.hive_id
          AND b.status = 'SUCCEEDED'
          AND b.disposition IN ('VALID', 'VALID_WITH_REJECTIONS')
      ),
      '[]'::json
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hive3_p23_worker_put_fact_verification(
  p_study_run_id uuid,
  p_fact jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hive3, public
AS $$
DECLARE
  v_run hive3.study_runs%ROWTYPE;
  v_existing hive3.facts%ROWTYPE;
  v_row hive3.facts%ROWTYPE;
  v_batch uuid := (p_fact ->> 'origin_batch_id')::uuid;
  v_candidate text := lower(btrim(p_fact ->> 'candidate_key'));
  v_evidence jsonb := coalesce(p_fact -> 'evidence', '[]'::jsonb);
  v_item jsonb;
  v_idx integer;
  v_fact_id uuid;
BEGIN
  SELECT * INTO v_run FROM hive3.study_runs WHERE id = p_study_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'study_run_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_fact IS NULL OR jsonb_typeof(p_fact) <> 'object' THEN
    RAISE EXCEPTION 'fact_invalid' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_existing
  FROM hive3.facts
  WHERE study_run_id = p_study_run_id
    AND origin_batch_id = v_batch
    AND candidate_key = v_candidate;

  IF FOUND THEN
    IF v_existing.verification_disposition IS DISTINCT FROM (p_fact ->> 'verification_disposition')
      OR v_existing.verification_reason_code IS DISTINCT FROM (p_fact ->> 'verification_reason_code')
      OR v_existing.verifier_version IS DISTINCT FROM (p_fact ->> 'verifier_version')
      OR v_existing.evidence_anchors_verified IS DISTINCT FROM (p_fact ->> 'evidence_anchors_verified')::integer
      OR v_existing.candidate_status IS DISTINCT FROM (p_fact ->> 'candidate_status')
      OR v_existing.value_json IS DISTINCT FROM (p_fact -> 'value_json') THEN
      RAISE EXCEPTION 'fact_hash_conflict' USING ERRCODE = 'P0001';
    END IF;
    RETURN json_build_object('inserted', false, 'fact_id', v_existing.id);
  END IF;

  INSERT INTO hive3.facts (
    hive_id, study_run_id, source_document_id, origin_batch_id, candidate_key,
    kind, pack_id, pack_version, record_type_id, record_local_id, parent_record_local_id,
    segment_index, fact_id, candidate_status, value_json,
    source_sha256, read_fingerprint, page_set_digest,
    verification_disposition, verification_reason_code, verifier_version, evidence_anchors_verified
  )
  VALUES (
    v_run.hive_id,
    p_study_run_id,
    (p_fact ->> 'source_document_id')::uuid,
    v_batch,
    v_candidate,
    coalesce(p_fact ->> 'kind', 'pack_extraction_candidate'),
    p_fact ->> 'pack_id',
    p_fact ->> 'pack_version',
    p_fact ->> 'record_type_id',
    p_fact ->> 'record_local_id',
    p_fact ->> 'parent_record_local_id',
    (p_fact ->> 'segment_index')::integer,
    p_fact ->> 'fact_id',
    p_fact ->> 'candidate_status',
    CASE WHEN jsonb_typeof(p_fact -> 'value_json') IN ('object', 'array', 'string', 'number', 'boolean', 'null')
      THEN p_fact -> 'value_json' ELSE NULL END,
    p_fact ->> 'source_sha256',
    p_fact ->> 'read_fingerprint',
    lower(btrim(p_fact ->> 'page_set_digest')),
    p_fact ->> 'verification_disposition',
    p_fact ->> 'verification_reason_code',
    p_fact ->> 'verifier_version',
    coalesce((p_fact ->> 'evidence_anchors_verified')::integer, 0)
  )
  RETURNING * INTO v_row;

  v_fact_id := v_row.id;

  IF jsonb_typeof(v_evidence) <> 'array' THEN
    RAISE EXCEPTION 'fact_evidence_invalid' USING ERRCODE = 'P0001';
  END IF;

  FOR v_idx IN 0 .. jsonb_array_length(v_evidence) - 1 LOOP
    v_item := v_evidence -> v_idx;
    INSERT INTO hive3.fact_evidence (
      fact_id, source_document_id, document_page_id, anchor_index, page_number, exact_quote
    )
    VALUES (
      v_fact_id,
      v_row.source_document_id,
      (v_item ->> 'document_page_id')::uuid,
      coalesce((v_item ->> 'anchor_index')::integer, v_idx),
      (v_item ->> 'page_number')::integer,
      v_item ->> 'exact_quote'
    );
  END LOOP;

  RETURN json_build_object('inserted', true, 'fact_id', v_fact_id);
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM hive3.facts
    WHERE study_run_id = p_study_run_id
      AND origin_batch_id = v_batch
      AND candidate_key = v_candidate;
    IF FOUND THEN
      RETURN json_build_object('inserted', false, 'fact_id', v_existing.id);
    END IF;
    RAISE;
  WHEN check_violation OR not_null_violation THEN
    RAISE EXCEPTION 'fact_invalid' USING ERRCODE = 'P0001';
END;
$$;

CREATE OR REPLACE FUNCTION public.hive3_p23_worker_count_fact_verifications(p_study_run_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = hive3, public
AS $$
DECLARE
  v_run hive3.study_runs%ROWTYPE;
  v_total integer;
  v_verified integer;
  v_rejected integer;
  v_unresolved integer;
BEGIN
  SELECT * INTO v_run FROM hive3.study_runs WHERE id = p_study_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'study_run_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*)::integer,
    count(*) FILTER (WHERE verification_disposition = 'VERIFIED')::integer,
    count(*) FILTER (WHERE verification_disposition = 'REJECTED')::integer,
    count(*) FILTER (WHERE verification_disposition = 'UNRESOLVED')::integer
  INTO v_total, v_verified, v_rejected, v_unresolved
  FROM hive3.facts
  WHERE study_run_id = v_run.id AND hive_id = v_run.hive_id;

  RETURN json_build_object(
    'study_run_id', v_run.id,
    'hive_id', v_run.hive_id,
    'total', v_total,
    'verified', v_verified,
    'rejected', v_rejected,
    'unresolved', v_unresolved
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS and privileges
-- ---------------------------------------------------------------------------

ALTER TABLE hive3.facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hive3.facts FORCE ROW LEVEL SECURITY;
ALTER TABLE hive3.fact_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE hive3.fact_evidence FORCE ROW LEVEL SECURITY;

REVOKE ALL ON hive3.facts FROM PUBLIC;
REVOKE ALL ON hive3.facts FROM anon;
REVOKE ALL ON hive3.facts FROM authenticated;
REVOKE ALL ON hive3.fact_evidence FROM PUBLIC;
REVOKE ALL ON hive3.fact_evidence FROM anon;
REVOKE ALL ON hive3.fact_evidence FROM authenticated;

REVOKE ALL ON FUNCTION public.hive3_p23_worker_list_run_batches_for_verify(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p23_worker_list_run_batches_for_verify(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hive3_p23_worker_list_run_batches_for_verify(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_p23_worker_list_run_batches_for_verify(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.hive3_p23_worker_put_fact_verification(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p23_worker_put_fact_verification(uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.hive3_p23_worker_put_fact_verification(uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_p23_worker_put_fact_verification(uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.hive3_p23_worker_count_fact_verifications(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p23_worker_count_fact_verifications(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hive3_p23_worker_count_fact_verifications(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_p23_worker_count_fact_verifications(uuid) TO service_role;

COMMIT;
