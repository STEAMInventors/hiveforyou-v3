-- P1.P Gate 1 — Corrective: worker RPC EXECUTE is service_role only.
-- Apply after 20261022100000_hive3_p1p_gate1_processing_persistence.sql when that migration
-- already ran without explicit REVOKE from anon/authenticated (Supabase default EXECUTE grants).
-- Security-only; no function body or table changes.

BEGIN;

REVOKE ALL ON FUNCTION public.hive3_p1p_worker_transition_study_run(
  uuid, text, text, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p1p_worker_transition_study_run(
  uuid, text, text, text, text, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.hive3_p1p_worker_transition_study_run(
  uuid, text, text, text, text, text, text
) FROM authenticated;

REVOKE ALL ON FUNCTION public.hive3_p1p_worker_put_run_artifact(
  uuid, text, text, text, jsonb, integer, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p1p_worker_put_run_artifact(
  uuid, text, text, text, jsonb, integer, text
) FROM anon;
REVOKE ALL ON FUNCTION public.hive3_p1p_worker_put_run_artifact(
  uuid, text, text, text, jsonb, integer, text
) FROM authenticated;

REVOKE ALL ON FUNCTION public.hive3_p1p_worker_get_run_artifact(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hive3_p1p_worker_get_run_artifact(uuid, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.hive3_p1p_worker_get_run_artifact(uuid, text, integer) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.hive3_p1p_worker_transition_study_run(
  uuid, text, text, text, text, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.hive3_p1p_worker_put_run_artifact(
  uuid, text, text, text, jsonb, integer, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.hive3_p1p_worker_get_run_artifact(uuid, text, integer) TO service_role;

COMMIT;
