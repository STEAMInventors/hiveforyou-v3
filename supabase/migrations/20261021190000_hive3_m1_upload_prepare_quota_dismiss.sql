-- P1.7 — Upload count accuracy: quota guard at prepare (new rows only), dismiss failed attempts.
-- Apply after 20261021180000_hive3_m1_hive_card_summary.sql.

BEGIN;

-- ---------------------------------------------------------------------------
-- Prepare — block new pending rows when monthly quota is exhausted (retries unchanged)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hive3_m1_prepare_source_document_upload(
  p_hive_id uuid,
  p_client_request_id text,
  p_filename text,
  p_mime_type text,
  p_byte_size bigint
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = hive3, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_doc hive3.source_documents%ROWTYPE;
  v_path text;
  v_max bigint := hive3.m1_upload_max_bytes();
  v_used integer;
  v_limit integer := hive3.m1_free_upload_limit();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  IF p_client_request_id IS NULL OR btrim(p_client_request_id) = '' THEN
    RAISE EXCEPTION 'invalid_client_request_id';
  END IF;

  IF p_filename IS NULL OR btrim(p_filename) = '' THEN
    RAISE EXCEPTION 'invalid_filename';
  END IF;

  IF p_byte_size IS NULL OR p_byte_size <= 0 OR p_byte_size > v_max THEN
    RAISE EXCEPTION 'invalid_byte_size';
  END IF;

  IF NOT hive3.m1_allowed_upload_mime(p_mime_type) THEN
    RAISE EXCEPTION 'invalid_mime_type';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM hive3.hives h
    WHERE h.id = p_hive_id
      AND h.owner_user_id = v_uid
      AND h.archived_at IS NULL
      AND h.deleting_at IS NULL
  ) THEN
    RAISE EXCEPTION 'hive_not_found';
  END IF;

  SELECT *
    INTO v_doc
  FROM hive3.source_documents d
  WHERE d.hive_id = p_hive_id
    AND d.client_request_id = btrim(p_client_request_id)
    AND d.deleted_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    IF v_doc.uploaded_by <> v_uid THEN
      RAISE EXCEPTION 'access_denied';
    END IF;
    IF v_doc.status IN ('failed', 'abandoned') THEN
      UPDATE hive3.source_documents
      SET status = 'pending', updated_at = now()
      WHERE id = v_doc.id
      RETURNING * INTO v_doc;
    END IF;
    RETURN json_build_object(
      'document_id', v_doc.id,
      'storage_path', v_doc.storage_path,
      'status', v_doc.status,
      'byte_size', v_doc.byte_size,
      'mime_type', v_doc.mime_type,
      'filename', v_doc.filename,
      'replayed', true
    );
  END IF;

  v_used := hive3.m1_count_quota_used(v_uid);
  IF v_used >= v_limit THEN
    RAISE EXCEPTION 'quota_exceeded';
  END IF;

  v_path :=
    v_uid::text || '/' || p_hive_id::text || '/' || gen_random_uuid()::text || '/' ||
    regexp_replace(btrim(p_filename), '[^a-zA-Z0-9._-]+', '_', 'g');

  INSERT INTO hive3.source_documents (
    hive_id,
    uploaded_by,
    client_request_id,
    filename,
    mime_type,
    byte_size,
    storage_path,
    status
  )
  VALUES (
    p_hive_id,
    v_uid,
    btrim(p_client_request_id),
    btrim(p_filename),
    p_mime_type,
    p_byte_size,
    v_path,
    'pending'
  )
  RETURNING * INTO v_doc;

  RETURN json_build_object(
    'document_id', v_doc.id,
    'storage_path', v_doc.storage_path,
    'status', v_doc.status,
    'byte_size', v_doc.byte_size,
    'mime_type', v_doc.mime_type,
    'filename', v_doc.filename,
    'replayed', false
  );
END;
$$;

COMMENT ON FUNCTION public.hive3_m1_prepare_source_document_upload(uuid, text, text, text, bigint) IS
  'Prepare upload; new rows require remaining quota; idempotent replay for pending/failed/abandoned.';

-- ---------------------------------------------------------------------------
-- Dismiss failed attempt — soft-hide after Edge verifies storage removal
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hive3_m1_dismiss_failed_source_document(
  p_hive_id uuid,
  p_client_request_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = hive3, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_doc hive3.source_documents%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  UPDATE hive3.source_documents d
  SET
    deleted_at = now(),
    client_request_id = d.client_request_id || ':dismissed:' || d.id::text,
    updated_at = now()
  FROM hive3.hives h
  WHERE d.hive_id = p_hive_id
    AND d.client_request_id = btrim(p_client_request_id)
    AND d.hive_id = h.id
    AND h.owner_user_id = v_uid
    AND h.archived_at IS NULL
    AND h.deleting_at IS NULL
    AND d.uploaded_by = v_uid
    AND d.deleted_at IS NULL
    AND d.status = 'failed'
  RETURNING d.* INTO v_doc;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'document_not_found';
  END IF;

  RETURN json_build_object(
    'document_id', v_doc.id,
    'dismissed', true
  );
END;
$$;

COMMENT ON FUNCTION public.hive3_m1_dismiss_failed_source_document(uuid, text) IS
  'Owner soft-dismisses a failed upload after storage cleanup; frees client_request_id for new uploads.';

REVOKE ALL ON FUNCTION public.hive3_m1_dismiss_failed_source_document(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hive3_m1_dismiss_failed_source_document(uuid, text) TO authenticated;

COMMIT;
