-- P1.5 — source_documents, upload_quota_events (PC-08), private storage bucket.
-- Do not execute without operator authorization (same gate as other hive3 migrations).

BEGIN;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hive3.source_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hive_id uuid NOT NULL REFERENCES hive3.hives (id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL DEFAULT auth.uid(),
  client_request_id text NOT NULL,
  filename text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL,
  sha256 text,
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  registered_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT source_documents_hive_client_request_id_key UNIQUE (hive_id, client_request_id),
  CONSTRAINT source_documents_byte_size_positive CHECK (byte_size > 0),
  CONSTRAINT source_documents_status_check CHECK (
    status IN ('pending', 'registered', 'abandoned', 'failed')
  )
);

COMMENT ON TABLE hive3.source_documents IS
  'Registered uploads; successful registration counts toward OD-01 quota via upload_quota_events.';

CREATE INDEX IF NOT EXISTS source_documents_hive_created_idx
  ON hive3.source_documents (hive_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hive3.upload_quota_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  hive_id uuid NOT NULL REFERENCES hive3.hives (id) ON DELETE CASCADE,
  source_document_id uuid NOT NULL UNIQUE REFERENCES hive3.source_documents (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE hive3.upload_quota_events IS
  'Append-only Free-tier meter (PC-08); one row per successful registration.';

CREATE INDEX IF NOT EXISTS upload_quota_events_owner_month_idx
  ON hive3.upload_quota_events (owner_user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at on source_documents
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS source_documents_set_updated_at ON hive3.source_documents;

CREATE TRIGGER source_documents_set_updated_at
  BEFORE UPDATE ON hive3.source_documents
  FOR EACH ROW
  EXECUTE FUNCTION hive3.set_updated_at();

-- ---------------------------------------------------------------------------
-- UTC month window helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hive3.utc_month_window()
RETURNS TABLE (month_start timestamptz, month_end timestamptz)
LANGUAGE sql
STABLE
SET search_path = hive3, pg_temp
AS $$
  SELECT
    (date_trunc('month', (now() AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC') AS month_start,
    ((date_trunc('month', (now() AT TIME ZONE 'UTC')) + interval '1 month') AT TIME ZONE 'UTC') AS month_end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE hive3.source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE hive3.source_documents FORCE ROW LEVEL SECURITY;

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
    )
  );

ALTER TABLE hive3.upload_quota_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE hive3.upload_quota_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS upload_quota_events_select_owner ON hive3.upload_quota_events;

CREATE POLICY upload_quota_events_select_owner
  ON hive3.upload_quota_events
  FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies for authenticated on upload_quota_events (RPC only).

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
REVOKE ALL ON hive3.source_documents FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON hive3.source_documents TO authenticated;
REVOKE DELETE ON hive3.source_documents FROM authenticated;

REVOKE ALL ON hive3.upload_quota_events FROM PUBLIC;
GRANT SELECT ON hive3.upload_quota_events TO authenticated;

-- ---------------------------------------------------------------------------
-- Private storage bucket (OD-02)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hive3-source-documents',
  'hive3-source-documents',
  false,
  26214400,
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS hive3_source_documents_select_owner ON storage.objects;
DROP POLICY IF EXISTS hive3_source_documents_insert_owner ON storage.objects;
DROP POLICY IF EXISTS hive3_source_documents_update_owner ON storage.objects;
DROP POLICY IF EXISTS hive3_source_documents_delete_owner ON storage.objects;

CREATE POLICY hive3_source_documents_select_owner
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'hive3-source-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY hive3_source_documents_insert_owner
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'hive3-source-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY hive3_source_documents_update_owner
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'hive3-source-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'hive3-source-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY hive3_source_documents_delete_owner
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'hive3-source-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
