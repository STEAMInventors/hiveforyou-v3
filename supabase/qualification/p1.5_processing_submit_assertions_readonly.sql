-- P1.5-processing submit RPC structural checks (readonly; run after migrations applied).

DO $$
BEGIN
  IF to_regprocedure(
    'public.hive3_p15_submit_study_processing(uuid, text, text, text, text, jsonb)'
  ) IS NULL THEN
    RAISE EXCEPTION 'missing hive3_p15_submit_study_processing';
  END IF;

  IF to_regprocedure('public.hive3_p15_worker_get_processing_context(uuid)') IS NULL THEN
    RAISE EXCEPTION 'missing hive3_p15_worker_get_processing_context';
  END IF;

  IF to_regprocedure('public.hive3_p15_worker_list_registered_sources(uuid)') IS NULL THEN
    RAISE EXCEPTION 'missing hive3_p15_worker_list_registered_sources';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.hive3_p15_submit_study_processing(uuid, text, text, text, text, jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated must EXECUTE hive3_p15_submit_study_processing';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.hive3_p15_worker_get_processing_context(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated must not EXECUTE worker_get_processing_context';
  END IF;
END;
$$;
