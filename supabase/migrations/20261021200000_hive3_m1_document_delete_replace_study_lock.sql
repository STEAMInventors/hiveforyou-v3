-- P1.7-B — Pre-study registered document delete/replace + study source lock (no study-run tables).
-- Apply after 20261021190000_hive3_m1_upload_prepare_quota_dismiss.sql.

BEGIN;

-- ---------------------------------------------------------------------------
-- Lifecycle columns
-- ---------------------------------------------------------------------------
ALTER TABLE hive3.source_documents
  ADD COLUMN IF NOT EXISTS study_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleting_at timestamptz,
  ADD COLUMN IF NOT EXISTS supersedes_document_id uuid REFERENCES hive3.source_documents (id);

COMMENT ON COLUMN hive3.source_documents.study_locked_at IS
  'Set when a source is included in study processing; blocks delete/replace.';
COMMENT ON COLUMN hive3.source_documents.deleting_at IS
  'Registered-document deletion in progress until storage cleanup + finalize.';
COMMENT ON COLUMN hive3.source_documents.supersedes_document_id IS
  'Pending replacement row; original stays registered until replacement completes.';

CREATE UNIQUE INDEX IF NOT EXISTS source_documents_one_active_replacement_idx
  ON hive3.source_documents (supersedes_document_id)
  WHERE supersedes_document_id IS NOT NULL
    AND deleted_at IS NULL
    AND status = 'pending';

-- ---------------------------------------------------------------------------
-- Mutability helpers (shared by delete, replace, future study enqueue)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hive3.m1_registered_source_mutable(
  p_status text,
  p_deleted_at timestamptz,
  p_deleting_at timestamptz,
  p_study_locked_at timestamptz
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = hive3, pg_temp
AS $$
  SELECT
    p_status = 'registered'
    AND p_deleted_at IS NULL
    AND p_deleting_at IS NULL
    AND p_study_locked_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION hive3.m1_hive_has_deletion_in_progress(p_hive_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = hive3, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM hive3.source_documents d
    WHERE d.hive_id = p_hive_id
      AND d.deleted_at IS NULL
      AND d.deleting_at IS NOT NULL
  );
$$;

COMMENT ON FUNCTION hive3.m1_hive_has_deletion_in_progress(uuid) IS
  'True when any source row on the hive is mid registered-document deletion.';

-- Future study enqueue MUST call assert then lock in one transaction (see ARCHITECTURE.md P1.7-B).
CREATE OR REPLACE FUNCTION public.hive3_m1_assert_hive_sources_lockable_for_study(p_hive_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = hive3, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
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

  IF hive3.m1_hive_has_deletion_in_progress(p_hive_id) THEN
    RAISE EXCEPTION 'deletion_in_progress';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.hive3_m1_lock_hive_registered_sources_for_study(p_hive_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = hive3, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_locked integer;
BEGIN
  PERFORM public.hive3_m1_assert_hive_sources_lockable_for_study(p_hive_id);

  UPDATE hive3.source_documents d
  SET study_locked_at = now(), updated_at = now()
  FROM hive3.hives h
  WHERE d.hive_id = p_hive_id
    AND d.hive_id = h.id
    AND h.owner_user_id = v_uid
    AND d.status = 'registered'
    AND d.deleted_at IS NULL
    AND d.deleting_at IS NULL
    AND d.study_locked_at IS NULL;

  GET DIAGNOSTICS v_locked = ROW_COUNT;

  RETURN json_build_object('locked_count', v_locked);
END;
$$;

COMMENT ON FUNCTION public.hive3_m1_lock_hive_registered_sources_for_study(uuid) IS
  'Atomically lock all registered sources on a hive for study processing; rejects when deletion is in progress.';

-- ---------------------------------------------------------------------------
-- Registered document deletion (begin → storage → finalize)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hive3_m1_begin_registered_source_document_deletion(
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
  v_replayed boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
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
    AND d.uploaded_by = v_uid
  FOR UPDATE OF d;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'document_not_found';
  END IF;

  IF v_doc.deleted_at IS NOT NULL THEN
    RETURN json_build_object(
      'document_id', v_doc.id,
      'storage_path', v_doc.storage_path,
      'deletion_stage', 'finalized',
      'replayed', true
    );
  END IF;

  IF NOT hive3.m1_registered_source_mutable(
    v_doc.status, v_doc.deleted_at, v_doc.deleting_at, v_doc.study_locked_at
  ) THEN
    IF v_doc.study_locked_at IS NOT NULL THEN
      RAISE EXCEPTION 'study_source_locked';
    END IF;
    IF v_doc.deleting_at IS NOT NULL THEN
      v_replayed := true;
    ELSE
      RAISE EXCEPTION 'invalid_status';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM hive3.source_documents r
    WHERE r.supersedes_document_id = v_doc.id
      AND r.status = 'pending'
      AND r.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'replacement_in_progress';
  END IF;

  IF v_doc.deleting_at IS NULL THEN
    UPDATE hive3.source_documents
    SET deleting_at = now(), updated_at = now()
    WHERE id = v_doc.id
    RETURNING * INTO v_doc;
  ELSE
    v_replayed := true;
  END IF;

  RETURN json_build_object(
    'document_id', v_doc.id,
    'storage_path', v_doc.storage_path,
    'deletion_stage', 'marked',
    'replayed', v_replayed
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hive3_m1_finalize_registered_source_document_deletion(
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

  SELECT d.*
    INTO v_doc
  FROM hive3.source_documents d
  JOIN hive3.hives h ON h.id = d.hive_id
  WHERE d.hive_id = p_hive_id
    AND d.client_request_id = btrim(p_client_request_id)
    AND h.owner_user_id = v_uid
    AND h.archived_at IS NULL
    AND h.deleting_at IS NULL
    AND d.uploaded_by = v_uid
  FOR UPDATE OF d;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'document_not_found';
  END IF;

  IF v_doc.deleted_at IS NOT NULL THEN
    RETURN json_build_object(
      'document_id', v_doc.id,
      'deleted', true,
      'replayed', true
    );
  END IF;

  IF v_doc.deleting_at IS NULL OR v_doc.status <> 'registered' THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  UPDATE hive3.source_documents
  SET
    deleted_at = now(),
    deleting_at = NULL,
    client_request_id = client_request_id || ':deleted:' || id::text,
    updated_at = now()
  WHERE id = v_doc.id
  RETURNING * INTO v_doc;

  RETURN json_build_object(
    'document_id', v_doc.id,
    'deleted', true,
    'replayed', false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- List — workspace rows + action flags
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
        'registered_at', d.registered_at,
        'study_locked', (d.study_locked_at IS NOT NULL),
        'can_delete', (
          d.deleting_at IS NOT NULL
          OR (
            hive3.m1_registered_source_mutable(
              d.status, d.deleted_at, d.deleting_at, d.study_locked_at
            )
            AND NOT EXISTS (
              SELECT 1
              FROM hive3.source_documents r
              WHERE r.supersedes_document_id = d.id
                AND r.status = 'pending'
                AND r.deleted_at IS NULL
            )
          )
        ),
        'can_replace', hive3.m1_registered_source_mutable(
          d.status, d.deleted_at, d.deleting_at, d.study_locked_at
        )
        AND NOT EXISTS (
          SELECT 1
          FROM hive3.source_documents r
          WHERE r.supersedes_document_id = d.id
            AND r.status = 'pending'
            AND r.deleted_at IS NULL
        )
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

-- My Hives card — exclude documents mid-deletion
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
        'id', h.id,
        'name', h.name,
        'description', h.description,
        'client_request_id', h.client_request_id,
        'created_at', h.created_at,
        'updated_at', h.updated_at,
        'deleting_at', h.deleting_at,
        'registered_document_count', coalesce(doc.doc_count, 0),
        'preview_filenames', coalesce(doc.preview_filenames, '[]'::json)
      )
      ORDER BY (h.deleting_at IS NOT NULL) DESC, h.created_at DESC
    ),
    '[]'::json
  )
  FROM hive3.hives h
  LEFT JOIN LATERAL (
    SELECT
      (
        SELECT count(*)::integer
        FROM hive3.source_documents d
        WHERE d.hive_id = h.id
          AND d.status = 'registered'
          AND d.deleted_at IS NULL
          AND d.deleting_at IS NULL
      ) AS doc_count,
      (
        SELECT coalesce(json_agg(p.filename ORDER BY p.sort_at DESC), '[]'::json)
        FROM (
          SELECT
            d.filename,
            coalesce(d.registered_at, d.created_at) AS sort_at
          FROM hive3.source_documents d
          WHERE d.hive_id = h.id
            AND d.status = 'registered'
            AND d.deleted_at IS NULL
            AND d.deleting_at IS NULL
          ORDER BY coalesce(d.registered_at, d.created_at) DESC
          LIMIT 3
        ) p
      ) AS preview_filenames
  ) doc ON true
  WHERE h.owner_user_id = auth.uid()
    AND h.archived_at IS NULL;
$$;

-- ---------------------------------------------------------------------------
-- Prepare — optional replacement (no extra quota); guard study lock
-- Postgres cannot CREATE OR REPLACE when arity changes; drop five-arg API safely.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.hive3_m1_prepare_source_document_upload(uuid, text, text, text, bigint);

CREATE OR REPLACE FUNCTION public.hive3_m1_prepare_source_document_upload(
  p_hive_id uuid,
  p_client_request_id text,
  p_filename text,
  p_mime_type text,
  p_byte_size bigint,
  p_supersedes_document_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = hive3, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_doc hive3.source_documents%ROWTYPE;
  v_superseded hive3.source_documents%ROWTYPE;
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
      'replayed', true,
      'supersedes_document_id', v_doc.supersedes_document_id
    );
  END IF;

  IF p_supersedes_document_id IS NOT NULL THEN
    SELECT d.*
      INTO v_superseded
    FROM hive3.source_documents d
    JOIN hive3.hives h ON h.id = d.hive_id
    WHERE d.id = p_supersedes_document_id
      AND d.hive_id = p_hive_id
      AND h.owner_user_id = v_uid
      AND d.uploaded_by = v_uid
    FOR UPDATE OF d;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'document_not_found';
    END IF;

    IF NOT hive3.m1_registered_source_mutable(
      v_superseded.status,
      v_superseded.deleted_at,
      v_superseded.deleting_at,
      v_superseded.study_locked_at
    ) THEN
      IF v_superseded.study_locked_at IS NOT NULL THEN
        RAISE EXCEPTION 'study_source_locked';
      END IF;
      RAISE EXCEPTION 'invalid_status';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM hive3.source_documents r
      WHERE r.supersedes_document_id = v_superseded.id
        AND r.status = 'pending'
        AND r.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'replacement_in_progress';
    END IF;
  ELSE
    v_used := hive3.m1_count_quota_used(v_uid);
    IF v_used >= v_limit THEN
      RAISE EXCEPTION 'quota_exceeded';
    END IF;
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
    status,
    supersedes_document_id
  )
  VALUES (
    p_hive_id,
    v_uid,
    btrim(p_client_request_id),
    btrim(p_filename),
    p_mime_type,
    p_byte_size,
    v_path,
    'pending',
    p_supersedes_document_id
  )
  RETURNING * INTO v_doc;

  RETURN json_build_object(
    'document_id', v_doc.id,
    'storage_path', v_doc.storage_path,
    'status', v_doc.status,
    'byte_size', v_doc.byte_size,
    'mime_type', v_doc.mime_type,
    'filename', v_doc.filename,
    'replayed', false,
    'supersedes_document_id', v_doc.supersedes_document_id
  );
END;
$$;

COMMENT ON FUNCTION public.hive3_m1_prepare_source_document_upload(uuid, text, text, text, bigint, uuid) IS
  'Prepare upload; optional supersedes_document_id for replacement (no extra quota on complete); idempotent replay.';

-- ---------------------------------------------------------------------------
-- Complete — replacement swap without extra quota event
-- ---------------------------------------------------------------------------
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
  v_superseded hive3.source_documents%ROWTYPE;
  v_used integer;
  v_limit integer := hive3.m1_free_upload_limit();
  v_superseded_storage_path text;
  v_replacement_committed boolean := false;
  v_replacement_cleanup_pending boolean := false;
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
    v_replacement_committed := (v_doc.supersedes_document_id IS NOT NULL);
    v_superseded_storage_path := NULL;
    IF v_doc.supersedes_document_id IS NOT NULL THEN
      SELECT d.storage_path
        INTO v_superseded_storage_path
      FROM hive3.source_documents d
      WHERE d.id = v_doc.supersedes_document_id
        AND d.hive_id = p_hive_id;

      IF v_superseded_storage_path IS NOT NULL
        AND v_superseded_storage_path IS DISTINCT FROM v_doc.storage_path THEN
        v_replacement_cleanup_pending := true;
      END IF;
    END IF;

    RETURN json_build_object(
      'document_id', v_doc.id,
      'status', v_doc.status,
      'registered_at', v_doc.registered_at,
      'replayed', true,
      'replacement_committed', v_replacement_committed,
      'replacement_cleanup_pending', v_replacement_cleanup_pending,
      'superseded_storage_path', v_superseded_storage_path
    );
  END IF;

  IF v_doc.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  IF p_byte_size IS DISTINCT FROM v_doc.byte_size THEN
    RAISE EXCEPTION 'byte_size_mismatch';
  END IF;

  IF v_doc.supersedes_document_id IS NOT NULL THEN
    SELECT d.*
      INTO v_superseded
    FROM hive3.source_documents d
    WHERE d.id = v_doc.supersedes_document_id
      AND d.hive_id = p_hive_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'document_not_found';
    END IF;

    IF NOT hive3.m1_registered_source_mutable(
      v_superseded.status,
      v_superseded.deleted_at,
      v_superseded.deleting_at,
      v_superseded.study_locked_at
    ) THEN
      IF v_superseded.study_locked_at IS NOT NULL THEN
        RAISE EXCEPTION 'study_source_locked';
      END IF;
      RAISE EXCEPTION 'invalid_status';
    END IF;

    v_superseded_storage_path := v_superseded.storage_path;
    v_replacement_committed := true;
    v_replacement_cleanup_pending := (v_superseded_storage_path IS NOT NULL);

    UPDATE hive3.source_documents
    SET
      status = 'registered',
      sha256 = lower(btrim(p_sha256)),
      registered_at = now()
    WHERE id = v_doc.id
    RETURNING * INTO v_doc;

    UPDATE hive3.source_documents
    SET
      deleted_at = now(),
      client_request_id = client_request_id || ':replaced:' || id::text,
      updated_at = now()
    WHERE id = v_superseded.id;

    RETURN json_build_object(
      'document_id', v_doc.id,
      'status', v_doc.status,
      'registered_at', v_doc.registered_at,
      'replayed', false,
      'replacement_committed', v_replacement_committed,
      'replacement_cleanup_pending', v_replacement_cleanup_pending,
      'superseded_storage_path', v_superseded_storage_path
    );
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
    'replayed', false,
    'replacement_committed', false,
    'replacement_cleanup_pending', false,
    'superseded_storage_path', NULL
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
  SET status = v_status, updated_at = now()
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
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.hive3_m1_assert_hive_sources_lockable_for_study(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_m1_lock_hive_registered_sources_for_study(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_m1_begin_registered_source_document_deletion(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_m1_finalize_registered_source_document_deletion(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_m1_prepare_source_document_upload(uuid, text, text, text, bigint, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.hive3_m1_assert_hive_sources_lockable_for_study(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_m1_lock_hive_registered_sources_for_study(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_m1_begin_registered_source_document_deletion(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_m1_finalize_registered_source_document_deletion(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_m1_prepare_source_document_upload(uuid, text, text, text, bigint, uuid) TO authenticated;

COMMIT;
