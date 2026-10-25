-- UX-DOC-1 Step 3 — Read-only assertions for the owner extraction progress RPC (run after migration apply).
-- Migration: 20261025120000_hive3_uxdoc1_extraction_progress.sql
-- Supabase SQL Editor: run as plain SQL. No data is written.

-- Owner progress RPC exists, SECURITY DEFINER, authenticated yes, anon/public no.
DO $$
DECLARE
  v_sig constant text := 'public.hive3_p2px_owner_get_extraction_progress(uuid)';
BEGIN
  IF to_regprocedure(v_sig) IS NULL THEN
    RAISE EXCEPTION 'missing hive3_p2px_owner_get_extraction_progress';
  END IF;
  IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = to_regprocedure(v_sig)) THEN
    RAISE EXCEPTION 'owner_get_extraction_progress must be SECURITY DEFINER';
  END IF;
  IF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must EXECUTE owner_get_extraction_progress';
  END IF;
  IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not EXECUTE owner_get_extraction_progress';
  END IF;
END $$;

-- Data integrity (read-only): finished markers never exceed the run's source set,
-- and every marker names a source document in the same Hive as its run.
SELECT
  (SELECT count(*) FROM (
     SELECT m.study_run_id
     FROM hive3.study_run_artifacts m
     JOIN hive3.study_run_artifacts s
       ON s.study_run_id = m.study_run_id
      AND s.artifact_kind = 'processing-source-set@1'
      AND s.revision = 1
     WHERE m.artifact_kind LIKE 'pack-extraction-document@1:%'
     GROUP BY m.study_run_id, s.payload_jsonb
     HAVING count(*) > coalesce((s.payload_jsonb ->> 'count')::integer, 0)
   ) over_total) AS runs_with_markers_over_total,
  (SELECT count(*)
     FROM hive3.study_run_artifacts m
     JOIN hive3.study_runs r ON r.id = m.study_run_id
     LEFT JOIN hive3.source_documents d
       ON d.id::text = m.payload_jsonb ->> 'source_document_id'
      AND d.hive_id = r.hive_id
     WHERE m.artifact_kind LIKE 'pack-extraction-document@1:%'
       AND d.id IS NULL) AS markers_without_same_hive_source;
