-- P1.4 — Public RPC gateway to hive3.hives (schema hive3 not exposed on PostgREST).
-- SECURITY INVOKER: RLS on hive3.hives applies via auth.uid().
-- Do not execute without P1.3 authorization (same gate as baseline migration).

BEGIN;

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
        'updated_at', updated_at
      )
      ORDER BY created_at DESC
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
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.hive3_m1_insert_hive(
  p_name text,
  p_description text,
  p_client_request_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = hive3, public
AS $$
DECLARE
  result json;
BEGIN
  INSERT INTO hive3.hives (name, description, client_request_id)
  VALUES (p_name, p_description, p_client_request_id)
  RETURNING json_build_object(
    'id', id,
    'name', name,
    'description', description,
    'client_request_id', client_request_id,
    'created_at', created_at,
    'updated_at', updated_at
  )
  INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.hive3_m1_list_hives() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_m1_get_hive(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_m1_get_hive_by_client_request_id(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_m1_insert_hive(text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.hive3_m1_list_hives() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_m1_get_hive(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_m1_get_hive_by_client_request_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hive3_m1_insert_hive(text, text, text) TO authenticated;

COMMIT;
