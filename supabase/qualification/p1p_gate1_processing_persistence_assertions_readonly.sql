-- P1.P Gate 1 — Read-only structural assertions (run after migration apply).
-- Supabase SQL Editor: run as plain SQL.

DO $$
BEGIN
  IF to_regclass('hive3.intents') IS NULL THEN
    RAISE EXCEPTION 'missing hive3.intents';
  END IF;
  IF to_regclass('hive3.study_runs') IS NULL THEN
    RAISE EXCEPTION 'missing hive3.study_runs';
  END IF;
  IF to_regclass('hive3.study_run_artifacts') IS NULL THEN
    RAISE EXCEPTION 'missing hive3.study_run_artifacts';
  END IF;
END $$;

SELECT
  EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'hive3'
      AND tablename = 'study_runs'
      AND indexname = 'study_runs_idempotency_key_unique'
  ) AS has_idempotency_unique,
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'hive3.study_run_artifacts'::regclass
      AND conname = 'study_run_artifacts_immutable_revision'
  ) AS has_artifact_immutable_revision;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'hive3_p1p_enqueue_study_run'
  ) THEN
    RAISE EXCEPTION 'missing hive3_p1p_enqueue_study_run';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'hive3_p1p_worker_put_run_artifact'
  ) THEN
    RAISE EXCEPTION 'missing hive3_p1p_worker_put_run_artifact';
  END IF;
END $$;

-- RLS forced on processing tables.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'hive3'
      AND c.relname = 'study_run_artifacts'
      AND c.relrowsecurity
      AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'study_run_artifacts must have RLS enabled and forced';
  END IF;
END $$;

-- Authenticated must not read artifacts table directly.
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'hive3.study_run_artifacts', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated must not SELECT study_run_artifacts';
  END IF;
END $$;

-- Worker RPCs: service_role only (effective privileges include PUBLIC / role inheritance).
DO $$
DECLARE
  v_worker_rpcs text[] := ARRAY[
    'public.hive3_p1p_worker_transition_study_run(uuid, text, text, text, text, text, text)',
    'public.hive3_p1p_worker_put_run_artifact(uuid, text, text, text, jsonb, integer, text)',
    'public.hive3_p1p_worker_get_run_artifact(uuid, text, integer)'
  ];
  v_sig text;
  v_denied_roles text[] := ARRAY['anon', 'authenticated'];
  v_role text;
  v_public_execute boolean;
BEGIN
  FOREACH v_sig IN ARRAY v_worker_rpcs LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'missing worker RPC %', v_sig;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      WHERE p.oid = to_regprocedure(v_sig)
        AND acl.privilege_type = 'EXECUTE'
        AND acl.grantee = 0
    ) INTO v_public_execute;

    IF v_public_execute THEN
      RAISE EXCEPTION 'PUBLIC must not EXECUTE %', v_sig;
    END IF;

    FOREACH v_role IN ARRAY v_denied_roles LOOP
      IF has_function_privilege(v_role, v_sig, 'EXECUTE') THEN
        RAISE EXCEPTION '% must not EXECUTE %', v_role, v_sig;
      END IF;
    END LOOP;

    IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role must EXECUTE %', v_sig;
    END IF;
  END LOOP;
END $$;

-- No direct ACL grant of EXECUTE on worker RPCs to anon/authenticated (not only via PUBLIC).
DO $$
DECLARE
  v_bad_count integer;
BEGIN
  SELECT count(*) INTO v_bad_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
  LEFT JOIN pg_roles r ON r.oid = acl.grantee
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'hive3_p1p_worker_transition_study_run',
      'hive3_p1p_worker_put_run_artifact',
      'hive3_p1p_worker_get_run_artifact'
    )
    AND acl.privilege_type = 'EXECUTE'
    AND (
      acl.grantee = 0
      OR r.rolname IN ('anon', 'authenticated')
    );

  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'worker RPC ACL must not grant EXECUTE to anon/authenticated/PUBLIC';
  END IF;
END $$;

-- Owner RPCs callable by authenticated.
DO $$
BEGIN
  IF NOT has_function_privilege(
    'authenticated',
    'public.hive3_p1p_enqueue_study_run(uuid, uuid, text, text, text, jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated must EXECUTE enqueue_study_run';
  END IF;
END $$;
