-- P1.7 — Owner-initiated permanent Hive deletion + document workspace list (upload states).
-- Do not execute without operator authorization.

BEGIN;

-- ---------------------------------------------------------------------------
-- Hive deletion marker (blocks new uploads; recoverable until storage + DB cleanup)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'hive3'
      AND table_name = 'hives'
      AND column_name = 'deleting_at'
  ) THEN
    ALTER TABLE hive3.hives ADD COLUMN deleting_at timestamptz;
  END IF;
END
$$;

COMMENT ON COLUMN hive3.hives.deleting_at IS
  'Set when owner begins permanent deletion; listed on My Hives for recovery until storage + DB finalize succeed.';

-- ---------------------------------------------------------------------------
-- RLS: block document access while hive is deleting
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS source_documents_select_owner ON hive3.source_documents;
DROP POLICY IF EXISTS source_documents_insert_owner ON hive3.source_documents;
DROP POLICY IF EXISTS source_documents_update_owner ON hive3.source_documents;

CREATE POLICY source_documents_select_owner
  ON hive3.source_documents
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM hive3.hives h
      WHERE h.id = hive_id
        AND h.owner_user_id = auth.uid()
        AND h.archived_at IS NULL
        AND h.deleting_at IS NULL
    )
  );

CREATE POLICY source_documents_insert_owner
  ON hive3.source_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM hive3.hives h
      WHERE h.id = hive_id
        AND h.owner_user_id = auth.uid()
        AND h.archived_at IS NULL
        AND h.deleting_at IS NULL
    )
  );

CREATE POLICY source_documents_update_owner
  ON hive3.source_documents
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM hive3.hives h
      WHERE h.id = hive_id
        AND h.owner_user_id = auth.uid()
        AND h.archived_at IS NULL
        AND h.deleting_at IS NULL
    )
  )
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM hive3.hives h
      WHERE h.id = hive_id
        AND h.owner_user_id = auth.uid()
        AND h.archived_at IS NULL
        AND h.deleting_at IS NULL
    )
  );

-- ---------------------------------------------------------------------------
-- Hive RPCs — list includes deletion-in-progress; get hides deleting hives from workspace
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hive3_m1_list_hives()
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = hive3, public
AS $$
  SELECT coalesce(
    json_agg(
      json_build_object(
        'id', id,
        'name', name,
        'description', description,
        'client_request_id', client_request_id,
        'created_at', created_at,
        'updated_at', updated_at,
        'deleting_at', deleting_at
      )
      ORDER BY (deleting_at IS NOT NULL) DESC, created_at DESC
    ),
    '[]'::json
  )
  FROM hive3.hives
  WHERE owner_user_id = auth.uid()
    AND archived_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.hive3_m1_get_hive(p_hive_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = hive3, public
AS $$
  SELECT json_build_object(
    'id', id,
    'name', name,
    'description', description,
    'client_request_id', client_request_id,
    'created_at', created_at,
    'updated_at', updated_at
  )
  FROM hive3.hives
  WHERE id = p_hive_id
    AND owner_user_id = auth.uid()
    AND archived_at IS NULL
    AND deleting_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.hive3_m1_get_hive_by_client_request_id(p_client_request_id text)
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = hive3, public
AS $$
  SELECT json_build_object(
    'id', id,
    'name', name,
    'description', description,
    'client_request_id', client_request_id,
    'created_at', created_at,
    'updated_at', updated_at
  )
  FROM hive3.hives
  WHERE client_request_id = p_client_request_id
    AND owner_user_id = auth.uid()
    AND archived_at IS NULL
    AND deleting_at IS NULL
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- Document list — genuine upload states for workspace (no processing simulation)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hive3_m1_list_source_documents(p_hive_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = hive3, public
AS $$
  SELECT coalesce(
    json_agg(
      json_build_object(
        'id', d.id,
        'hive_id', d.hive_id,
        'client_request_id', d.client_request_id,
        'filename', d.filename,
        'mime_type', d.mime_type,
        'byte_size', d.byte_size,
        'sha256', d.sha256,
        'status', d.status,
        'created_at', d.created_at,
        'registered_at', d.registered_at
      )
      ORDER BY coalesce(d.registered_at, d.created_at) DESC
    ),
    '[]'::json
  )
  FROM hive3.source_documents d
  JOIN hive3.hives h ON h.id = d.hive_id
  WHERE d.hive_id = p_hive_id
    AND h.owner_user_id = auth.uid()
    AND h.archived_at IS NULL
    AND h.deleting_at IS NULL
    AND d.deleted_at IS NULL
    AND d.status IN ('pending', 'registered', 'failed');
$$;

-- ---------------------------------------------------------------------------
-- Upload RPCs — refuse deleting hives; allow safe retry after failed upload
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

CREATE OR REPLACE FUNCTION public.hive3_m1_get_source_document_upload(
  p_hive_id uuid,
  p_client_request_id text
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = hive3, public
AS $$
  SELECT json_build_object(
    'document_id', d.id,
    'storage_path', d.storage_path,
    'status', d.status,
    'byte_size', d.byte_size,
    'mime_type', d.mime_type,
    'filename', d.filename
  )
  FROM hive3.source_documents d
  JOIN hive3.hives h ON h.id = d.hive_id
  WHERE d.hive_id = p_hive_id
    AND d.client_request_id = btrim(p_client_request_id)
    AND h.owner_user_id = auth.uid()
    AND h.archived_at IS NULL
    AND h.deleting_at IS NULL
    AND d.uploaded_by = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.hive3_m1_complete_source_document_upload(
  p_hive_id uuid,
  p_client_request_id text,
  p_sha256 text,
  p_byte_size bigint
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hive3, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_doc hive3.source_documents%ROWTYPE;
  v_used integer;
  v_limit integer := hive3.m1_free_upload_limit();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  IF p_sha256 IS NULL OR length(btrim(p_sha256)) <> 64 THEN
    RAISE EXCEPTION 'invalid_sha256';
  END IF;

  SELECT d.*
    INTO v_doc
  FROM hive3.source_documents d
  JOIN hive3.hives h ON h.id = d.hive_id
  WHERE d.hive_id = p_hive_id
    AND d.client_request_id = btrim(p_client_request_id)
    AND h.owner_user_id = v_uid
    AND h.archived_at IS NULL
    AND h.deleting_at IS NULL
  FOR UPDATE OF d;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'document_not_found';
  END IF;

  IF v_doc.uploaded_by <> v_uid THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  IF v_doc.status = 'registered' THEN
    RETURN json_build_object(
      'document_id', v_doc.id,
      'status', v_doc.status,
      'registered_at', v_doc.registered_at,
      'replayed', true
    );
  END IF;

  IF v_doc.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  IF p_byte_size IS DISTINCT FROM v_doc.byte_size THEN
    RAISE EXCEPTION 'byte_size_mismatch';
  END IF;

  v_used := hive3.m1_count_quota_used(v_uid);
  IF v_used >= v_limit THEN
    RAISE EXCEPTION 'quota_exceeded';
  END IF;

  UPDATE hive3.source_documents
  SET
    status = 'registered',
    sha256 = lower(btrim(p_sha256)),
    registered_at = now()
  WHERE id = v_doc.id
  RETURNING * INTO v_doc;

  INSERT INTO hive3.upload_quota_events (owner_user_id, hive_id, source_document_id)
  VALUES (v_uid, p_hive_id, v_doc.id);

  RETURN json_build_object(
    'document_id', v_doc.id,
    'status', v_doc.status,
    'registered_at', v_doc.registered_at,
    'replayed', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hive3_m1_abort_source_document_upload(
  p_hive_id uuid,
  p_client_request_id text,
  p_reason text DEFAULT 'abandoned'
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = hive3, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_doc hive3.source_documents%ROWTYPE;
  v_status text := CASE WHEN p_reason = 'failed' THEN 'failed' ELSE 'abandoned' END;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  UPDATE hive3.source_documents d
  SET status = v_status
  FROM hive3.hives h
  WHERE d.hive_id = p_hive_id
    AND d.client_request_id = btrim(p_client_request_id)
    AND d.hive_id = h.id
    AND h.owner_user_id = v_uid
    AND h.archived_at IS NULL
    AND h.deleting_at IS NULL
    AND d.uploaded_by = v_uid
    AND d.status = 'pending'
  RETURNING d.* INTO v_doc;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'document_not_found';
  END IF;

  RETURN json_build_object('document_id', v_doc.id, 'status', v_doc.status);
END;
$$;

-- ---------------------------------------------------------------------------
-- Permanent Hive deletion (owner begin; service_role-only finalize after Edge storage verify)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hive3_m1_begin_hive_deletion(p_hive_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = hive3, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hive hive3.hives%ROWTYPE;
  v_paths json;
  v_replayed boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  SELECT *
    INTO v_hive
  FROM hive3.hives h
  WHERE h.id = p_hive_id
    AND h.owner_user_id = v_uid
    AND h.archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'hive_not_found';
  END IF;

  IF v_hive.deleting_at IS NULL THEN
    UPDATE hive3.hives
    SET deleting_at = now(), updated_at = now()
    WHERE id = p_hive_id
    RETURNING * INTO v_hive;
  ELSE
    v_replayed := true;
  END IF;

  SELECT coalesce(json_agg(d.storage_path ORDER BY d.created_at), '[]'::json)
    INTO v_paths
  FROM hive3.source_documents d
  WHERE d.hive_id = p_hive_id
    AND d.deleted_at IS NULL
    AND btrim(d.storage_path) <> '';

  RETURN json_build_object(
    'hive_id', v_hive.id,
    'owner_user_id', v_hive.owner_user_id,
    'storage_prefix', v_hive.owner_user_id::text || '/' || v_hive.id::text,
    'storage_paths', v_paths,
    'deletion_stage', 'marked',
    'replayed', v_replayed
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hive3_m1_complete_hive_deletion(p_hive_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hive3, public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  DELETE FROM hive3.hives h
  WHERE h.id = p_hive_id
    AND h.deleting_at IS NOT NULL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 1 THEN
    RETURN json_build_object('deleted', true, 'replayed', false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM hive3.hives h WHERE h.id = p_hive_id
  ) THEN
    RETURN json_build_object('deleted', true, 'replayed', true);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM hive3.hives h
    WHERE h.id = p_hive_id
      AND h.deleting_at IS NULL
  ) THEN
    RAISE EXCEPTION 'hive_not_deleting';
  END IF;

  RAISE EXCEPTION 'hive_not_found';
END;
$$;

REVOKE ALL ON FUNCTION public.hive3_m1_begin_hive_deletion(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_m1_complete_hive_deletion(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_m1_complete_hive_deletion(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hive3_m1_complete_hive_deletion(uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.hive3_m1_begin_hive_deletion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_m1_complete_hive_deletion(uuid) TO service_role;

COMMIT;
