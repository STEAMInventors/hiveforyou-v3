-- UX-DOC-1 Step 3 — owner counts-only extraction progress for the live progress modal.
-- Reads Worker run artifacts: `processing-source-set@1` (total) and one
-- `pack-extraction-document@1:<source_document_id>` per finished document (selected-Pack path).
-- Returns run/Hive ids and counts only: no filenames, document ids, facts, quotes or prompt material.
-- Depends on: 20261022100000 (Gate 1 study_run_artifacts).
-- Do not execute without operator authorization.

BEGIN;

CREATE OR REPLACE FUNCTION public.hive3_p2px_owner_get_extraction_progress(p_study_run_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = hive3, public
AS $$
DECLARE
  v_run hive3.study_runs%ROWTYPE;
  v_total integer;
  v_finished integer;
  v_unusable integer;
BEGIN
  SELECT r.* INTO v_run
  FROM hive3.study_runs r
  JOIN hive3.hives h ON h.id = r.hive_id
  WHERE r.id = p_study_run_id
    AND h.owner_user_id = auth.uid()
    AND h.archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  SELECT CASE
           WHEN jsonb_typeof(a.payload_jsonb -> 'count') = 'number'
             THEN (a.payload_jsonb ->> 'count')::integer
         END
  INTO v_total
  FROM hive3.study_run_artifacts a
  WHERE a.study_run_id = v_run.id
    AND a.artifact_kind = 'processing-source-set@1'
    AND a.revision = 1;

  SELECT
    count(*)::integer,
    (count(*) FILTER (WHERE a.payload_jsonb ->> 'disposition' = 'UNUSABLE'))::integer
  INTO v_finished, v_unusable
  FROM hive3.study_run_artifacts a
  WHERE a.study_run_id = v_run.id
    AND a.revision = 1
    AND a.artifact_kind LIKE 'pack-extraction-document@1:%';

  RETURN json_build_object(
    'contract_version', 'pack-extraction-progress@1',
    'study_run_id', v_run.id,
    'hive_id', v_run.hive_id,
    'documents_total', v_total,
    'documents_finished', v_finished,
    'documents_unusable', v_unusable
  );
END;
$$;

REVOKE ALL ON FUNCTION public.hive3_p2px_owner_get_extraction_progress(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p2px_owner_get_extraction_progress(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hive3_p2px_owner_get_extraction_progress(uuid) TO authenticated;

COMMIT;
