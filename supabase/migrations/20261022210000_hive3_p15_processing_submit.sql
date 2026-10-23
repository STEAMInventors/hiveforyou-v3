-- P1.5-processing — Atomic submit (source lock + intent + study run) and Worker context RPCs.
-- Depends on: 20261022100000_hive3_p1p_gate1_processing_persistence.sql,
--               20261021200000_hive3_m1_document_delete_replace_study_lock.sql
-- Do not execute without operator authorization.

BEGIN;

CREATE OR REPLACE FUNCTION public.hive3_p15_submit_study_processing(
  p_hive_id uuid,
  p_request_text text,
  p_trigger text,
  p_correlation_id text,
  p_idempotency_key text,
  p_clarification_json jsonb DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = hive3, public
AS $$
DECLARE
  v_existing hive3.study_runs%ROWTYPE;
  v_intent hive3.intents%ROWTYPE;
  v_run hive3.study_runs%ROWTYPE;
  v_registered integer;
  v_locked integer;
BEGIN
  PERFORM hive3.p1p_assert_hive_owned_by(p_hive_id, auth.uid());

  IF p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING ERRCODE = 'P0001';
  END IF;

  IF p_request_text IS NULL OR char_length(btrim(p_request_text)) = 0 THEN
    RAISE EXCEPTION 'invalid_request_text' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_existing
  FROM hive3.study_runs
  WHERE idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_existing.hive_id IS DISTINCT FROM p_hive_id THEN
      RAISE EXCEPTION 'idempotency_hive_mismatch' USING ERRCODE = '42501';
    END IF;
    PERFORM hive3.p1p_assert_hive_owned_by(v_existing.hive_id, auth.uid());
    RETURN json_build_object(
      'study_run', hive3.p1p_study_run_to_safe_json(v_existing),
      'idempotent_replay', true
    );
  END IF;

  SELECT count(*)::integer INTO v_registered
  FROM hive3.source_documents d
  WHERE d.hive_id = p_hive_id
    AND d.status = 'registered'
    AND d.deleted_at IS NULL
    AND d.deleting_at IS NULL;

  IF v_registered = 0 THEN
    RAISE EXCEPTION 'no_registered_sources' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.hive3_m1_assert_hive_sources_lockable_for_study(p_hive_id);

  UPDATE hive3.source_documents d
  SET study_locked_at = coalesce(d.study_locked_at, now()), updated_at = now()
  FROM hive3.hives h
  WHERE d.hive_id = p_hive_id
    AND d.hive_id = h.id
    AND h.owner_user_id = auth.uid()
    AND d.status = 'registered'
    AND d.deleted_at IS NULL
    AND d.deleting_at IS NULL
    AND d.study_locked_at IS NULL;

  GET DIAGNOSTICS v_locked = ROW_COUNT;

  INSERT INTO hive3.intents (hive_id, request_text, clarification_json, created_by)
  VALUES (p_hive_id, btrim(p_request_text), p_clarification_json, auth.uid())
  RETURNING * INTO v_intent;

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
    v_intent.id,
    'QUEUED',
    'enqueue',
    p_trigger,
    btrim(p_idempotency_key),
    btrim(p_correlation_id),
    jsonb_build_object('locked_new_sources', v_locked, 'registered_sources', v_registered)
  )
  RETURNING * INTO v_run;

  RETURN json_build_object(
    'study_run', hive3.p1p_study_run_to_safe_json(v_run),
    'idempotent_replay', false
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM hive3.study_runs
    WHERE idempotency_key = btrim(p_idempotency_key);
    IF FOUND THEN
      IF v_existing.hive_id IS DISTINCT FROM p_hive_id THEN
        RAISE EXCEPTION 'idempotency_hive_mismatch' USING ERRCODE = '42501';
      END IF;
      PERFORM hive3.p1p_assert_hive_owned_by(v_existing.hive_id, auth.uid());
      RETURN json_build_object(
        'study_run', hive3.p1p_study_run_to_safe_json(v_existing),
        'idempotent_replay', true
      );
    END IF;
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.hive3_p15_submit_study_processing(
  uuid, text, text, text, text, jsonb
) IS
  'Owner submit: lock eligible sources, insert intent, enqueue study run in one transaction.';

CREATE OR REPLACE FUNCTION public.hive3_p15_worker_get_processing_context(p_study_run_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = hive3, public
AS $$
DECLARE
  v_run hive3.study_runs%ROWTYPE;
  v_intent hive3.intents%ROWTYPE;
  v_owner uuid;
BEGIN
  SELECT * INTO v_run FROM hive3.study_runs WHERE id = p_study_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'study_run_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT owner_user_id INTO v_owner FROM hive3.hives WHERE id = v_run.hive_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hive_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_run.intent_id IS NOT NULL THEN
    SELECT * INTO v_intent FROM hive3.intents WHERE id = v_run.intent_id;
  END IF;

  RETURN json_build_object(
    'study_run', hive3.p1p_study_run_to_safe_json(v_run),
    'owner_user_id', v_owner,
    'intent_request_text', coalesce(v_intent.request_text, ''),
    'intent_clarification_json', v_intent.clarification_json
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hive3_p15_worker_list_registered_sources(p_study_run_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = hive3, public
AS $$
DECLARE
  v_hive_id uuid;
BEGIN
  SELECT hive_id INTO v_hive_id FROM hive3.study_runs WHERE id = p_study_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'study_run_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN coalesce(
    (
      SELECT json_agg(
        json_build_object(
          'source_document_id', d.id,
          'hive_id', d.hive_id,
          'storage_path', d.storage_path,
          'mime_type', d.mime_type,
          'byte_size', d.byte_size,
          'sha256', d.sha256,
          'filename', d.filename,
          'study_locked_at', d.study_locked_at
        )
        ORDER BY d.created_at ASC
      )
      FROM hive3.source_documents d
      WHERE d.hive_id = v_hive_id
        AND d.status = 'registered'
        AND d.deleted_at IS NULL
        AND d.deleting_at IS NULL
    ),
    '[]'::json
  );
END;
$$;

REVOKE ALL ON FUNCTION public.hive3_p15_submit_study_processing(
  uuid, text, text, text, text, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hive3_p15_submit_study_processing(
  uuid, text, text, text, text, jsonb
) TO authenticated;

REVOKE ALL ON FUNCTION public.hive3_p15_worker_get_processing_context(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p15_worker_get_processing_context(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hive3_p15_worker_get_processing_context(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_p15_worker_get_processing_context(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.hive3_p15_worker_list_registered_sources(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p15_worker_list_registered_sources(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hive3_p15_worker_list_registered_sources(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_p15_worker_list_registered_sources(uuid) TO service_role;

COMMIT;
