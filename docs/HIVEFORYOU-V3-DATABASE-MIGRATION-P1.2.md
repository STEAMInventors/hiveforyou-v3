# P1.2 — `hive3.hives` migration and adoption procedures

**Status:** READY_FOR_REVIEW (2026-10-20)  
**Ticket:** P1.2 — Database Schema and RLS Design  
**SQL artifact:** `supabase/migrations/20261020120000_hive3_m1_hives_baseline.sql`  
**Authority:** `docs/HIVEFORYOU-V3-DATABASE-INVENTORY-P1.1.md` (§5, §7 Q1–Q5, §8 PC-01–PC-12), MD-01, MD-05, OD-02, OD-12. Inventory PC-06 proposed `ON DELETE RESTRICT` until account deletion was defined. OD-12 defines that policy and keeps the reported live `ON DELETE CASCADE`.

**Execution:** This document and the migration file are **review-only** until **P1.3** is authorized to apply SQL on a **non-production** Supabase project. Do not run against production without a separate promotion gate (plan P6.2).

---

## 1. Target definition (Milestone 1)

The migration defines the **reviewed target** for `hive3.hives`. It is the static baseline P1.3 will qualify.

| Item | Target |
|------|--------|
| Columns | `id`, `owner_user_id`, `name`, `description`, `client_request_id`, `created_at`, `updated_at`, `archived_at` (types/nullability per inventory §4.1 / Q2) |
| PK | `id uuid` with `DEFAULT gen_random_uuid()` |
| Idempotency | `UNIQUE (owner_user_id, client_request_id)` |
| FK | `owner_user_id → auth.users(id) ON DELETE CASCADE` (reported live action; OD-12) |
| Trigger | `BEFORE UPDATE` → `hive3.set_updated_at()` |
| RLS | `ENABLE` + `FORCE`; owner-only SELECT/INSERT/UPDATE for `authenticated` (Q3) |
| DELETE | No DELETE policy; `REVOKE DELETE` from `authenticated` (PC-04) |
| Grants | `USAGE` on schema `hive3` and `SELECT, INSERT, UPDATE` on `hives` for `authenticated` only; no `anon` table access |

**Not in this migration:** CHECK constraints for name/description length (PC-02), `client_request_id uuid` (PC-03), storage buckets, other 15 design tables, `upload_quota_events` (PC-08), account-deletion tables, notification, the 30-day retention job, recovery, permanent cleanup, and the deletion audit (OD-12).

### 1.1 Account-deletion boundary (OD-12)

The reviewed foreign key is **`ON DELETE CASCADE`**, the same action as the reported live `hive3.hives.owner_user_id` constraint. Cascade runs when `auth.users` is removed. The product lifecycle — notify, retain 30 days, allow recovery, then permanently delete storage and database rows and write a deletion audit — is in `docs/PRODUCT-REQUIREMENTS.md` §4.1. This migration does not implement it.

On apply:

- An existing single-column `owner_user_id` → `auth.users` foreign key that is already `ON DELETE CASCADE` is left in place, including its current name.
- If that foreign key uses another delete action, the same transaction drops and re-adds it as `ON DELETE CASCADE` under the same name. Hive rows stay.
- If the foreign key is missing, the migration adds `hives_owner_user_id_fkey` with `ON DELETE CASCADE`.
- If more than one such foreign key exists, apply stops. Reconcile to one cascade constraint in a reviewed follow-up before retrying.

`authenticated` still has no DELETE privilege and no DELETE policy (PC-04).

---

## 2. Evidence layers (do not collapse)

| Layer | P1.2 state |
|-------|------------|
| User-reported live table | Columns, constraints, owner-only policies, RLS enabled+forced **confirmed** in P1.2 ticket context |
| Repo migration | **This file** — static target for review |
| Independent catalog (Q1) | **Still required before P1.3 apply** — policy expressions, grants, and exact constraint names must be captured and diffed |
| Cross-user isolation (Q4) | **Not tested** — P1.3 only |

Parity between live Supabase and this migration is **assumed unproven** until Q1 output is saved and Q2 passes. A pre-existing table does **not** justify marking the migration applied without running and verifying the SQL (inventory §5, Q8).

---

## 3. Clean install (new environment)

Use when `hive3.hives` does **not** exist (local Supabase, new branch project, future env).

1. **Authorize** P1.3 for the target project only.
2. Ensure Supabase CLI (or dashboard SQL runner) can apply versioned migrations under `supabase/migrations/`.
3. **Apply** `20261020120000_hive3_m1_hives_baseline.sql` once (CLI: `supabase db push` or `supabase migration up` per project setup).
4. Run **§6 drift queries**; expect all structural checks to match §1.
5. Run **P1.3 qualification** (§8): Q3–Q5 on empty DB, then Q4 with two test users.
6. Record migration version in project history **only after** step 4–5 pass on that environment.

**Data API:** Exposing schema `hive3` in Supabase API settings is a **Q5 / P1.4** decision. Do not expose `hive3` to the browser until Q3 and Q4 pass on that project.

---

## 4. Adoption (existing manual `hive3.hives`)

Use when the table was created in the SQL Editor before this migration existed (inventory §5.1).

**Rule:** Reconciliation **adopts** the live object. It never `DROP TABLE hives`, never truncates, and never recreates the table to “match” the file.

1. **Q1 — Catalog capture (read-only)**  
   Run §7 SQL in the Supabase SQL Editor (or `psql`). Save sanitized results as P1.3 ticket evidence (no credentials in git). Required fields: columns, constraints, RLS flags, policies (`USING` / `WITH CHECK` / roles), table and schema grants, Data API exposed schemas list.

2. **Diff Q1 → §1**  
   - If Q2 fails (missing column, unique key, or FK): the migration’s `ALTER` / `ADD CONSTRAINT` blocks are the **approved repair** path — apply via P1.3, not ad hoc SQL Editor edits (PC-12).  
   - If Q1 shows extra objects (unexpected policies, grants to `anon`, DELETE policy): document variance; extend migration in a **new** reviewed file if repair cannot be done safely in the baseline.  
   - If adding `UNIQUE` or `NOT NULL` fails due to existing bad rows: **stop**; repair data manually with a written plan; do not drop data automatically.

3. **Apply migration on non-production**  
   Run the full baseline script. Idempotent sections should no-op or align live objects to §1.

4. **Re-run Q1 and §6 drift queries**  
   Confirm post-apply catalog matches §1.

5. **Migration history (critical)**  
   - **Wrong:** `supabase migration repair --status applied` (or inserting into `supabase_migrations.schema_migrations`) **only** because `hive3.hives` already existed.  
   - **Right:** Record version `20261020120000` as applied **after** successful execution of this SQL on that database **and** Q2–Q3 pass on post-apply catalog. Keep Q1 before/after snapshots in ticket evidence.

6. **Production shared with V2**  
   Same Supabase project as V2: apply only objects in schema `hive3`. Do not modify `hive` or V2 `public` objects. Verify V2 smoke after apply if the project is shared.

---

## 5. Failure handling and rollback

All steps assume a **manual, approval-gated** operator. Nothing in this migration auto-drops user data on failure.

| Failure | Safe response | Do not |
|---------|---------------|--------|
| Transaction abort mid-migration | Fix root cause; re-run whole migration file (idempotent) | Drop table or truncate `hives` |
| `ADD CONSTRAINT` unique violation | Identify duplicate `(owner_user_id, client_request_id)` rows; merge/archive in a **data repair** ticket | Delete arbitrary rows without owner approval |
| `ADD CONSTRAINT` FK violation | Fix orphan `owner_user_id` values | Disable FK or delete hives silently |
| Multiple `owner_user_id` foreign keys | Stop; record Q1 names and delete actions; reconcile to one `ON DELETE CASCADE` constraint in a reviewed follow-up | Drop `hives` or delete rows to clear the error |
| Owner FK delete action replaced | Confirm post-apply `pg_get_constraintdef` contains `ON DELETE CASCADE` and row counts are unchanged | Treat the constraint swap as a data delete |
| RLS lock-out for table owner | Use documented break-glass (`postgres` / dashboard superuser); adjust policies in a follow-up migration | Disable RLS permanently in production |
| Applied wrong version | Stop app traffic to `hive3`; document state; forward-fix with a **new** migration | `DROP TABLE` to revert |

**Rollback (non-destructive, data-preserving):**  
Rollback is **not** automated. To undo **policy/grant/trigger** changes only (keeping rows):

1. Export current policies and grants (Q1 queries) for backup.  
2. Optionally `DROP POLICY` / `REVOKE` / `DROP TRIGGER` to last known-good definitions captured in Q1 **before** apply — only if P1.3 explicitly authorizes revert.  
3. Removing `FORCE ROW LEVEL SECURITY` or constraints is a **forward migration** decision, not silent rollback.

**Never** run `DROP TABLE hive3.hives` or `DROP SCHEMA hive3 CASCADE` as rollback on a database that may contain customer rows.

---

## 6. Schema drift checks (observability)

Run after apply and periodically before releases. Log results in qualification tickets; do not log connection strings or keys.

```sql
-- RLS posture
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'hive3' AND c.relname = 'hives';

-- Columns (compare to §1)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'hive3' AND table_name = 'hives'
ORDER BY ordinal_position;

-- Constraints
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'hive3.hives'::regclass
ORDER BY conname;

-- Policies
SELECT polname, polcmd, polroles::regrole[], pg_get_expr(polqual, polrelid) AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS with_check_expr
FROM pg_policy
WHERE polrelid = 'hive3.hives'::regclass;

-- Table privileges
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'hive3' AND table_name = 'hives'
ORDER BY grantee, privilege_type;
```

**Owner foreign key:** `pg_get_constraintdef` for the single `owner_user_id` → `auth.users` constraint must include `ON DELETE CASCADE`.

**Migration status (Supabase):**  
Inspect `supabase_migrations.schema_migrations` (or CLI `supabase migration list`) for version `20261020120000`. Status must align with §4 step 5 — applied timestamp **after** verified apply, not merely because the table pre-existed.

---

## 7. Q1 catalog capture (read-only, P1.3 prep)

Use inventory §7 Q1 verbatim intent. Single script for operators:

```sql
-- hive3.hives — Q1 catalog bundle (read-only)
SELECT c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'hive3' AND c.relname = 'hives';

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'hive3' AND table_name = 'hives'
ORDER BY ordinal_position;

SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'hive3.hives'::regclass
ORDER BY conname;

SELECT polname, polcmd, polroles::regrole[],
       pg_get_expr(polqual, polrelid) AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS with_check_expr
FROM pg_policy
WHERE polrelid = 'hive3.hives'::regclass;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'hive3' AND table_name = 'hives'
ORDER BY grantee, privilege_type;

SELECT nspname, pg_catalog.has_schema_privilege('authenticated', n.oid, 'USAGE') AS authenticated_usage
FROM pg_namespace n
WHERE nspname = 'hive3';
```

Record whether `hive3` appears in the project’s **API exposed schemas** (Dashboard → Settings → API) in the same evidence bundle.

---

## 8. P1.3 qualification checklist (precise)

**Executable procedure (P1.3 ticket):** `docs/HIVEFORYOU-V3-DATABASE-QUALIFICATION-P1.3.md` and `supabase/qualification/p1.3_q*.sql`.

Execute only after P1.2 SQL is **accepted** and P1.3 is **authorized** to apply/write test data on non-production.

| ID | Gate | Pass criteria | Fail action |
|----|------|---------------|-------------|
| **Q1** | Live definition | §7 output saved; reviewer can diff to §1 and inventory §5 | Block apply; do not `repair` migration |
| **Q2** | Structural match | PK `id`; NOT NULL on `owner_user_id`, `name`, `client_request_id`, `created_at`, `updated_at`; nullable `description`, `archived_at`; one FK `owner_user_id → auth.users` **`ON DELETE CASCADE`**; unique `(owner_user_id, client_request_id)` | Fix via approved migration only (PC-12) |
| **Q3** | Owner policies | SELECT `USING (owner_user_id = auth.uid())`; INSERT/UPDATE `WITH CHECK (owner_user_id = auth.uid())`; UPDATE `USING` same; RLS enabled+forced; no DELETE policy; `anon` without table privileges | Forward-fix migration; re-run Q1 |
| **Q4** | Cross-user isolation | Users A/B: A creates hive; B cannot SELECT/UPDATE; B INSERT with A’s `owner_user_id` rejected; idempotent replay same `client_request_id` returns one row; document `service_role` bypass | Block M1 DB gate; no P1.4 |
| **Q5** | Grants + API | `authenticated` has only intended privileges; `hive3` API exposure matches explicit decision (defer exposure until P1.4 if needed) | Adjust grants/exposure; re-run Q3–Q4 if exposure changes |
| **Q8** | Drift closure | Baseline under `supabase/migrations/`; adopt without drop; rollback notes in §5; repeated apply idempotent; no new SQL Editor DDL (PC-12) | Stop; reconcile process before bootstrap |

**Optional (defer unless PC-02 accepted in P1.3):** Q4 cases for name > 100 chars / description > 500 once CHECK constraints exist.

**Out of scope for M1 P1.3:** Q6 upload, Q7 study tables.

---

## 9. Known gaps vs user confirmation

| Topic | User / ticket | Repo / verification |
|-------|---------------|---------------------|
| Column + constraint set | Confirmed aligned with MD-01 | Migration encodes §1; **Q1 not yet in repo** |
| Policy expressions | Owner-only SELECT/INSERT/UPDATE confirmed | Migration uses Q3 predicates; **WITH CHECK not catalog-proven** |
| Grants | Not stated in P1.1 | Migration follows Q5 target; **Q1 grants not captured** |
| `updated_at` trigger | Required in P1.2 scope | In migration; **may differ from manual SQL Editor script** until Q1 after apply |
| Owner FK delete action | User reports live `ON DELETE CASCADE` (2026-10-20) | Migration preserves CASCADE (§1.1). **Q1 has not saved the live constraint name or `pg_get_constraintdef`** |
| CHECK lengths (PC-02) | Open | API validation at P1.4 unless PC-02 accepted |
| Data API expose `hive3` | Open (Q5) | Document at P1.4 |

---

## 10. Proposed corrections reflected in SQL

| ID | In baseline migration? |
|----|----------------------|
| PC-01 FORCE RLS | Yes |
| PC-04 no DELETE | Yes (revoke + no policy) |
| PC-05 defaults + `updated_at` trigger | Yes |
| PC-06 owner FK delete action | Yes, **revised:** `ON DELETE CASCADE` (OD-12). Inventory text that proposed `RESTRICT` is superseded |
| PC-12 adopt-not-drop | Yes (design of file + §4) |
| PC-02, PC-03, PC-08 | No — separate migration if accepted |

---

## 11. Related documents

- Inventory: `docs/HIVEFORYOU-V3-DATABASE-INVENTORY-P1.1.md`  
- Design (proposed): `docs/HIVEFORYOU-V3-DATABASE-DESIGN-v0.1.md`  
- Active ticket: `docs/NEXT.md`
