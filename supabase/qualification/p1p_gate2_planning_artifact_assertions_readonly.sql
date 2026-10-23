-- P1.P Gate 2 — Read-only assertions: planning artifacts reuse Gate 1 store (no new objects).
-- Run after Gate 1 migration apply. Does not INSERT planning rows.

DO $$
BEGIN
  IF to_regclass('hive3.study_run_artifacts') IS NULL THEN
    RAISE EXCEPTION 'missing hive3.study_run_artifacts (apply Gate 1 first)';
  END IF;
END $$;

-- Gate 2 uses the same immutable revision constraint as Gate 1 smoke / P1.5 artifacts.
SELECT EXISTS (
  SELECT 1
  FROM pg_constraint
  WHERE conrelid = 'hive3.study_run_artifacts'::regclass
    AND conname = 'study_run_artifacts_immutable_revision'
) AS gate2_reuses_immutable_revision;

-- Payload size limit must remain sufficient for @1 planning JSON (512 KiB).
SELECT EXISTS (
  SELECT 1
  FROM pg_constraint
  WHERE conrelid = 'hive3.study_run_artifacts'::regclass
    AND conname = 'study_run_artifacts_payload_size'
) AS gate2_payload_limit_present;

-- Normative artifact_kind / contract_version values (Worker-enforced; not DB CHECK).
SELECT unnest(ARRAY[
  'study-question-set@1',
  'study-plan@1',
  'study-question-coverage@1'
]::text[]) AS gate2_planning_artifact_kind;

-- Worker put/get RPCs remain the only mutation path (inherits Gate 1 qualification).
DO $$
BEGIN
  IF to_regprocedure('public.hive3_p1p_worker_put_run_artifact(uuid, text, text, text, jsonb, integer, text)') IS NULL THEN
    RAISE EXCEPTION 'missing hive3_p1p_worker_put_run_artifact';
  END IF;
  IF to_regprocedure('public.hive3_p1p_worker_get_run_artifact(uuid, text, integer)') IS NULL THEN
    RAISE EXCEPTION 'missing hive3_p1p_worker_get_run_artifact';
  END IF;
  IF has_table_privilege('authenticated', 'hive3.study_run_artifacts', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated must not SELECT study_run_artifacts';
  END IF;
END $$;
