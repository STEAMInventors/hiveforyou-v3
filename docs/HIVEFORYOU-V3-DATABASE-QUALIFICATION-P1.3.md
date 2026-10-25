# P1.3 — `hive3.hives` database qualification

**Status:** PROCEDURE_READY (2026-10-20)  
**Ticket:** P1.3 — Database Qualification  
**Scope:** Milestone 1 gate for `hive3.hives` only (no other tables, no Supabase changes from this repo without explicit authorization).  
**Baseline SQL:** `supabase/migrations/20261020120000_hive3_m1_hives_baseline.sql`  
**Adoption authority:** `docs/HIVEFORYOU-V3-DATABASE-MIGRATION-P1.2.md`  
**Inventory gates:** `docs/HIVEFORYOU-V3-DATABASE-INVENTORY-P1.1.md` §7 (Q1–Q5, Q8)

**Execution:** Nothing in this ticket runs automatically. An operator executes scripts on an **authorized non-production** Supabase project (or the shared project only after explicit promotion approval). Do not commit credentials, JWTs, or customer row contents to git.

**Prerequisites before any apply or Q4 writes:**

1. P1.2 migration SQL and adoption doc **accepted** by the product owner.  
2. P1.3 **authorized** for the target project (apply + disposable test users/rows).  
3. Shared V2 project: confirm scope is **schema `hive3` only**; do not modify `hive` / V2 `public` objects.

---

## 1. Evidence status (confirmed vs pending)

| Check | Source | Status | Notes |
|-------|--------|--------|-------|
| Table `hive3.hives` exists | User SQL Editor (2026-10-20) | **Reported confirmed** | Not in repo catalog |
| MD-01 column shape | User + P1.2 migration | **Reported aligned** | Q2 still required |
| RLS `ENABLE` + `FORCE` | User report | **Reported confirmed** | Q1 must capture `relrowsecurity` / `relforcerowsecurity` |
| Owner-only SELECT, INSERT, UPDATE policies (3) | User report | **Reported confirmed** | Policy **names**, `USING` / `WITH CHECK`, and `TO` roles **not catalog-proven** |
| FK `owner_user_id → auth.users` **`ON DELETE CASCADE`** | User report (2026-10-20) | **Reported confirmed** | Constraint **name** and exact `pg_get_constraintdef` **pending Q1** |
| `UNIQUE (owner_user_id, client_request_id)` | MD-01 / migration | **Assumed** | Not user-stated; Q2 required |
| `hive3.set_updated_at` trigger | P1.2 migration only | **Pending** | Manual SQL Editor script may omit trigger until apply |
| Schema/table grants (`authenticated`, no `anon`) | P1.2 migration target | **Pending Q5** | Not in user report |
| Data API exposes schema `hive3` | — | **Pending Q5** | Record dashboard setting; defer exposure until Q3+Q4 pass if undecided |
| Cross-user isolation (Q4) | User | **Not tested** | Blocker for M1 DB gate |
| Migration `20261020120000` in `schema_migrations` | — | **Expected absent** until verified apply | Do not `repair` without running SQL |
| Q1 catalog saved as ticket evidence | — | **Pending** | Blocker before apply on drifted DB |

---

## 2. Expected target (diff source of truth)

Use **§1 of** `docs/HIVEFORYOU-V3-DATABASE-MIGRATION-P1.2.md` and the migration file. Summary for operators:

| Object | Expected |
|--------|----------|
| **Columns (8)** | `id`, `owner_user_id`, `name`, `description`, `client_request_id`, `created_at`, `updated_at`, `archived_at` — types/nullability/defaults per migration |
| **PK** | `id uuid` default `gen_random_uuid()` |
| **Unique** | `(owner_user_id, client_request_id)` — clean install name `hives_owner_user_id_client_request_id_key` (live name may differ; definition must match) |
| **FK** | Exactly one FK on `owner_user_id` → `auth.users(id)` with **`ON DELETE CASCADE`** |
| **Trigger** | `hives_set_updated_at` `BEFORE UPDATE` → `hive3.set_updated_at()` |
| **RLS** | Enabled + forced |
| **Policies** | `hives_select_owner`, `hives_insert_owner`, `hives_update_owner` for role `authenticated` only; predicates in Q3 below; **no DELETE policy** |
| **Grants** | `USAGE` on schema `hive3` to `authenticated`; `SELECT, INSERT, UPDATE` on `hives` to `authenticated`; **no** `DELETE` for `authenticated`; `anon` without table privileges |

**Not required for M1 qualification:** PC-02 CHECK lengths, PC-03 `uuid` for `client_request_id`, storage, other design tables.

---

## 3. Test matrix

| ID | Mode | Script / procedure | When | Pass | Fail action |
|----|------|-------------------|------|------|-------------|
| **Q1** | Read-only | `supabase/qualification/p1.3_q1_catalog_readonly.sql` | **Before** apply (adoption path); **after** apply | Sanitized output saved; reviewer can diff to §2 | Block apply; do not mark migration applied |
| **Q2** | Read-only | `supabase/qualification/p1.3_q2_structural_assertions_readonly.sql` | After Q1; again post-apply | All rows `status = PASS` | Fix via approved migration only (PC-12); data repair ticket if NOT NULL/unique violations |
| **Q3** | Read-only | `supabase/qualification/p1.3_q3_rls_policy_assertions_readonly.sql` | With Q2 | All assertions PASS | Forward-fix migration; re-run Q1 |
| **Q5** | Read-only + dashboard | `supabase/qualification/p1.3_q5_grants_assertions_readonly.sql` + API exposed schemas note | With Q2–Q3 | Grants match §2; exposure documented and consistent with decision | Adjust grants/exposure; re-run Q3–Q4 if exposure changes |
| **Q4** | **Write** (synthetic) | §6 below | **After** Q2–Q3 pass on target DB | All cases PASS | Block P1.4; no Data API exposure |
| **Q8** | Process | §7 reconciliation | After successful apply + gates | Baseline in git; adopt-not-drop; idempotent re-apply noted | Stop; no SQL Editor DDL |
| **Post-apply drift** | Read-only | P1.2 §6 queries (duplicate of Q1 subset) | After apply | Matches §2 | See P1.2 §5 failure table |
| **Migration row** | Read-only | Q1 query block `schema_migrations` | After apply | Version `20261020120000` present **only** after verified SQL run | Never `repair` based on pre-existing table alone |

Optional (defer): Q4 long name/description once PC-02 CHECKs exist.

Out of scope: Q6 upload, Q7 study tables.

---

## 4. Pre-apply drift findings (static review)

Comparison of **reported live** state vs **P1.2 migration** (no Q1 snapshot in repo yet):

| Area | Likely live (report) | Migration adds or normalizes | Risk if apply skipped |
|------|----------------------|------------------------------|------------------------|
| Process | SQL Editor DDL, no `supabase/migrations` history | Versioned file + Q8 | Irreproducible schema; bootstrap drift |
| Trigger / function | Unknown | `hive3.set_updated_at` + `hives_set_updated_at` | `updated_at` stale on UPDATE |
| Policy names / text | Unknown names; owner-only ops reported | Fixed names + Q3 predicates | Missing `WITH CHECK` → cross-owner insert/update |
| Unique constraint | Not reported | `hives_owner_user_id_client_request_id_key` if missing | Idempotent create breaks at API |
| Grants | Not reported | `REVOKE`/`GRANT` blocks | Browser 403 or over-broad `anon` |
| FK name | Unknown | Preserves existing CASCADE FK name | Low if already CASCADE |
| Customer rows | May exist on shared project | Idempotent ALTER; unique/NOT NULL can **fail** on bad data | **Stop**; data repair before re-apply |

**Adopt-not-drop:** Applying the baseline must not `DROP TABLE hive3.hives` or truncate. See P1.2 §4–§5.

---

## 5. Read-only execution (Q1, Q2, Q3, Q5)

### 5.1 Where to run

- Supabase Dashboard → **SQL Editor**, role with catalog read (default `postgres` connection), **or**
- Local `psql` against the project (connection string from secrets store — not git).

### 5.2 Steps

1. Run **`p1.3_q1_catalog_readonly.sql`**. Export results (CSV or copy) into P1.3 ticket evidence. Redact project URL keys if pasted publicly.  
2. Manually diff Q1 output to §2 (or use Q2/Q3/Q5 assertion scripts for machine checks).  
3. Run **`p1.3_q2_structural_assertions_readonly.sql`**. Expect **only** `PASS` rows. Any `FAIL` → record `detail` column; do not apply until resolved or migration amended in a new reviewed file.

**Pre-apply note:** On a manual SQL Editor table, Q3 may **FAIL** on policy **names** or exact predicate text, and Q2 may **FAIL** on trigger/function/grants until the P1.2 baseline is applied. Save pre-apply FAILs as drift evidence; post-apply must be all PASS.  
4. Run **`p1.3_q3_rls_policy_assertions_readonly.sql`**. Same PASS-only rule.  
5. Run **`p1.3_q5_grants_assertions_readonly.sql`**.  
6. Dashboard → **Settings → API → Exposed schemas**: record whether `hive3` is listed. **Recommended until P1.4:** keep `hive3` **not** exposed until Q4 passes; if already exposed, Q4 is mandatory before trusting browser isolation.

### 5.3 Diagnosis (read-only failures)

| Symptom | Likely cause | Safe next step |
|---------|--------------|----------------|
| Q2: missing column | Manual DDL incomplete | Authorized apply of baseline migration |
| Q2: FK not CASCADE | Legacy FK action | Migration § FK block replaces action in transaction (rows preserved) |
| Q2: multiple owner FKs | Duplicate constraints | **Stop**; reconcile to one FK in follow-up migration |
| Q2: unique / NOT NULL fail on apply | Legacy rows | Identify duplicates/orphans; data repair ticket |
| Q3: INSERT policy missing `WITH CHECK` | Weak manual policy | Apply migration policy section |
| Q3: DELETE policy present | Drift from PC-04 | Drop DELETE policy in forward migration; re-run Q1 |
| Q5: `anon` has SELECT | Over-grant | Apply migration REVOKE/GRANT block |
| Q5: authenticated lacks USAGE on `hive3` | Schema grant missing | Apply migration |
| Q1: table missing | Wrong project or clean env | Clean-install path (P1.2 §3) instead of adoption |
| Assertion scripts error `regclass` | Table absent | Create via authorized apply on empty env |

---

## 6. Q4 — Two-user isolation (synthetic data)

**Requires:** P1.3 authorization to **create two test auth users** and **insert/update** disposable rows. Use a **non-production** project when possible. On the shared V2 project, use clearly synthetic names and delete test rows in a documented cleanup step (service role or owner), only if authorized.

**Users:**

- **User A** — `auth.users.id` = `<UUID_A>`  
- **User B** — `auth.users.id` = `<UUID_B>`  

Create via Dashboard → Authentication → Users (or Auth API), not via unchecked SQL against production identities.

**Constants for tests:**

- `client_request_id_a1` = new UUID string (e.g. `11111111-1111-4111-8111-111111111111`)  
- Hive name = `P1.3 isolation test A`  

### 6.1 Recommended path: Supabase client (matches P1.4)

Use the **anon/publishable key** and each user’s **session JWT** (sign in as A and B in two sessions). Target schema **`hive3`** (PostgREST `Accept-Profile` / client schema option per P1.4 setup).

| Step | Actor | Action | Expected result |
|------|-------|--------|-----------------|
| 4.1 | A | `INSERT` hive with `name`, `client_request_id_a1`, optional `description`; omit `owner_user_id` or set to self | **Success**; one row; `owner_user_id = UUID_A` |
| 4.2 | A | `SELECT` by `id` | **Returns** the row |
| 4.3 | B | `SELECT` where `id = <A's id>` | **Zero rows** (empty set, not error) |
| 4.4 | B | `UPDATE` row `id = <A's id>` set `name = ' hacked'` | **Zero rows updated** (or RLS error depending on client) |
| 4.5 | B | `INSERT` with `owner_user_id = UUID_A` | **Rejected** (RLS or FK check failure) |
| 4.6 | A | Second `INSERT` same `client_request_id_a1` | **Unique violation** or app-level idempotent fetch — document which; must **not** create second row |
| 4.7 | A | `UPDATE` name; note `updated_at` | **Success**; if trigger present, `updated_at` increases |
| 4.8 | A or B | `DELETE` hive | **Permission denied** / no DELETE grant |
| 4.9 | — | Document | **`service_role` bypasses RLS** — must not ship to browser; Worker-only pattern at P1.4+ |

Record: hive `id`, timestamps, row counts, and error codes/messages (sanitized). No passwords in evidence.

### 6.2 Alternate path: SQL Editor JWT simulation

Only if the project’s Postgres honors Supabase JWT GUCs (verify on non-prod first). **One case per transaction**; do not mix users in one committed transaction.

```sql
-- Example pattern (replace UUID_A); run as a role that can SET config, then SET ROLE authenticated.
BEGIN;
SELECT set_config('request.jwt.claim.sub', '<UUID_A>', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
INSERT INTO hive3.hives (name, client_request_id)
VALUES ('P1.3 isolation test A', '<client_request_id_a1>');
COMMIT;
```

Repeat for B with `UUID_B` for SELECT/UPDATE/INSERT cases in §6.1 table. If `SET LOCAL ROLE authenticated` fails, use §6.1 client path only.

### 6.3 Cleanup (authorized)

Delete test rows using **service role** or superuser connection, or sign in as A and use an approved admin path. Do not delete non-test Hives. Record cleanup confirmation in evidence.

---

## 7. Reconciling manual deployment with migration history

**Goal:** Live table + git baseline + honest `schema_migrations` row, **without** destructive reset.

| Step | Action |
|------|--------|
| 1 | Save **pre-apply Q1** evidence. |
| 2 | Diff to §2; if FAIL, decide: authorized **apply** of `20261020120000_hive3_m1_hives_baseline.sql` vs new reviewed migration for unsafe drift. |
| 3 | **Apply** full migration file once on authorized project (CLI `supabase db push` / `migration up`, or SQL Editor paste of entire file). **Do not** run only fragments. |
| 4 | Run **post-apply Q1**, **Q2**, **Q3**, **Q5**, then **Q4**. |
| 5 | **Record migration version** `20261020120000` in `supabase_migrations.schema_migrations` **only after** step 3 succeeded and step 4 gates pass. |
| 6 | **Wrong:** `supabase migration repair --status applied` because the table pre-existed. **Right:** repair/mark applied tied to **executed** SQL + evidence. |
| 7 | **Idempotency check (Q8):** Re-run the same migration file on the same DB; expect no errors and no row loss. Save note in evidence. |

**Shared Supabase with V2:** After step 3, smoke-test V2 if required by release policy; V2 schemas must be unchanged.

---

## 8. Exact operator checklist (controlled execution)

Copy into the ticket run log; check boxes only with evidence attached.

- [ ] P1.2 accepted; P1.3 authorized for project `<name/id>`  
- [ ] Pre-apply Q1 saved  
- [ ] Pre-apply Q2/Q3/Q5 assertions reviewed (FAIL list empty or waived with written approval)  
- [ ] Migration `20261020120000_hive3_m1_hives_baseline.sql` applied (timestamp, operator)  
- [ ] Post-apply Q1 saved  
- [ ] Post-apply Q2/Q3/Q5 all PASS  
- [ ] Q4 two-user matrix PASS  
- [ ] Data API `hive3` exposure recorded: `exposed / not exposed`  
- [ ] Migration history row recorded correctly (not repair-only)  
- [ ] Optional: second apply idempotent (Q8)  
- [ ] Test data cleanup confirmed  

**Done when:** Post-apply Q2, Q3, Q5, and Q4 pass with saved evidence; owner-only access demonstrated for two authenticated users; reconciliation steps documented for the environment actually used.

---

## 9. Outstanding risks

| Risk | Mitigation |
|------|------------|
| Shared project contains real Hives | Apply is idempotent but NOT NULL/unique can block; Q1 row counts before apply |
| Browser uses `service_role` by mistake | Q4.9 + P1.4 code review; never commit service key to web |
| `hive3` exposed before Q4 | Q5 dashboard check; defer exposure |
| Policy drift without FORCE RLS | Q3 assertions |
| Account deletion CASCADE | OD-12 accepted; deleting `auth.users` removes Hives — document for ops; no deletion job in M1 |
| Break-glass locked out under FORCE RLS | Maintenance via `postgres` / dashboard superuser documented in P1.2 §5 |

---

## 10. Related artifacts

| Artifact | Path |
|----------|------|
| Q1 catalog SQL | `supabase/qualification/p1.3_q1_catalog_readonly.sql` |
| Q2 assertions | `supabase/qualification/p1.3_q2_structural_assertions_readonly.sql` |
| Q3 assertions | `supabase/qualification/p1.3_q3_rls_policy_assertions_readonly.sql` |
| Q5 assertions | `supabase/qualification/p1.3_q5_grants_assertions_readonly.sql` |
| Baseline migration | `supabase/migrations/20261020120000_hive3_m1_hives_baseline.sql` |
| P2.3 persisted pages (Gate 2b remainder) | `supabase/migrations/20261025150000_hive3_p23_document_pages.sql`, `supabase/qualification/p23_document_pages_assertions_readonly.sql` |
| P2.3 Gate 2c facts + verification RPCs | `supabase/migrations/20261025180000_hive3_p23_gate2c_facts.sql`, `supabase/qualification/p23_gate2c_facts_assertions_readonly.sql` |
| P2.3 acceptance (tier 1 / tier 2) | `docs/acceptance/P2.3-evidence-verification.md` |
| Adoption / rollback | `docs/HIVEFORYOU-V3-DATABASE-MIGRATION-P1.2.md` |
