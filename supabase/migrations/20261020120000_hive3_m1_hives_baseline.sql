-- P1.2 — Milestone 1 baseline: schema hive3, table hives only.
-- Authority: MD-01, MD-05, OD-02; design v0.1 §4.1 `hives`; inventory Q2–Q3.
-- Adopt-not-drop (PC-12): safe on empty hive3 and on an existing manual hive3.hives.
-- Do not execute from this repo without P1.3 authorization. Do not `repair` this version
-- into schema_migrations until post-apply Q2–Q3 evidence exists (see docs/HIVEFORYOU-V3-DATABASE-MIGRATION-P1.2.md).
--
-- Account deletion (OD-12): keep owner_user_id ON DELETE CASCADE, matching the
-- reported live foreign key. Cascade runs only when auth.users is removed.
-- Notification, 30-day retention, recovery, permanent storage/database cleanup,
-- and deletion audit belong to a future ticket. This file does not delete
-- users, Hive rows, or storage objects, and it adds no deletion tables.
--
-- Deferred optional hardening (not in this migration unless accepted later):
--   PC-02 CHECK name/description/client_request_id lengths
--   PC-03 client_request_id as uuid type
--   PC-08 upload_quota_events

BEGIN;

-- ---------------------------------------------------------------------------
-- Schema isolation (V2 uses other schemas; do not touch hive/public here)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS hive3;

COMMENT ON SCHEMA hive3 IS 'HiveForYou V3 application schema (isolated from V2).';

-- ---------------------------------------------------------------------------
-- Table (clean install path)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hive3.hives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  description text,
  client_request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

COMMENT ON TABLE hive3.hives IS 'M1 workspace boundary; owner-only RLS; idempotent create on (owner_user_id, client_request_id).';

-- ---------------------------------------------------------------------------
-- Reconcile drifted / manual table (ALTER-only; never DROP TABLE)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'hive3'
      AND table_name = 'hives'
      AND column_name = 'description'
  ) THEN
    ALTER TABLE hive3.hives ADD COLUMN description text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'hive3'
      AND table_name = 'hives'
      AND column_name = 'client_request_id'
  ) THEN
    ALTER TABLE hive3.hives ADD COLUMN client_request_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'hive3'
      AND table_name = 'hives'
      AND column_name = 'archived_at'
  ) THEN
    ALTER TABLE hive3.hives ADD COLUMN archived_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'hive3'
      AND table_name = 'hives'
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE hive3.hives ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'hive3'
      AND table_name = 'hives'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE hive3.hives ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END
$$;

ALTER TABLE hive3.hives
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN owner_user_id SET DEFAULT auth.uid(),
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'hive3.hives'::regclass
      AND conname = 'hives_owner_user_id_client_request_id_key'
  ) THEN
    ALTER TABLE hive3.hives
      ADD CONSTRAINT hives_owner_user_id_client_request_id_key
      UNIQUE (owner_user_id, client_request_id);
  END IF;
END
$$;

-- Preserve ON DELETE CASCADE. An existing cascade FK is left unchanged
-- (any constraint name). A different delete action is replaced in this
-- transaction; Hive rows are not deleted. A missing FK is added as
-- hives_owner_user_id_fkey. More than one owner FK stops apply.
DO $$
DECLARE
  fk_count integer;
  fk_name name;
  del_action "char";
BEGIN
  SELECT count(*)
    INTO fk_count
  FROM pg_constraint c
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid
   AND a.attnum = c.conkey[1]
  WHERE c.conrelid = 'hive3.hives'::regclass
    AND c.contype = 'f'
    AND c.confrelid = 'auth.users'::regclass
    AND a.attname = 'owner_user_id'
    AND cardinality(c.conkey) = 1;

  IF fk_count > 1 THEN
    RAISE EXCEPTION
      'hive3.hives has % owner_user_id foreign keys; reconcile to one ON DELETE CASCADE constraint before apply',
      fk_count;
  END IF;

  IF fk_count = 0 THEN
    ALTER TABLE hive3.hives
      ADD CONSTRAINT hives_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
  ELSE
    SELECT c.conname, c.confdeltype
      INTO fk_name, del_action
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = c.conkey[1]
    WHERE c.conrelid = 'hive3.hives'::regclass
      AND c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND a.attname = 'owner_user_id'
      AND cardinality(c.conkey) = 1;

    IF del_action IS DISTINCT FROM 'c' THEN
      EXECUTE format('ALTER TABLE hive3.hives DROP CONSTRAINT %I', fk_name);
      EXECUTE format(
        'ALTER TABLE hive3.hives ADD CONSTRAINT %I FOREIGN KEY (owner_user_id) REFERENCES auth.users (id) ON DELETE CASCADE',
        fk_name
      );
    END IF;
  END IF;
END
$$;

-- NOT NULL alignment (fails if legacy rows violate MD-01; repair data before re-apply)
ALTER TABLE hive3.hives
  ALTER COLUMN owner_user_id SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN client_request_id SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

-- ---------------------------------------------------------------------------
-- updated_at maintenance (PC-05; required for M1 baseline)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hive3.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = hive3, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hives_set_updated_at ON hive3.hives;

CREATE TRIGGER hives_set_updated_at
  BEFORE UPDATE ON hive3.hives
  FOR EACH ROW
  EXECUTE FUNCTION hive3.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (PC-01: ENABLE + FORCE)
-- ---------------------------------------------------------------------------
ALTER TABLE hive3.hives ENABLE ROW LEVEL SECURITY;
ALTER TABLE hive3.hives FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hives_select_owner ON hive3.hives;
DROP POLICY IF EXISTS hives_insert_owner ON hive3.hives;
DROP POLICY IF EXISTS hives_update_owner ON hive3.hives;

CREATE POLICY hives_select_owner
  ON hive3.hives
  FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY hives_insert_owner
  ON hive3.hives
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY hives_update_owner
  ON hive3.hives
  FOR UPDATE
  TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- PC-04: archive via archived_at; no owner DELETE in M1
-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
REVOKE ALL ON SCHEMA hive3 FROM PUBLIC;
GRANT USAGE ON SCHEMA hive3 TO authenticated;

REVOKE ALL ON hive3.hives FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON hive3.hives TO authenticated;
REVOKE DELETE ON hive3.hives FROM authenticated;

COMMIT;
