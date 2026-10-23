-- P1.P Gate 1 — Processing persistence: intents, study_runs, immutable run-scoped artifacts.
-- Authority: docs/NEXT.md, HIVEFORYOU-V3-DATABASE-DESIGN-v0.1 §2, ERROR-HANDLING-RECOVERY §3.
-- Depends on: 20261021200000_hive3_m1_document_delete_replace_study_lock.sql (hive baseline + locks).
-- Do not execute without operator authorization.

BEGIN;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hive3.intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hive_id uuid NOT NULL REFERENCES hive3.hives (id) ON DELETE CASCADE,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  request_text text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  clarification_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intents_request_text_not_blank CHECK (char_length(btrim(request_text)) > 0)
);

COMMENT ON TABLE hive3.intents IS
  'Private verbatim customer goals per Hive; domain-agnostic (IEP, grocery, Medicaid, etc.).';

CREATE TABLE IF NOT EXISTS hive3.study_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hive_id uuid NOT NULL REFERENCES hive3.hives (id) ON DELETE CASCADE,
  intent_id uuid REFERENCES hive3.intents (id) ON DELETE SET NULL,
  status text NOT NULL,
  stage text NOT NULL,
  trigger text NOT NULL,
  idempotency_key text,
  correlation_id text NOT NULL,
  request_json jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  error_message_safe text,
  model_alias text,
  pack_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT study_runs_status_check CHECK (
    status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')
  ),
  CONSTRAINT study_runs_stage_check CHECK (
    stage IN (
      'enqueue',
      'load_sources',
      'plan_schema',
      'extract',
      'verify',
      'merge_study',
      'analyze',
      'report',
      'finalize'
    )
  ),
  CONSTRAINT study_runs_trigger_check CHECK (
    trigger IN ('generate', 'reprocess', 'study')
  ),
  CONSTRAINT study_runs_correlation_not_blank CHECK (char_length(btrim(correlation_id)) > 0),
  CONSTRAINT study_runs_idempotency_key_not_blank CHECK (
    idempotency_key IS NULL OR char_length(btrim(idempotency_key)) > 0
  )
);

COMMENT ON TABLE hive3.study_runs IS
  'One row per intentional processing action; delivery idempotency on idempotency_key only (P0.2).';

CREATE UNIQUE INDEX IF NOT EXISTS study_runs_idempotency_key_unique
  ON hive3.study_runs (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS study_runs_hive_id_created_at_idx
  ON hive3.study_runs (hive_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hive3.study_run_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_run_id uuid NOT NULL REFERENCES hive3.study_runs (id) ON DELETE CASCADE,
  hive_id uuid NOT NULL REFERENCES hive3.hives (id) ON DELETE CASCADE,
  artifact_kind text NOT NULL,
  contract_version text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  content_sha256 text NOT NULL,
  payload_jsonb jsonb NOT NULL,
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT study_run_artifacts_revision_positive CHECK (revision >= 1),
  CONSTRAINT study_run_artifacts_kind_not_blank CHECK (char_length(btrim(artifact_kind)) > 0),
  CONSTRAINT study_run_artifacts_contract_not_blank CHECK (char_length(btrim(contract_version)) > 0),
  CONSTRAINT study_run_artifacts_hash_not_blank CHECK (char_length(btrim(content_sha256)) > 0),
  CONSTRAINT study_run_artifacts_payload_size CHECK (octet_length(payload_jsonb::text) <= 524288),
  CONSTRAINT study_run_artifacts_storage_xor CHECK (
    storage_path IS NULL OR payload_jsonb = 'null'::jsonb OR payload_jsonb = '{}'::jsonb
  ),
  CONSTRAINT study_run_artifacts_immutable_revision UNIQUE (study_run_id, artifact_kind, revision)
);

COMMENT ON TABLE hive3.study_run_artifacts IS
  'Immutable versioned run-scoped artifacts; same revision + hash is idempotent, conflicting hash rejected.';

CREATE INDEX IF NOT EXISTS study_run_artifacts_study_run_id_idx
  ON hive3.study_run_artifacts (study_run_id, artifact_kind, revision DESC);

-- ---------------------------------------------------------------------------
-- Triggers: hive consistency, updated_at, artifact hive_id from run
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION hive3.p1p_reject_ineligible_hive_for_processing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = hive3, pg_temp
AS $$
DECLARE
  v_hive hive3.hives%ROWTYPE;
BEGIN
  SELECT * INTO v_hive FROM hive3.hives WHERE id = NEW.hive_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hive_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_hive.deleting_at IS NOT NULL THEN
    RAISE EXCEPTION 'hive_deletion_in_progress' USING ERRCODE = 'P0001';
  END IF;
  IF v_hive.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'hive_archived' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS study_runs_reject_ineligible_hive ON hive3.study_runs;
CREATE TRIGGER study_runs_reject_ineligible_hive
  BEFORE INSERT ON hive3.study_runs
  FOR EACH ROW
  EXECUTE FUNCTION hive3.p1p_reject_ineligible_hive_for_processing();

CREATE OR REPLACE FUNCTION hive3.p1p_study_runs_intent_hive_match()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = hive3, pg_temp
AS $$
DECLARE
  v_intent_hive uuid;
BEGIN
  IF NEW.intent_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT hive_id INTO v_intent_hive FROM hive3.intents WHERE id = NEW.intent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'intent_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_intent_hive IS DISTINCT FROM NEW.hive_id THEN
    RAISE EXCEPTION 'intent_hive_mismatch' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS study_runs_intent_hive_match ON hive3.study_runs;
CREATE TRIGGER study_runs_intent_hive_match
  BEFORE INSERT OR UPDATE OF intent_id, hive_id ON hive3.study_runs
  FOR EACH ROW
  EXECUTE FUNCTION hive3.p1p_study_runs_intent_hive_match();

DROP TRIGGER IF EXISTS study_runs_set_updated_at ON hive3.study_runs;
CREATE TRIGGER study_runs_set_updated_at
  BEFORE UPDATE ON hive3.study_runs
  FOR EACH ROW
  EXECUTE FUNCTION hive3.set_updated_at();

CREATE OR REPLACE FUNCTION hive3.p1p_study_run_artifacts_sync_hive()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = hive3, pg_temp
AS $$
DECLARE
  v_run_hive uuid;
BEGIN
  SELECT hive_id INTO v_run_hive FROM hive3.study_runs WHERE id = NEW.study_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'study_run_not_found' USING ERRCODE = 'P0002';
  END IF;
  NEW.hive_id := v_run_hive;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS study_run_artifacts_sync_hive ON hive3.study_run_artifacts;
CREATE TRIGGER study_run_artifacts_sync_hive
  BEFORE INSERT ON hive3.study_run_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION hive3.p1p_study_run_artifacts_sync_hive();

-- ---------------------------------------------------------------------------
-- Internal helpers (schema-local)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION hive3.p1p_assert_hive_owned_by(p_hive_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = hive3, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM hive3.hives h
    WHERE h.id = p_hive_id
      AND h.owner_user_id = p_user_id
      AND h.archived_at IS NULL
      AND h.deleting_at IS NULL
  ) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION hive3.p1p_study_run_to_safe_json(p_run hive3.study_runs)
RETURNS json
LANGUAGE sql
IMMUTABLE
SET search_path = hive3, pg_temp
AS $$
  SELECT json_build_object(
    'id', p_run.id,
    'hive_id', p_run.hive_id,
    'intent_id', p_run.intent_id,
    'status', p_run.status,
    'stage', p_run.stage,
    'trigger', p_run.trigger,
    'correlation_id', p_run.correlation_id,
    'started_at', p_run.started_at,
    'finished_at', p_run.finished_at,
    'error_code', p_run.error_code,
    'error_message_safe', p_run.error_message_safe,
    'created_at', p_run.created_at,
    'updated_at', p_run.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION hive3.p1p_artifact_to_json(p_row hive3.study_run_artifacts)
RETURNS json
LANGUAGE sql
IMMUTABLE
SET search_path = hive3, pg_temp
AS $$
  SELECT json_build_object(
    'id', p_row.id,
    'study_run_id', p_row.study_run_id,
    'hive_id', p_row.hive_id,
    'artifact_kind', p_row.artifact_kind,
    'contract_version', p_row.contract_version,
    'revision', p_row.revision,
    'content_sha256', p_row.content_sha256,
    'payload_jsonb', p_row.payload_jsonb,
    'storage_path', p_row.storage_path,
    'created_at', p_row.created_at
  );
$$;

-- ---------------------------------------------------------------------------
-- Owner-facing RPCs (SECURITY INVOKER)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hive3_p1p_insert_intent(
  p_hive_id uuid,
  p_request_text text,
  p_clarification_json jsonb DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = hive3, public
AS $$
DECLARE
  v_row hive3.intents%ROWTYPE;
BEGIN
  PERFORM hive3.p1p_assert_hive_owned_by(p_hive_id, auth.uid());

  INSERT INTO hive3.intents (hive_id, request_text, clarification_json, created_by)
  VALUES (p_hive_id, p_request_text, p_clarification_json, auth.uid())
  RETURNING * INTO v_row;

  RETURN json_build_object(
    'intent_id', v_row.id,
    'hive_id', v_row.hive_id,
    'created_at', v_row.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hive3_p1p_get_intent(p_intent_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = hive3, public
AS $$
DECLARE
  v_row hive3.intents%ROWTYPE;
BEGIN
  SELECT i.* INTO v_row
  FROM hive3.intents i
  JOIN hive3.hives h ON h.id = i.hive_id
  WHERE i.id = p_intent_id
    AND h.owner_user_id = auth.uid()
    AND h.archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  RETURN json_build_object(
    'intent_id', v_row.id,
    'hive_id', v_row.hive_id,
    'request_text', v_row.request_text,
    'status', v_row.status,
    'clarification_json', v_row.clarification_json,
    'created_at', v_row.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hive3_p1p_enqueue_study_run(
  p_hive_id uuid,
  p_intent_id uuid,
  p_trigger text,
  p_correlation_id text,
  p_idempotency_key text DEFAULT NULL,
  p_request_json jsonb DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = hive3, public
AS $$
DECLARE
  v_existing hive3.study_runs%ROWTYPE;
  v_row hive3.study_runs%ROWTYPE;
BEGIN
  PERFORM hive3.p1p_assert_hive_owned_by(p_hive_id, auth.uid());

  IF p_intent_id IS NOT NULL THEN
    PERFORM 1
    FROM hive3.intents i
    WHERE i.id = p_intent_id
      AND i.hive_id = p_hive_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'intent_hive_mismatch' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF p_idempotency_key IS NOT NULL AND char_length(btrim(p_idempotency_key)) > 0 THEN
    SELECT * INTO v_existing
    FROM hive3.study_runs
    WHERE idempotency_key = btrim(p_idempotency_key);

    IF FOUND THEN
      IF v_existing.hive_id IS DISTINCT FROM p_hive_id THEN
        RAISE EXCEPTION 'idempotency_hive_mismatch' USING ERRCODE = '42501';
      END IF;
      PERFORM hive3.p1p_assert_hive_owned_by(v_existing.hive_id, auth.uid());
      RETURN hive3.p1p_study_run_to_safe_json(v_existing);
    END IF;
  END IF;

  INSERT INTO hive3.study_runs (
    hive_id,
    intent_id,
    status,
    stage,
    trigger,
    idempotency_key,
    correlation_id,
    request_json
  )
  VALUES (
    p_hive_id,
    p_intent_id,
    'QUEUED',
    'enqueue',
    p_trigger,
    NULLIF(btrim(p_idempotency_key), ''),
    btrim(p_correlation_id),
    p_request_json
  )
  RETURNING * INTO v_row;

  RETURN hive3.p1p_study_run_to_safe_json(v_row);
EXCEPTION
  WHEN unique_violation THEN
    IF p_idempotency_key IS NOT NULL THEN
      SELECT * INTO v_existing
      FROM hive3.study_runs
      WHERE idempotency_key = btrim(p_idempotency_key);
      IF FOUND THEN
        IF v_existing.hive_id IS DISTINCT FROM p_hive_id THEN
          RAISE EXCEPTION 'idempotency_hive_mismatch' USING ERRCODE = '42501';
        END IF;
        PERFORM hive3.p1p_assert_hive_owned_by(v_existing.hive_id, auth.uid());
        RETURN hive3.p1p_study_run_to_safe_json(v_existing);
      END IF;
    END IF;
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.hive3_p1p_get_study_run(p_study_run_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = hive3, public
AS $$
DECLARE
  v_row hive3.study_runs%ROWTYPE;
BEGIN
  SELECT r.* INTO v_row
  FROM hive3.study_runs r
  JOIN hive3.hives h ON h.id = r.hive_id
  WHERE r.id = p_study_run_id
    AND h.owner_user_id = auth.uid()
    AND h.archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  RETURN hive3.p1p_study_run_to_safe_json(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.hive3_p1p_list_study_runs(p_hive_id uuid, p_limit integer DEFAULT 20)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = hive3, public
AS $$
BEGIN
  PERFORM hive3.p1p_assert_hive_owned_by(p_hive_id, auth.uid());

  RETURN coalesce(
    (
      SELECT json_agg(hive3.p1p_study_run_to_safe_json(r) ORDER BY r.created_at DESC)
      FROM (
        SELECT r.*
        FROM hive3.study_runs r
        WHERE r.hive_id = p_hive_id
        ORDER BY r.created_at DESC
        LIMIT greatest(1, least(coalesce(p_limit, 20), 100))
      ) r
    ),
    '[]'::json
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Worker RPCs (SECURITY DEFINER; service_role only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hive3_p1p_worker_transition_study_run(
  p_study_run_id uuid,
  p_status text,
  p_stage text,
  p_error_code text DEFAULT NULL,
  p_error_message_safe text DEFAULT NULL,
  p_model_alias text DEFAULT NULL,
  p_pack_version text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hive3, public
AS $$
DECLARE
  v_row hive3.study_runs%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_row FROM hive3.study_runs WHERE id = p_study_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'study_run_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status IN ('SUCCEEDED', 'FAILED', 'CANCELLED') THEN
    IF v_row.status = p_status AND v_row.stage = p_stage THEN
      RETURN hive3.p1p_study_run_to_safe_json(v_row);
    END IF;
    RAISE EXCEPTION 'study_run_terminal' USING ERRCODE = 'P0001';
  END IF;

  UPDATE hive3.study_runs
  SET
    status = p_status,
    stage = p_stage,
    error_code = p_error_code,
    error_message_safe = p_error_message_safe,
    model_alias = coalesce(p_model_alias, model_alias),
    pack_version = coalesce(p_pack_version, pack_version),
    started_at = coalesce(started_at, CASE WHEN p_status = 'RUNNING' THEN v_now ELSE started_at END),
    finished_at = CASE
      WHEN p_status IN ('SUCCEEDED', 'FAILED', 'CANCELLED') THEN v_now
      ELSE finished_at
    END
  WHERE id = p_study_run_id
  RETURNING * INTO v_row;

  RETURN hive3.p1p_study_run_to_safe_json(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.hive3_p1p_worker_put_run_artifact(
  p_study_run_id uuid,
  p_artifact_kind text,
  p_contract_version text,
  p_content_sha256 text,
  p_payload_jsonb jsonb,
  p_revision integer DEFAULT 1,
  p_storage_path text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hive3, public
AS $$
DECLARE
  v_run hive3.study_runs%ROWTYPE;
  v_existing hive3.study_run_artifacts%ROWTYPE;
  v_row hive3.study_run_artifacts%ROWTYPE;
  v_revision integer := coalesce(p_revision, 1);
BEGIN
  SELECT * INTO v_run FROM hive3.study_runs WHERE id = p_study_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'study_run_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_existing
  FROM hive3.study_run_artifacts
  WHERE study_run_id = p_study_run_id
    AND artifact_kind = btrim(p_artifact_kind)
    AND revision = v_revision;

  IF FOUND THEN
    IF v_existing.content_sha256 = btrim(p_content_sha256) THEN
      RETURN hive3.p1p_artifact_to_json(v_existing);
    END IF;
    RAISE EXCEPTION 'artifact_revision_hash_conflict' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO hive3.study_run_artifacts (
    study_run_id,
    hive_id,
    artifact_kind,
    contract_version,
    revision,
    content_sha256,
    payload_jsonb,
    storage_path
  )
  VALUES (
    p_study_run_id,
    v_run.hive_id,
    btrim(p_artifact_kind),
    btrim(p_contract_version),
    v_revision,
    btrim(p_content_sha256),
    p_payload_jsonb,
    p_storage_path
  )
  RETURNING * INTO v_row;

  RETURN hive3.p1p_artifact_to_json(v_row);
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM hive3.study_run_artifacts
    WHERE study_run_id = p_study_run_id
      AND artifact_kind = btrim(p_artifact_kind)
      AND revision = v_revision;
    IF FOUND THEN
      IF v_existing.content_sha256 = btrim(p_content_sha256) THEN
        RETURN hive3.p1p_artifact_to_json(v_existing);
      END IF;
      RAISE EXCEPTION 'artifact_revision_hash_conflict' USING ERRCODE = 'P0001';
    END IF;
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.hive3_p1p_worker_get_run_artifact(
  p_study_run_id uuid,
  p_artifact_kind text,
  p_revision integer DEFAULT 1
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = hive3, public
AS $$
DECLARE
  v_row hive3.study_run_artifacts%ROWTYPE;
  v_revision integer := coalesce(p_revision, 1);
BEGIN
  SELECT a.* INTO v_row
  FROM hive3.study_run_artifacts a
  WHERE a.study_run_id = p_study_run_id
    AND a.artifact_kind = btrim(p_artifact_kind)
    AND a.revision = v_revision;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'artifact_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN hive3.p1p_artifact_to_json(v_row);
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE hive3.intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE hive3.intents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intents_select_owner ON hive3.intents;
DROP POLICY IF EXISTS intents_insert_owner ON hive3.intents;

CREATE POLICY intents_select_owner
  ON hive3.intents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM hive3.hives h
      WHERE h.id = hive_id
        AND h.owner_user_id = auth.uid()
        AND h.archived_at IS NULL
    )
  );

CREATE POLICY intents_insert_owner
  ON hive3.intents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM hive3.hives h
      WHERE h.id = hive_id
        AND h.owner_user_id = auth.uid()
        AND h.archived_at IS NULL
        AND h.deleting_at IS NULL
    )
    AND created_by = auth.uid()
  );

ALTER TABLE hive3.study_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hive3.study_runs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS study_runs_select_owner ON hive3.study_runs;
DROP POLICY IF EXISTS study_runs_insert_owner ON hive3.study_runs;

CREATE POLICY study_runs_select_owner
  ON hive3.study_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM hive3.hives h
      WHERE h.id = hive_id
        AND h.owner_user_id = auth.uid()
        AND h.archived_at IS NULL
    )
  );

CREATE POLICY study_runs_insert_owner
  ON hive3.study_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM hive3.hives h
      WHERE h.id = hive_id
        AND h.owner_user_id = auth.uid()
        AND h.archived_at IS NULL
        AND h.deleting_at IS NULL
    )
  );

ALTER TABLE hive3.study_run_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hive3.study_run_artifacts FORCE ROW LEVEL SECURITY;

-- No authenticated policies: artifacts are worker-only via DEFINER RPCs.

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT ON hive3.intents TO authenticated;
GRANT SELECT, INSERT ON hive3.study_runs TO authenticated;

REVOKE ALL ON hive3.study_run_artifacts FROM PUBLIC;
REVOKE ALL ON hive3.study_run_artifacts FROM authenticated;

REVOKE ALL ON FUNCTION public.hive3_p1p_insert_intent(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p1p_get_intent(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p1p_enqueue_study_run(uuid, uuid, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p1p_get_study_run(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p1p_list_study_runs(uuid, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.hive3_p1p_insert_intent(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_p1p_get_intent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_p1p_enqueue_study_run(uuid, uuid, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_p1p_get_study_run(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_p1p_list_study_runs(uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.hive3_p1p_worker_transition_study_run(
  uuid, text, text, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p1p_worker_transition_study_run(
  uuid, text, text, text, text, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.hive3_p1p_worker_transition_study_run(
  uuid, text, text, text, text, text, text
) FROM authenticated;

REVOKE ALL ON FUNCTION public.hive3_p1p_worker_put_run_artifact(
  uuid, text, text, text, jsonb, integer, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p1p_worker_put_run_artifact(
  uuid, text, text, text, jsonb, integer, text
) FROM anon;
REVOKE ALL ON FUNCTION public.hive3_p1p_worker_put_run_artifact(
  uuid, text, text, text, jsonb, integer, text
) FROM authenticated;

REVOKE ALL ON FUNCTION public.hive3_p1p_worker_get_run_artifact(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p1p_worker_get_run_artifact(uuid, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.hive3_p1p_worker_get_run_artifact(uuid, text, integer) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.hive3_p1p_worker_transition_study_run(
  uuid, text, text, text, text, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.hive3_p1p_worker_put_run_artifact(
  uuid, text, text, text, jsonb, integer, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.hive3_p1p_worker_get_run_artifact(uuid, text, integer) TO service_role;

COMMIT;
