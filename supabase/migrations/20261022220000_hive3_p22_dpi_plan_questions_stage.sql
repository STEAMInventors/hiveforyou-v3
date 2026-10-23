-- P2.2-DP.I: add plan_questions stage (forward-only; do not apply without operator authorization).

ALTER TABLE hive3.study_runs
  DROP CONSTRAINT IF EXISTS study_runs_stage_check;

ALTER TABLE hive3.study_runs
  ADD CONSTRAINT study_runs_stage_check CHECK (
    stage IN (
      'enqueue',
      'plan_questions',
      'load_sources',
      'plan_schema',
      'extract',
      'verify',
      'merge_study',
      'analyze',
      'report',
      'finalize'
    )
  );

COMMENT ON CONSTRAINT study_runs_stage_check ON hive3.study_runs IS
  'P2.2-DP.I extends stages with plan_questions before load_sources.';

-- Owner-safe planning summary (no verbatim intent, no private catalog).
CREATE OR REPLACE FUNCTION public.hive3_p15_owner_get_planning_summary(p_study_run_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = hive3, public
AS $$
DECLARE
  v_run hive3.study_runs%ROWTYPE;
  v_qs hive3.study_run_artifacts%ROWTYPE;
  v_plan hive3.study_run_artifacts%ROWTYPE;
  v_labels json;
  v_budget text;
  v_pack_id text;
  v_pack_version text;
  v_hash text;
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

  SELECT * INTO v_qs
  FROM hive3.study_run_artifacts a
  WHERE a.study_run_id = p_study_run_id
    AND a.artifact_kind = 'study-question-set@1'
    AND a.revision = 1;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'study_run_id', p_study_run_id,
      'stage', v_run.stage,
      'merged_question_count', 0,
      'merged_question_labels', '[]'::json,
      'budget_outcome', null,
      'pack_id', null,
      'pack_version', null,
      'question_set_hash_prefix', null
    );
  END IF;

  SELECT * INTO v_plan
  FROM hive3.study_run_artifacts a
  WHERE a.study_run_id = p_study_run_id
    AND a.artifact_kind = 'study-plan@1'
    AND a.revision = 1;

  v_budget := v_plan.payload_jsonb ->> 'budget_outcome';
  v_pack_id := v_qs.payload_jsonb ->> 'pack_id';
  v_pack_version := v_qs.payload_jsonb ->> 'pack_version';
  v_hash := v_qs.payload_jsonb ->> 'content_hash';

  SELECT coalesce(
    json_agg(elem ->> 'display_label' ORDER BY ord),
    '[]'::json
  )
  INTO v_labels
  FROM jsonb_array_elements(v_qs.payload_jsonb -> 'merged_questions') WITH ORDINALITY AS t(elem, ord);

  RETURN json_build_object(
    'study_run_id', p_study_run_id,
    'stage', v_run.stage,
    'merged_question_count', jsonb_array_length(v_qs.payload_jsonb -> 'merged_questions'),
    'merged_question_labels', v_labels,
    'budget_outcome', v_budget,
    'pack_id', v_pack_id,
    'pack_version', v_pack_version,
    'question_set_hash_prefix', CASE
      WHEN v_hash IS NOT NULL THEN left(v_hash, 12)
      ELSE null
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.hive3_p15_owner_get_planning_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hive3_p15_owner_get_planning_summary(uuid) TO authenticated;
