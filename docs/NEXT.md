# Active ticket

**Phase / Ticket:** P1.4 — Reuse V2 Edge Function Architecture (Hive persistence)  
**Status:** IMPLEMENTED in repo — **BLOCKED** on Supabase apply + Edge Function deploy (2026-10-21)

**Objective:** Landing → Register/Login → My Hives → Create Hive → Hive workspace via `/api/v1/hives`, with Hive persistence through Supabase Edge Function `v1-hives` and public RPC wrappers (schema `hive3` stays off PostgREST).

**Evidence:** `apps/web/`, `supabase/functions/v1-hives/`, `supabase/migrations/20261021130000_hive3_m1_public_hive_rpc.sql`, `packages/contracts/src/hives/v1/`, `docs/acceptance/P1.4-first-user-flow.md`.

**V2 read-only finding:** Checked `hiveforyou-v2` — no `supabase/functions` in git; V2 uses session-scoped PostgREST on exposed schema **`hive`** (`supabase/config.toml`, `HiveGateway` in `app/src/lib/persistence/hive-gateway.ts`). V3 adaptation keeps the same session + RLS model but routes writes/reads through Edge Function + **`public.hive3_m1_*` RPC** so `hive3` need not be publicly exposed.

**Done when:** P1.3-authorized apply of RPC migration; deploy Edge Function `v1-hives`; auth redirect allow-list includes `NEXT_PUBLIC_APP_URL/auth/callback`; browser verification §10 passes with two confirmed users and saved evidence.

**Blocked on:** Operator applies `20261021130000_hive3_m1_public_hive_rpc.sql` and deploys `supabase/functions/v1-hives` (no `hive3` PostgREST exposure required). Deferred: formal P1.3 SQL Q1–Q5 scripts and migration history recording.

---

## P1.3 — Database Qualification (deferred execution)

**Status:** PROCEDURE_READY (2026-10-20); **execution deferred** while P1.4 application lands

**Objective:** Read-only Q1–Q3/Q5 + Q4 two-user matrix on authorized project (no apply in P1.4).

**Evidence:** `docs/HIVEFORYOU-V3-DATABASE-QUALIFICATION-P1.3.md`, `supabase/qualification/p1.3_q*.sql`.

**Re-run when:** After `hive3` REST exposure and operator authorization for non-production qualification apply.

---

## P1.2 — Database Schema and RLS Design (awaiting acceptance)

**Status:** READY_FOR_REVIEW (2026-10-20)

**Objective:** Preserve and reconcile the existing `hive3.hives` database schema in the V3 repository via reviewed SQL and adoption procedures (no execution in this ticket).

**Requirements authority:** `docs/PRODUCT-REQUIREMENTS.md` — interim working draft; Milestone 1 §3.1; MVP-wide §3.2 (OD-01–02, OD-04–07 approved 2026-10-20).

**Scope:** Version-controlled Milestone 1 migration for `hive3.hives`; adopt-not-drop reconciliation and clean-install procedures; P1.3 qualification checklist. Preserve reported live `hives.owner_user_id` **`ON DELETE CASCADE`** (OD-12). Document the 30-day account-deletion lifecycle and leave its job, tables, notification, recovery, cleanup, and audit to a future ticket. No Supabase apply, commits, or deployments under P1.2.

**Evidence:** `docs/HIVEFORYOU-V3-DATABASE-MIGRATION-P1.2.md`, `supabase/migrations/20261020120000_hive3_m1_hives_baseline.sql`.

**Done when:** User accepts the migration SQL and adoption doc. Q1 catalog and Q4 isolation remain **P1.3** gates before the database is qualified for P1.4.

**Next ticket after acceptance:** P1.3 — non-production apply, Q1–Q5 + Q4 two-user tests, migration history recorded only after verified apply.

---

## Schema provenance (do not collapse these)

| Layer | State on 2026-10-20 |
|---|---|
| Documented | `docs/HIVEFORYOU-V3-DATABASE-DESIGN-v0.1.md` remains **PROPOSED** |
| Reviewed SQL (P1.2) | `supabase/migrations/20261020120000_hive3_m1_hives_baseline.sql` — **READY_FOR_REVIEW**; not applied |
| Reported deployed | User: SQL Editor created `hive3.hives` with MD-01-shaped columns/constraints and owner-only SELECT, INSERT, UPDATE; RLS enabled and forced. Cross-user isolation not tested |
| Independently verified | None. Q1 catalog not yet saved in ticket evidence |

---

## P0.1 — Read-only discovery (Milestone 1 planning input)

**Recorded:** 2026-10-20  
**Nature:** Investigation only — **not** implementation authorization and **not** ticket closure.

### V2 frontend verification (read-only)

Cursor verified that V2 already implements the first authenticated customer slice needed for V3 bootstrap:

| Step | V2 capability | V3 intent |
|------|---------------|-----------|
| 1 | Landing / marketing entry | Port+trim to `apps/web`; brand per `reference/HiveForYou brand guide.pdf` |
| 2 | Register / Login | Supabase Auth (`auth.users`); session in Web only |
| 3 | My Hives | List Hives for signed-in user |
| 4 | Create Hive | Create workspace bound to owner |

**Implementation sequence (after P1 schema gates):** Landing → Register/Login → My Hives → Create Hive. **P0.3 closed** — see Closed: P0.3 below.

### Milestone 1 (product slice — decisions approved)

**Name:** Milestone 1 — Auth, Hive list, Create Hive  
**Status:** **DECISIONS APPROVED** (2026-10-20) — implementation still blocked on P1.2 SQL acceptance and P1.3 qualification  
**Not authorized:** No repo bootstrap (P1.4), migration **apply** (P1.3), or deployments. Reviewed P1.2 SQL is not a completed schema gate until P1.3 qualifies it.

**Approved Milestone 1 decisions (synchronized 2026-10-20):**

| ID | Summary | Authority |
|----|---------|-----------|
| MD-01 | `hives.description` (optional), `client_request_id` (required), `UNIQUE (owner_user_id, client_request_id)` | `PRODUCT-REQUIREMENTS.md` §3.1, DB design `hives` |
| MD-02 | No `canonical_studies` row at Hive create; first row on first successful study run | §3.1, DB design §3.5 |
| MD-03 | Post-create navigation → `/hives/[hiveId]` | §3.1, screen matrix |
| MD-04 | `/auth/callback` + PKCE; email confirmation per environment | §3.1 |
| MD-05 | Owner-only M1; no `hive_members` in M1 migrations | §3.1, DB design §6.1 |

**Approved MVP-wide decisions (P0.1 closure — 2026-10-20):**

| ID | Summary | Authority |
|----|---------|-----------|
| OD-01 | PDF, PNG, JPG, DOCX; configurable file size; Free **10 successful uploads/month UTC** (all Hives) | `PRODUCT-REQUIREMENTS.md` §3.2 |
| OD-02 | Shared `hive3` + private storage; ownership/RLS/server auth; no per-user DB; external processing requires approval | §3.2, §4, `ARCHITECTURE.md`, DB design §1 |
| OD-04 | Customer + pro reports: evidence-backed findings and provenance | §3.2, DB design `reports` |
| OD-05 | Configurable processing/resource limits; numeric defaults deferred (except OD-01 quota) | §3.2, §5 |
| OD-06 | No failed-run unverified merge; failed artifacts private under approved retention policy | §3.2, `ERROR-HANDLING-RECOVERY.md` §8 |
| OD-07 | Full Study = all eligible docs; targeted reprocess = explicit scope + coverage | §3.2, `ERROR-HANDLING-RECOVERY.md` §8, §11 |

**Approved during P1.2 (2026-10-20), not part of the P0.1 closure set:**

| ID | Summary | Authority |
|----|---------|-----------|
| OD-12 | Account deletion: notify, retain 30 days, allow recovery, then permanent storage and database cleanup plus a deletion audit. `hives.owner_user_id` stays `ON DELETE CASCADE`. Implementation is a future ticket; Milestone 1 adds no deletion tables or job | §4.1, `ARCHITECTURE.md`, DB design §3.6, P1.2 migration §1.1 |

**Route note (with screen matrix):** permanent `/case` → `/hives` redirect for V2 bookmarks.

| Layer | Scope |
|-------|--------|
| **UI (`apps/web`)** | V2-derived landing, auth flows, My Hives, Create Hive; Vercel-only |
| **Auth** | Supabase Auth; no credentials in Git; browser never calls Oracle/Reader/LiteLLM |
| **Data** | `hive3.hives` (owner → `auth.users`, `ON DELETE CASCADE`); **`hive_members` deferred** until MVP access/sharing decided (see database design §6.1). Account-deletion processing is OD-12, deferred |
| **API** | Web-facing routes: list/create Hive for authenticated owner; enqueue/status **out of scope** for Milestone 1 |
| **RLS** | Owner isolation on `hives`; user cannot read/write another user's Hive; service-role bypass only on Worker with server-side checks (pattern at P1.4/P1.5). Live policies not catalog-verified until P1.3 Q1 |
| **Storage** | No document upload in Milestone 1 |

**Prerequisite tickets:**

| Ticket | Role for Milestone 1 |
|--------|----------------------|
| **P0.1** | **VERIFIED** |
| **P0.2** | **VERIFIED** |
| **P0.3** | **VERIFIED** |
| **Database-first plan** | **APPROVED** (2026-10-20) |
| **P1.1** | **ACCEPTED** (2026-10-20) — inventory closed for progression |
| **P1.2** | Reviewed SQL/RLS + adopt plan — **READY_FOR_REVIEW** (acceptance gate) |
| **P1.3** | Qualification procedure — **PROCEDURE_READY** (active); execution not started |
| **P1.4** | Repository/app bootstrap — not started |
| **P1.5** | Full UI → Inngest → Worker path — **after** Milestone 1 shell; not part of Milestone 1 |

### Authority documents

| Document | Repo state | Role |
|----------|------------|------|
| `docs/PRODUCT-REQUIREMENTS.md` | Interim working draft; M1 §3.1 + MVP §3.2 approved | Requirements |
| `docs/CURSOR-DEVELOPMENT-STANDARDS.md` | In repo (2026-10-20) | Agent standards |
| `docs/PROJECT-SOURCES.md` | In repo (2026-10-20) | Source index |
| `reference/HiveForYou brand guide.pdf` | In repo (2026-10-20) | Brand |
| `docs/HIVEFORYOU-V3-DEVELOPMENT-PLAN-database-first-PROPOSED.md` | **APPROVED** v0.1 (filename retained) | Governing sequence |
| `docs/HIVEFORYOU-V3-DATABASE-DESIGN-v0.1.md` | PROPOSED (v0.1) | Table design, not executable SQL |
| `docs/HIVEFORYOU-V3-DATABASE-INVENTORY-P1.1.md` | ACCEPTED (P1.1) | P1.1 ERD, inventory, drift, qualification |
| `docs/HIVEFORYOU-V3-DATABASE-MIGRATION-P1.2.md` | READY_FOR_REVIEW | Adoption, rollback, P1.3 checklist |

`docs/DEVELOPMENT-PLAN.md` is the status index. Detailed gates live in the approved database-first plan.

### Pending decisions (record — do not silently resolve)

**P0.1 MVP-blocking items:** **none** — OD-01–02, OD-04–07 approved 2026-10-20.

**Non-blocking ambiguity (see `PRODUCT-REQUIREMENTS.md` §6.1):** failed-run artifact retention duration (OD-06, DB §6.5), document-level delete vs physical cleanup, numeric size/concurrency/spend caps (OD-05 implementation), professional sharing beyond M1, exact “eligible document” rules for full Study. Account deletion policy is **OD-12** (approved; processing deferred).

**Database design open items:** see inventory §9. Proposed corrections PC-02, PC-03, PC-08 remain **not** in the P1.2 baseline unless accepted before P1.3.

**Implementation-time (not P0 blockers; owned by P1.3/P1.5+):** concurrent runs per Hive; service-to-service auth; numeric timeouts/retries — see P0.2 deferred table below.

### Sequencing notes

1. **One P1 definition.** Governing order is P1.1 (inventory) → P1.2 (SQL/RLS review) → P1.3 (qualification) → P1.4 (bootstrap) → P1.5 (integration). Old connectivity-first IDs are historical in the plan §4.1.  
2. **Milestone 1 vs P1.5:** Milestone 1 is a narrow UI + Hive create/list slice on a qualified schema. End-to-end processing remains P1.5 and later phases.  
3. **Live `hive3.hives`:** Adopt via P1.2 migration file; do not drop or recreate to match design. Migration history is recorded only after P1.3 verified apply (not because the table pre-existed).  
4. **P1.4 bootstrap and P1.3 apply remain unauthorized** until P1.2 is accepted and P1.3 is explicitly authorized.

### Next eligible ticket (after current work)

| Order | Ticket | Why eligible / blocker |
|-------|--------|-------------------------|
| **Now (active)** | **P1.3** | Procedure ready; awaits P1.2 acceptance + execution authorization |
| **After P1.2 acceptance + P1.3 authorization** | **P1.3 execute** | Apply SQL, Q1–Q5, Q4 isolation |
| **After P1.3 qualification** | **P1.4** | Web bootstrap against qualified schema |

---

## Closed: Database-first plan approval

**Status:** APPROVED (2026-10-20)

**Evidence:** `docs/HIVEFORYOU-V3-DEVELOPMENT-PLAN-database-first-PROPOSED.md` status header and §4; `docs/DEVELOPMENT-PLAN.md` status index. Filename retained. Superseded P1 IDs kept in plan §4.1.

**Approval:** User-directed in the P1.1 session (2026-10-20). Sequencing only — no migrations, application code, or deployments.

---

## Closed: P1.1 — Database Schema Inventory

**Status:** ACCEPTED (2026-10-20)

**Evidence:** `docs/HIVEFORYOU-V3-DATABASE-INVENTORY-P1.1.md`.

**Acceptance:** Inventory accepted for progression to P1.2. Acceptance is not approval of proposed corrections PC-01–PC-12 as a bundle; P1.2 baseline reflects PC-01, PC-04, PC-05, and PC-12. PC-06 is revised: the baseline keeps `ON DELETE CASCADE` (OD-12). The inventory sentence that proposed `ON DELETE RESTRICT` is historical.

---

## Closed: P0.1 — Approve prioritized requirements

**Status:** VERIFIED (2026-10-20)

**Evidence:** `docs/PRODUCT-REQUIREMENTS.md` §3.1 (MD-01–05), §3.2 (OD-01–02, OD-04–07), §4–§6 decision log; `docs/ARCHITECTURE.md` tenancy/intake/outputs; `docs/HIVEFORYOU-V3-DATABASE-DESIGN-v0.1.md` OD-01–02, OD-06–07; `docs/ERROR-HANDLING-RECOVERY.md` §8, §11 (OD-06, OD-07).

**Acceptance:** MVP-blocking §6 items approved or explicitly deferred; no per-user schemas/databases; only approved numeric product default is Free **10 successful uploads/month UTC** (OD-01).

**Remaining non-blockers:** §6.1 ambiguities (OD-06 artifact retention duration, document-level cleanup, implementation numeric caps, eligible-document edge cases, post-M1 sharing). Account deletion is OD-12 (approved 2026-10-20; implementation deferred).

**Approval:** User-directed P0.1 closure in Agent session (2026-10-20). No application code, migrations, or deployments under this ticket.

---

## Closed: P0.3 — V2 reuse inventory

**Status:** VERIFIED (2026-10-20)

**Evidence:** `docs/HIVEFORYOU-V3-V2-REUSE-INVENTORY.md` (Milestone 1 tags), `docs/HIVEFORYOU-V3-SCREEN-ADOPTION-MATRIX-PROPOSED.md`, `reference/prototype/` (HTML + README from V2 `design-reference/claude-prototype/`).

**Approval:** User-directed P0.3 closure in Agent session (2026-10-20). No application code, migrations, or deployments under this ticket.

---

## Closed: P0.2 — Error Handling & Recovery Contract

**Status:** VERIFIED (2026-10-20)

**Evidence:** `docs/ERROR-HANDLING-RECOVERY.md` (approved), `docs/adr/ADR-001-error-handling-recovery.md` (accepted), `docs/ARCHITECTURE.md` (error-handling section), `packages/contracts` (`error-envelope@1`), database design idempotency note, Cursor rules.

**Verification (2026-10-20):** `npm run typecheck` in `packages/contracts` — exit 0.

**Deferred to implementation tickets (not blocking further design):**

| Topic | Decide at implementation | Tracked in |
|-------|--------------------------|------------|
| LiteLLM alias configuration and ownership | Gateway config + role wiring | P2.1, P5.3 |
| Worker–Reader HTTP contract shapes | Versioned internal API in `packages/contracts` | P2.1, P1.5 |
| Service-to-service authentication | Oracle/Vercel secret patterns | P1.4, P1.5, P5.3 |
| Numeric Inngest retries, HTTP/model timeouts | Measured defaults in integration | P1.5, P5.3 |
| Concurrent runs per Hive | Allow vs reject vs queue | P1.3, P1.5 |
| Account deletion processing (OD-12) | Notification, 30-day retention, recovery, permanent storage and database cleanup, deletion audit, partial-failure retries, terminal states | Future dedicated ticket. Milestone 1 keeps `ON DELETE CASCADE` only |

**Parking lot:** proactive intent suggestions/local intelligence; domain knowledge learning; cross-Hive intelligence; expanded pack governance; additional processing modes. OD-06 failed-run artifact **duration** remains open. Account-deletion **processing** is the OD-12 future ticket above.
