-- P1.6 — Authoritative upload product policy (quota, size, MIME, commercial offer).
-- Do not execute without operator authorization.

BEGIN;

-- ---------------------------------------------------------------------------
-- Policy + audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hive3.upload_product_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean NOT NULL DEFAULT false,
  free_uploads_per_utc_month integer NOT NULL,
  max_file_bytes bigint NOT NULL,
  allowed_mime_types text[] NOT NULL,
  commercial_pack_upload_count integer NOT NULL,
  commercial_pack_price_cents integer NOT NULL,
  commercial_pack_currency char(3) NOT NULL,
  payments_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT upload_product_policy_free_uploads_positive CHECK (free_uploads_per_utc_month > 0),
  CONSTRAINT upload_product_policy_max_bytes_positive CHECK (max_file_bytes > 0),
  CONSTRAINT upload_product_policy_mimes_nonempty CHECK (cardinality(allowed_mime_types) > 0),
  CONSTRAINT upload_product_policy_pack_uploads_positive CHECK (commercial_pack_upload_count > 0),
  CONSTRAINT upload_product_policy_pack_price_positive CHECK (commercial_pack_price_cents > 0),
  CONSTRAINT upload_product_policy_currency_len CHECK (char_length(commercial_pack_currency) = 3)
);

COMMENT ON TABLE hive3.upload_product_policy IS
  'Single active row defines OD-01 upload limits and commercial offer; enforced by hive3 document RPCs.';

CREATE UNIQUE INDEX IF NOT EXISTS upload_product_policy_one_active_idx
  ON hive3.upload_product_policy (is_active)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS hive3.upload_product_policy_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES hive3.upload_product_policy (id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid,
  operation text NOT NULL,
  snapshot jsonb NOT NULL,
  CONSTRAINT upload_product_policy_audit_operation_check CHECK (
    operation IN ('INSERT', 'UPDATE', 'DELETE')
  )
);

COMMENT ON TABLE hive3.upload_product_policy_audit IS
  'Append-only audit trail for upload_product_policy changes (operator SQL only).';

DROP TRIGGER IF EXISTS upload_product_policy_set_updated_at ON hive3.upload_product_policy;

CREATE TRIGGER upload_product_policy_set_updated_at
  BEFORE UPDATE ON hive3.upload_product_policy
  FOR EACH ROW
  EXECUTE FUNCTION hive3.set_updated_at();

CREATE OR REPLACE FUNCTION hive3.audit_upload_product_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hive3, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO hive3.upload_product_policy_audit (policy_id, operation, snapshot, changed_by)
    VALUES (NEW.id, 'INSERT', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO hive3.upload_product_policy_audit (policy_id, operation, snapshot, changed_by)
    VALUES (NEW.id, 'UPDATE', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO hive3.upload_product_policy_audit (policy_id, operation, snapshot, changed_by)
    VALUES (OLD.id, 'DELETE', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS upload_product_policy_audit_tr ON hive3.upload_product_policy;

CREATE TRIGGER upload_product_policy_audit_tr
  AFTER INSERT OR UPDATE OR DELETE ON hive3.upload_product_policy
  FOR EACH ROW
  EXECUTE FUNCTION hive3.audit_upload_product_policy();

CREATE OR REPLACE FUNCTION hive3.sync_source_document_storage_bucket_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = hive3, storage, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NEW.is_active THEN
    UPDATE storage.buckets
    SET
      file_size_limit = NEW.max_file_bytes,
      allowed_mime_types = NEW.allowed_mime_types
    WHERE id = 'hive3-source-documents';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS upload_product_policy_sync_storage_tr ON hive3.upload_product_policy;

CREATE TRIGGER upload_product_policy_sync_storage_tr
  AFTER INSERT OR UPDATE ON hive3.upload_product_policy
  FOR EACH ROW
  EXECUTE FUNCTION hive3.sync_source_document_storage_bucket_limits();

ALTER TABLE hive3.upload_product_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE hive3.upload_product_policy FORCE ROW LEVEL SECURITY;
ALTER TABLE hive3.upload_product_policy_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE hive3.upload_product_policy_audit FORCE ROW LEVEL SECURITY;

REVOKE ALL ON hive3.upload_product_policy FROM PUBLIC;
REVOKE ALL ON hive3.upload_product_policy_audit FROM PUBLIC;
REVOKE ALL ON hive3.upload_product_policy FROM authenticated;
REVOKE ALL ON hive3.upload_product_policy_audit FROM authenticated;

-- ---------------------------------------------------------------------------
-- Seed approved policy (idempotent: only when no active row exists)
-- ---------------------------------------------------------------------------
INSERT INTO hive3.upload_product_policy (
  is_active,
  free_uploads_per_utc_month,
  max_file_bytes,
  allowed_mime_types,
  commercial_pack_upload_count,
  commercial_pack_price_cents,
  commercial_pack_currency,
  payments_enabled
)
SELECT
  true,
  10,
  26214400::bigint,
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[],
  10,
  500,
  'USD',
  false
WHERE NOT EXISTS (
  SELECT 1 FROM hive3.upload_product_policy p WHERE p.is_active
);

-- ---------------------------------------------------------------------------
-- Policy helpers (authoritative for RPC enforcement)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hive3.m1_build_upload_policy_json(p_row hive3.upload_product_policy)
RETURNS json
LANGUAGE sql
IMMUTABLE
SET search_path = hive3, pg_temp
AS $$
  SELECT json_build_object(
    'max_file_bytes', p_row.max_file_bytes,
    'allowed_mime_types', to_json(p_row.allowed_mime_types),
    'free_uploads_per_utc_month', p_row.free_uploads_per_utc_month,
    'commercial_offer', json_build_object(
      'upload_count', p_row.commercial_pack_upload_count,
      'price_cents', p_row.commercial_pack_price_cents,
      'currency', p_row.commercial_pack_currency,
      'payments_enabled', p_row.payments_enabled
    )
  );
$$;

CREATE OR REPLACE FUNCTION hive3.m1_require_active_upload_policy()
RETURNS hive3.upload_product_policy
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = hive3, pg_temp
AS $$
DECLARE
  v_row hive3.upload_product_policy%ROWTYPE;
BEGIN
  SELECT *
    INTO v_row
  FROM hive3.upload_product_policy p
  WHERE p.is_active
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'upload_policy_unconfigured';
  END IF;

  IF v_row.free_uploads_per_utc_month <= 0
     OR v_row.max_file_bytes <= 0
     OR cardinality(v_row.allowed_mime_types) = 0
     OR v_row.commercial_pack_upload_count <= 0
     OR v_row.commercial_pack_price_cents <= 0
     OR char_length(btrim(v_row.commercial_pack_currency::text)) <> 3 THEN
    RAISE EXCEPTION 'upload_policy_invalid';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION hive3.m1_allowed_upload_mime(p_mime text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = hive3, pg_temp
AS $$
DECLARE
  v_mimes text[];
BEGIN
  v_mimes := (hive3.m1_require_active_upload_policy()).allowed_mime_types;
  RETURN p_mime = ANY(v_mimes);
END;
$$;

CREATE OR REPLACE FUNCTION hive3.m1_upload_max_bytes()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = hive3, pg_temp
AS $$
  SELECT (hive3.m1_require_active_upload_policy()).max_file_bytes;
$$;

CREATE OR REPLACE FUNCTION hive3.m1_free_upload_limit()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = hive3, pg_temp
AS $$
  SELECT (hive3.m1_require_active_upload_policy()).free_uploads_per_utc_month;
$$;

CREATE OR REPLACE FUNCTION public.hive3_m1_get_upload_quota()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = hive3, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_used integer;
  v_policy hive3.upload_product_policy%ROWTYPE;
  v_limit integer;
  w record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  v_policy := hive3.m1_require_active_upload_policy();
  v_limit := v_policy.free_uploads_per_utc_month;

  SELECT * INTO w FROM hive3.utc_month_window();
  SELECT count(*)::integer INTO v_used
  FROM hive3.upload_quota_events e
  WHERE e.owner_user_id = v_uid
    AND e.created_at >= w.month_start
    AND e.created_at < w.month_end;

  RETURN json_build_object(
    'used', v_used,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_used, 0),
    'month_start_utc', w.month_start,
    'month_end_utc', w.month_end,
    'policy', hive3.m1_build_upload_policy_json(v_policy)
  );
END;
$$;

COMMIT;
