-- P1.7-A — My Hives card summary: registered document count + three newest filenames
-- in one owner-scoped list RPC (no PostgREST exposure of hive3).
-- Apply after 20261021170000_hive3_m1_hive_deletion_document_workspace.sql.

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
          ORDER BY coalesce(d.registered_at, d.created_at) DESC
          LIMIT 3
        ) p
      ) AS preview_filenames
  ) doc ON true
  WHERE h.owner_user_id = auth.uid()
    AND h.archived_at IS NULL;
$$;

COMMENT ON FUNCTION public.hive3_m1_list_hives() IS
  'Owner Hive list for My Hives; includes registered document count and up to three newest filenames.';

COMMIT;
