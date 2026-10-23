# Active ticket

**Phase / Ticket:** **Five-Feature Release — Deployment** (operator runbook)  
**Status:** **ACTIVE (runbook ready — await explicit commit/push/deploy/SQL authorization)** (2026-10-22)

**Release bundle (repo — not live until operator steps below):**

| # | Feature | Repo state | Live gate |
|---|---------|------------|-----------|
| 1 | **P1.P Gate 1** — processing persistence | Migrations + Worker client | `docs/acceptance/P1.P-gate1-processing-persistence.md` (6 scenarios) |
| 2 | **P1.P Gate 2** — planning artifacts | Contracts + Worker persistence | `docs/acceptance/P1.P-gate2-planning-artifacts.md` (8 scenarios) |
| 3 | **P1.5-processing** — UI → Inngest → Worker → Reader | Web + Inngest + Worker HTTP | `docs/acceptance/P1.5-processing-ui-oracle.md` |
| 4 | **P2.1** — Reader page-grounded read | `apps/reader` | `docs/acceptance/P2.1-reader-document-read.md` (integrated after #3) |
| 5 | **P2.2** — domain-aware structured extraction | Worker + Reader extract | `docs/acceptance/P2.2-structured-extraction.md` (integrated after #3) |

**Operator sequence (existing mechanisms only — no new infra):**

1. **Supabase SQL (authorized apply only):** M1 through `20261021200000`, then Gate 1 (`20261022100000`, `20261022203000`), P1.5 submit (`20261022210000`), optional P2.2-DP.I stage (`20261022220000` when question planning + UI summary enabled). Run readonly qualification scripts under `supabase/qualification/`.
2. **Supabase Edge:** GitHub Actions **`Deploy Supabase Edge Functions`** (`workflow_dispatch`) or `scripts/deploy-supabase-edge.ps1` — deploy `v1-documents` + `v1-hives`; secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`; function secrets unchanged (`SUPABASE_URL`, anon + service role).
3. **Vercel:** Push **`main`** to GitHub (triggers production deploy of `apps/web`); confirm env vars in § missing configuration below; Inngest sync picks up `/api/inngest`.
4. **Oracle Worker / Reader:** Pull release SHA on Oracle host; `npm ci` + `npm run start` in `apps/worker`; `pip install -e .` + `uvicorn hive_reader.main:app` in `apps/reader`; env from `infra/oracle/*.config.env.example` (no deploy script in repo — operator unit/restart as on host).
5. **LiteLLM:** Configure **`WORKER_P2_REASONING_LITELLM_ALIAS`** / **`READER_P2_REASONING_LITELLM_ALIAS`** (and OCR alias if used) on existing Oracle gateway — P5.3; missing alias fails closed.

**Repo verification (2026-10-22, local):** `apps/web` typecheck + build OK; vitest **86/86**; `apps/worker` typecheck OK; vitest **51 passed** (1 integration skipped); `packages/contracts` + `packages/core` typecheck OK; Reader pytest **21 passed, 2 skipped**.

**Parked (not this ticket):** P2.2-DP.I full integrated qualification (`IEP-PACK-QUALIFICATION.md` §12) beyond optional `plan_questions` migration/code already in tree.

---

## Parked — P2.2-DP.I (implementation)

**Phase / Ticket:** P2.2-DP.I — generic pack `@3` loader + unified question planning runtime  
**Status:** **PARKED — partial repo work; await explicit implementation approval after deployment ticket** (2026-10-22)

**Objective:** Implement `plan_questions` and study-plan compile on the existing P1.5-processing Worker path: load/validate the IEP **`domain-pack-manifest@3`** candidate, decompose uploader intent via **one bounded Oracle LiteLLM** structured call, deterministically match/deduplicate/union questions, emit a bounded **`study-plan@1`**, persist **`study-question-set@1`**, **`study-plan@1`**, and initial **`study-question-coverage@1`** through **P1.P Gate 2** helpers, preserve the **pack-free** dynamic path, and expose **safe intermediate planning results** in the web UI — **without** Canonical Study merge, evidence verification, investigation execution, or Writer.

**Prerequisites (repo — satisfied for planning start):**

| Prerequisite | State |
|--------------|--------|
| **P2.2-DP.D** | **CLOSED (design)** — `UNIFIED-QUESTION-PLANNING.md`, `iep-manifest@2.CANDIDATE.json` (`@3`, Q01–Q04, two views) |
| **P1.P Gate 2** | **IMPLEMENTED (repo) — live acceptance deferred** — contracts + Worker persistence on Gate 1 artifacts |
| **P2.2 local path** | **ACCEPTED (repo)** — classify / schema / extract (no verified promotion) |
| **P1.5-processing** | **IMPLEMENTED (repo) — live acceptance deferred** — submit → Inngest → Worker HTTP → Reader |

**Explicitly not P2.2-DP.I (this ticket):**

- **P1.P Gate 3** — `canonical_studies` / `study_revisions` pointer and merge transactions.
- **P2.3** — evidence verification / promotion of Reader candidates.
- **P3.I** — investigation operator execution and finding reuse against accepted revisions.
- **P4 / Writer** — audience reports and narrative synthesis.
- **`extraction_batches` / evidence disposition tables** — separate database-first batch (not required for minimal planner + Gate 2 artifact writes).

**Minimal implementation scope (after approval — ordered):**

| Step | Layer | Deliverable |
|------|--------|-------------|
| 1 | **`packages/contracts`** | `domain-pack-manifest@3` types + parse/validate (views/outcomes, canonical Q01–Q04, investigation refs); extend only where design gaps block typing. |
| 2 | **`packages/core`** | Equivalence feature validation, `run_key` hashing, catalog ref integrity, budget defaults parser (`UNIFIED-QUESTION-PLANNING.md` §4–§5, §7). |
| 3 | **`apps/worker` packs** | Load candidate from `docs/design/p2.2-dp.d/iep-manifest@2.CANDIDATE.json` (dev) and/or pinned `domain-packs/` once reviewed; **reject `@3` until parser exists**; keep `@1`/`@2` loaders unchanged. |
| 4 | **`apps/worker` plan** | `plan_questions` stage: private intent hash only in artifacts; **one** LiteLLM structured decomposition + catalog **proposals**; deterministic selection, merge/split, dedup log; freeze **`study-question-set@1`**. |
| 5 | **`apps/worker` plan** | Post-`load_sources`/classify: prerequisite reevaluation **without** mutating merged questions; compile **`study-plan@1`** (reuse scan stub acceptable until P3.I); initial **`study-question-coverage@1`** (`NOT_ASSESSED` / `NOT_EVALUATED`). |
| 6 | **`apps/worker` persistence** | Wire `putStudy*Artifact` / `getStudy*Artifact` into `process-study-run.ts` at `StudyRunStage` boundaries; fail closed on model/validation errors per `error-envelope@1`. |
| 7 | **Pack-free path** | Empty catalog branch: same contracts, dynamic merged questions only (grocery qualification §12.8). |
| 8 | **`apps/web`** | Extend `HiveProcessingPanel` (or scoped child) to show stage, merged-question **counts/labels** (no verbatim intent, no private catalog), plan budget outcome — via existing safe study-run API fields or new owner-scoped projection **without** service-role in browser. |
| 9 | **Tests** | Unit: `@3` loader, equivalence, compile, persistence wiring (mocked LiteLLM + RPC). Target **IEP-PACK-QUALIFICATION.md** §12 rows as Worker tests where mockable; integrated §12 proof waits on **P1.5-processing live** + optional P2.3. |
| 10 | **Release hygiene (parallel, scoped)** | Restore **`apps/worker` `npm run typecheck`** (38 errors, 2026-10-22): isolate or fix `plan-p2.test.ts` v1/v2 union, `l001-classification.test.ts` cross-rootDir import, `packages/core` `pack-catalog.ts` / `field-guidance.ts` — **does not block plan approval** but blocks claiming Worker green. |

**Acceptance criteria (P2.2-DP.I repo closure — not live product):**

- `@3` candidate validates; invalid/dangling refs fail closed at load.
- Pack-pinned run produces frozen question set with Q01–Q04 selection rules (Q04 relevance-only); pack-free run uses same planner without catalog ids.
- All three Gate 2 artifacts persist at revision 1 with lineage hashes; no verbatim intent in artifact JSON.
- `process-study-run` reaches planning stages without breaking existing P1.5 extraction path when planning is feature-flagged or ordered before classify per design §3.
- UI shows safe intermediate planning summary for an authorized owner run.
- **Mandatory release blockers (unchanged):** all **eight** Gate 2 live scenarios, all **six** Gate 1 live scenarios, **P1.5-processing** live rows — unit tests do not substitute.

**Blocked on (live / integrated proof, not repo planning):**

- Operator SQL apply (Gate 1 + P1.5 submit), Worker/Inngest/Vercel deploy, **`WORKER_*` / `READER_*` LiteLLM aliases** (P5.3) for non-mocked decomposition.
- **P2.3** before any verified-fact or “supported answer” claims beyond planning placeholders.
- **Five-feature release target** — Gate 1 + Gate 2 + P1.5-processing live gates remain mandatory; P2.2-DP.I integrated qualification adds **IEP-PACK-QUALIFICATION.md** §12 when orchestration is live.

**Authority:** `docs/design/p2.2-dp.d/UNIFIED-QUESTION-PLANNING.md`, `IEP-DOMAIN-INTELLIGENCE-PACK-SPEC.md`, `docs/acceptance/P1.P-gate2-planning-artifacts.md`, `docs/CURSOR-DEVELOPMENT-STANDARDS.md`.

---

## Closed — P1.P Gate 2 (2026-10-22)

### P1.P Gate 2 — Planning artifact persistence

**Status:** **IMPLEMENTED (repo) — LIVE ACCEPTANCE DEFERRED** (2026-10-22)

**Objective (met in repo):** Persist **`study-question-set@1`**, **`study-plan@1`**, and **`study-question-coverage@1`** on **`hive3.study_run_artifacts`** (Gate 1 Worker RPCs), with version/hash validation, idempotent retry/reload, private intent isolation, and tenant-safe Worker access — **without** a new artifact table, Canonical Study merge, or P2.2-DP.I planner runtime.

| Area | Evidence |
|------|----------|
| Contracts + validation | `packages/contracts/src/study-runs/v1/planning-artifacts.ts` |
| Worker persistence | `apps/worker/src/persistence/planning-artifacts.ts`, shared `artifact-idempotent-put.ts` |
| Unit tests | `apps/worker/src/persistence/planning-artifacts.test.ts` (**9** cases) |
| Readonly qualification | `supabase/qualification/p1p_gate2_planning_artifact_assertions_readonly.sql` |
| Acceptance scenarios | `docs/acceptance/P1.P-gate2-planning-artifacts.md` (**8** live rows — **release blockers**) |

**Mandatory integrated-release gates (unchanged — carry forward):** Gate 2 live scenarios **plus** all Gate 1 live scenarios. Unit tests do not substitute.

**Does not close:** P1.P Gate 3, P2.2-DP.I runtime, P2.3 integrated verification, L001 product qualification.

---

## Closed — P1.5-processing (2026-10-22)

### P1.5-processing — UI → Inngest → Oracle Worker → Reader → Supabase

**Status:** **IMPLEMENTED (repo) — LIVE ACCEPTANCE DEFERRED** — SQL apply, Vercel/Inngest/Oracle deploy, and browser proof not claimed without operator authorization.

**Objective (met in repo):** One processing path from authorized web submit through Inngest to Oracle Worker HTTP orchestration, durable `study_runs` stage/status, Gate 1 artifact writes for P1.5 run artifacts, and Reader calls on the existing P2.2 planning path.

| Area | Evidence |
|------|----------|
| Submit SQL + readonly assertions | `supabase/migrations/20261022210000_hive3_p15_processing_submit.sql`, `supabase/qualification/p1.5_processing_submit_assertions_readonly.sql` |
| Web APIs + Inngest | `apps/web/src/app/api/v1/hives/[hiveId]/study-runs/`, `apps/web/src/inngest/functions/process-study-run.ts` |
| Worker HTTP + orchestration | `apps/worker/src/http/`, `apps/worker/src/orchestration/process-study-run.ts` |
| UI | `apps/web/src/components/workspace/HiveProcessingPanel.tsx` |
| Contracts | `packages/contracts/src/study-runs/v1/orchestration.ts` |
| Worker unit tests | **10 passed** — persistence (8) + `process-study-run.test.ts` (2); integration skipped without env |

**Mandatory integrated-release gates (unchanged — carry forward):** Rows in `docs/acceptance/P1.5-processing-ui-oracle.md` (apply migrations, configure Inngest/Worker, browser submit, idempotency, failure recovery) **plus** all Gate 1 live scenarios. Unit/orchestration tests do not substitute.

**Worker typecheck note (2026-10-22):** `npm run typecheck` in `apps/worker` **fails** (~40 errors). Failures are in **P2.2-DP / pack v2** tests and `packages/core` (`plan-p2.test.ts`, untracked `l001-classification.test.ts`, `field-guidance.ts`) — **not** in `src/orchestration/*`. Treat as **pre-existing / parallel WIP** release hygiene; **not** introduced by orchestration unit tests (which pass). Fixing typecheck is out of Gate 2 scope unless explicitly ticketed.

**Does not close:** P1.P Gate 2/3, P2.2-DP.I, P2.3 integrated verification, L001 product qualification.

---

## Closed — P1.P Gate 1 (2026-10-22)

### P1.P Gate 1 — Processing persistence (run identity foundation)

**Status:** **IMPLEMENTED (repo) — LIVE ACCEPTANCE DEFERRED** — **not** fully qualified; **not** production/release accepted until live scenarios pass after operator SQL apply.

**Objective (met in repo):** Durable private intent storage, `study_runs` identity with stage/status, correlation IDs, delivery-scoped idempotency, processing-stage tracking, and one reusable run-scoped versioned artifact mechanism (no parallel persistence stack).

**Repo completion recorded:**

| Area | Evidence |
|------|----------|
| Schema + RPCs | `supabase/migrations/20261022100000_hive3_p1p_gate1_processing_persistence.sql` |
| Worker RPC EXECUTE hardening | `supabase/migrations/20261022203000_hive3_p1p_gate1_worker_rpc_execute_revoke.sql` |
| Structural / RLS / privilege assertions | `supabase/qualification/p1p_gate1_processing_persistence_assertions_readonly.sql` (tables, idempotency index, artifact immutability constraint, RLS forced, `authenticated` denied direct artifact SELECT, Worker RPCs **service_role** only) |
| Worker persistence client | `apps/worker/src/persistence/` |
| Contracts | `packages/contracts/src/study-runs/v1/` |
| Worker unit tests | **8 passed** in `study-run-persistence.test.ts` (4) + `persistence-sql-errors.test.ts` (4); optional integration file `gate1-persistence.integration.test.ts` skipped without env |

**Mandatory integrated-release gates (unchanged — carry forward):** All six live persistence scenarios in `docs/acceptance/P1.P-gate1-processing-persistence.md` (intent privacy, durable enqueue, immutable artifact reload, idempotent retry, explicit failure diagnostics, cross-Hive denial) plus documented negative cases (idempotency cross-Hive, artifact hash conflict, hive binding, cross-owner read). **Passing unit tests and readonly qualification SQL do not substitute for these scenarios.**

**Operator:** Apply Gate 1 migrations (and corrective revoke migration when needed) only with separate authorization; redeploy not required for SQL-only Gate 1 unless Edge/worker callers change.

**Does not close:** P1.5-processing, P1.P Gate 2/3, P2.2-DP.I, P2.3 integrated verification, or end-to-end L001.

---

## Closed — design and repo pack work (2026-10-22)

### P2.2-DP.D — Universal Domain Pack + IEP + Unified Question Planning (design)

**Status:** **CLOSED (design)** — documentation and persistence assessment only; **not** runtime, **not** P2.2-DP.I.

**Evidence:** `docs/design/p2.2-dp.d/IEP-DOMAIN-INTELLIGENCE-PACK-SPEC.md`, `IEP-PACK-QUALIFICATION.md`, `UNIFIED-QUESTION-PLANNING.md`, `iep-manifest@2.CANDIDATE.json` (`implementation_status`: **`CANDIDATE_NOT_IMPLEMENTED`**, `domain-pack-manifest@3`, four questions Q01–Q04, two views).

**Done when:** Design artifacts reviewed; dependencies synchronized in development plan; active ticket advanced — **met**.

### P2.2-DP — Universal Domain Pack refinement (repo)

**Status:** **IMPLEMENTED (repo)** — `domain-pack-manifest@2`, IEP pack `2.0.0` (V2 `0.3.0-proposed` port), reviewed-only catalog selection, L001 classification fixtures, public metadata projection for web pills.

**Evidence:** `packages/contracts/src/domain-packs/v2/`, `domain-packs/iep/2.0.0/`, `domain-packs/medicaid/1.0.0/`, `packages/core/` pack catalog + match scoring, `apps/worker/src/packs/`, `experiments/pack-driven-reader-l001/src/corpus.ts`, `docs/acceptance/P2.2-DP-domain-pack-refinement.md`.

**Note:** Distinct from P2.2-DP.D candidate `@3` and from **P2.2-DP.I** runtime planning. Operator may regenerate `apps/web/src/lib/domain-packs/public-metadata.generated.json` when packs change (`node scripts/generate-domain-pack-public-metadata.mjs`).

---

## Pending (approved sequence — not active)

| Ticket | Status | Blocked on |
|--------|--------|------------|
| **P2.2-DP.I** | **ACTIVE** (plan only) | Explicit implementation approval (prerequisites in repo) |
| **P1.P Gate 3** | NOT_STARTED | Gate 2 repo; Canonical Study revision pointer |
| **P1.P Gate 2** | **IMPLEMENTED (repo) — live acceptance deferred** | Operator apply + eight live scenarios |
| **P2.3** | ON HOLD | P2.2-DP repo acceptance; integrated path needs **P1.5-processing** |
| **P3** (study / investigations) | NOT_STARTED | P2.3 + P1.P Gate 3 + P2.2-DP.I as scoped |

---

## P2.3 — Evidence verification (investigation)

**Status:** **ON HOLD** — resumes after P2.2-DP local acceptance (2026-10-22)

**Objective:** Reject invalid source/page/quote anchors; retain explicit unknowns; verified records carry traceable evidence per governing plan. Builds on P2.2 `reader-candidate-extraction@1` output without promoting untrusted candidate text.

**Evidence (starting points):** `docs/HIVEFORYOU-V3-DEVELOPMENT-PLAN-database-first-PROPOSED.md` (P2.3 row), `docs/acceptance/P2.2-structured-extraction.md` (deferred integration), `packages/contracts` error/study-run stages, Worker verification boundaries in `docs/ERROR-HANDLING-RECOVERY.md`.

**Done when:** Investigation note or scoped implementation plan is reviewed; integrated study-run verification waits on P1.5-processing.

**Blocked on:** P1.5-processing (Inngest + Worker HTTP orchestration), processing SQL migrations applied in target env, optional `document_pages` persistence; live LiteLLM reasoning alias (P5.3) for non-mocked paths.

---

## P2.2 — Domain-aware structured extraction

**Status:** **ACCEPTED (local, repo)** — committed; Worker/Core/contracts green; Reader P2.1+P2.2 **21 passed, 2 skipped** (LibreOffice not on host — see acceptance doc); integrated acceptance **deferred** (2026-10-22)

**Objective:** One domain-agnostic path: deterministic pack match, LiteLLM classification when that match is inconclusive, dynamic `extraction-schema@1` for partial and generic matches (exact structures may add intent-specific fields), then `reader-candidate-extraction@1` with page/quote anchors and reusable source facts. No hardcoded generic field templates.

**Evidence:** `packages/contracts/src/extraction/v1/`, `packages/contracts/src/domain-packs/v1/`, `domain-packs/iep/1.0.0/`, `packages/core/`, `apps/worker/src/plan/`, `apps/reader/` extract route, `docs/acceptance/P2.2-structured-extraction.md`, `infra/oracle/worker.config.env.example`.

**Done when:** Contract typecheck and Reader/Worker/Core targeted tests pass; P2.1 read route unchanged; no verified-fact promotion (P2.3). Storage-backed and Inngest orchestration wait for P1.5-processing.

**Blocked on:** P1.5-processing (Inngest + Worker HTTP orchestration), Gate 1 SQL applied in integration environment, production `READER_P2_REASONING_LITELLM_ALIAS` / `WORKER_P2_REASONING_LITELLM_ALIAS`, optional `document_pages` persistence.

---

## P2.1 — Extraction Reader (page-grounded read)

**Status:** **IMPLEMENTED (repo)** — local pytest **16/16** (with LibreOffice 7.6.7.2) + contracts typecheck; service auth uses `error-envelope@1`; Worker/storage integration still blocked on P1.5-processing (2026-10-22)

**Objective:** Oracle Python Reader with `reader-document-read@1`: native PDF, selective local/LiteLLM OCR, images, reproducible DOCX; per-page quality and source hash fidelity; read route still rejects non-null `extraction_schema` (use `POST /v1/extract-candidates` for P2.2).

**Evidence:** `packages/contracts/src/reader/v1/`, `apps/reader/`, `docs/acceptance/P2.1-reader-document-read.md`, `infra/oracle/reader.config.env.example`.

**Done when:** Local tests pass; Worker HTTP caller and storage-backed acceptance run after P1.5-processing; P2.4 L001 qualification not part of P2.1.

**Blocked on:** P1.5-processing (Inngest + Worker), production service auth, `READER_OCR_LITELLM_ALIAS`, optional `document_pages` migration.

---

## P1.7-B — Pre-study document delete and replace

**Status:** **IMPLEMENTED (repo)** — user accepted; operator may still owe Supabase apply of `20261021200000_hive3_m1_document_delete_replace_study_lock.sql` + redeploy Edge `v1-documents` + web deploy; live acceptance rows 26–36 in `docs/acceptance/P1.7-document-workspace-hive-delete.md` (2026-10-21)

**Objective:** Owner delete/replace for registered sources before study lock; begin/finalize deletion with `deleting_at`; replacement via new row/path without extra quota; `study_locked_at` + study enqueue contract RPCs (no study-run tables in M1).

**Evidence:** `supabase/migrations/20261021200000_hive3_m1_document_delete_replace_study_lock.sql`, `supabase/qualification/p1.7_b_document_delete_replace_assertions_readonly.sql`, `supabase/functions/v1-documents/index.ts`, `apps/web/src/components/workspace/HiveDocumentsPanel.tsx`, `DeleteDocumentModal.tsx`, `POST .../documents/delete`.

**Done when:** After SQL + Edge + web deploy, acceptance rows 26–36 pass; P1.7 upload recovery (rows 19–25) and card summary (13–18) unchanged.

**Blocked on:** Operator applies P1.7-B SQL after `20261021190000`; redeploy `v1-documents`; deploy web app.

---

## P1.7 — Upload count and failed attempt recovery

**Status:** **IMPLEMENTED (repo)** — blocked on Supabase apply of `20261021190000_hive3_m1_upload_prepare_quota_dismiss.sql` + redeploy Edge `v1-documents` + web deploy; live acceptance rows 19–25 in `docs/acceptance/P1.7-document-workspace-hive-delete.md` (2026-10-21)

**Objective:** Document workspace counts only registered uploads; failed attempts listed separately with dismiss (storage cleanup first); new upload prepare blocked when monthly quota is exhausted (registration-time check unchanged).

**Evidence:** `supabase/migrations/20261021190000_hive3_m1_upload_prepare_quota_dismiss.sql`, `supabase/qualification/p1.7_upload_count_recovery_assertions_readonly.sql`, `supabase/functions/v1-documents/index.ts`, `apps/web/src/components/workspace/HiveDocumentsPanel.tsx`, `apps/web/src/lib/documents/document-workspace-lists.ts`.

**Done when:** After SQL + Edge + web deploy, acceptance rows 19–25 pass; P1.7-A card summary (rows 13–18) remains as previously specified.

**Blocked on:** Operator applies P1.7 recovery SQL after P1.7-A `20261021180000`; redeploy `v1-documents`; deploy web app.

---

## P1.7-A — My Hives card summary and Delete Hive from cards

**Status:** **IMPLEMENTED (repo)** — blocked on Supabase apply of `20261021180000_hive3_m1_hive_card_summary.sql` + web deploy; live acceptance per `docs/acceptance/P1.7-document-workspace-hive-delete.md` (2026-10-21)

**Objective:** My Hives cards show persisted document count and filename preview (one list RPC), domain placeholder **Not identified yet.**, and **Open Hive** / **Delete Hive** actions reusing the existing typed `delete` modal and Edge deletion flow.

**Evidence:** `supabase/migrations/20261021180000_hive3_m1_hive_card_summary.sql`, `supabase/qualification/p1.7_a_hive_card_summary_assertions_readonly.sql`, `apps/web/src/components/hives/HiveCardGrid.tsx`, `HiveCardMenu.tsx`, `apps/web/src/lib/hives/hive-card-summary.ts`, `packages/contracts/src/hives/v1/types.ts`.

**Done when:** After SQL + web deploy, acceptance rows 13–18 in P1.7 doc pass; P1.7 base deletion (rows 5–12) remains as previously verified at commit `52cb061` where applicable.

**Blocked on:** Operator applies P1.7-A SQL (after P1.7 `20261021170000`); deploy web app. No Edge Function redeploy required for list field passthrough.

---

## P1.7 — Document workspace UX and permanent Hive deletion

**Status:** **IMPLEMENTED (repo)** — P1.7 SQL applied per operator; Edge `v1-hives` deployed at commit `52cb061`; web + live acceptance pending (2026-10-21)

**Objective:** Prototype-aligned Documents tab (upload-only states) and owner-initiated permanent Hive deletion with typed `delete` confirmation, storage cleanup, and restricted database finalize.

**Evidence:** `supabase/migrations/20261021170000_hive3_m1_hive_deletion_document_workspace.sql`, `supabase/functions/v1-hives/`, `supabase/functions/_shared/hive-source-storage.ts`, `apps/web/src/components/workspace/`, `docs/acceptance/P1.7-document-workspace-hive-delete.md`.

---

## P1.6 — Database-backed upload policy

**Status:** **IMPLEMENTED (repo)** — blocked on Supabase apply of `20261021160000_hive3_m1_upload_product_policy.sql` + redeploy Edge Function `v1-documents`; live acceptance per `docs/acceptance/P1.6-upload-product-policy.md` (2026-10-21)

**Evidence:** `supabase/migrations/20261021160000_hive3_m1_upload_product_policy.sql`, `supabase/qualification/p1.6_upload_policy_assertions_readonly.sql`, `packages/contracts/src/documents/v1/types.ts`, `apps/web/src/lib/documents/upload-policy.ts`, `docs/acceptance/P1.6-upload-product-policy.md`.

**Done when:** Policy changes in Supabase affect enforcement and UI without app redeploy; P1.5 upload flow intact; payments remain disabled.

**Blocked on:** Operator applies P1.6 SQL after P1.5 upload migrations; redeploy `v1-documents`.

---

## P1.5 — Complete reusable document upload

**Status:** **IMPLEMENTED (repo)** — blocked on Supabase apply of upload migrations + deploy Edge Function `v1-documents`; live browser acceptance pending (2026-10-21)

**Evidence:** `supabase/migrations/20261021150000_hive3_m1_upload_baseline.sql`, `supabase/migrations/20261021150100_hive3_m1_public_document_rpc.sql`, `supabase/functions/v1-documents/`, `docs/acceptance/P1.5-document-upload.md`.

**Deferred (unchanged):** UI → Inngest → Oracle Worker processing path (**P1.5-processing**); Canonical Study; Reader extraction orchestration.

---

## P1.4 — Hive persistence + unified Supabase authentication (V3)

**Status:** **IMPLEMENTED** — app code in repo; Hive path **BLOCKED** on Supabase apply + Edge Function deploy `v1-hives` where not yet applied; auth **ready for live email-code verification** after deploy (2026-10-21)

**Evidence:** `apps/web/src/lib/auth/`, `supabase/functions/v1-hives/`, `supabase/migrations/20261021130000_hive3_m1_public_hive_rpc.sql`, `docs/acceptance/P1.4-first-user-flow.md`.

---

## P1.3 — Database Qualification (deferred execution)

**Status:** PROCEDURE_READY (2026-10-20); **execution deferred** while application slices land

**Evidence:** `docs/HIVEFORYOU-V3-DATABASE-QUALIFICATION-P1.3.md`, `supabase/qualification/p1.3_q*.sql`.

**Re-run when:** After upload migrations apply and operator authorization for non-production qualification.

---

## P1.2 — Database Schema and RLS Design (awaiting acceptance)

**Status:** READY_FOR_REVIEW (2026-10-20)

**Evidence:** `docs/HIVEFORYOU-V3-DATABASE-MIGRATION-P1.2.md`, `supabase/migrations/20261020120000_hive3_m1_hives_baseline.sql`.

---

## Closed / historical sections

Prior P0.1–P0.3, P1.1, database-first plan approval, and Milestone 1 decision tables remain in git history and governing plan documents.

**Ticket ID reminder:** **`P1.5`** = document upload (this file’s P1.5 section). **`P1.5-processing`** = Inngest/Oracle processing integration (active ticket above).

---

## Authority documents

| Document | Role |
|----------|------|
| `docs/PRODUCT-REQUIREMENTS.md` | OD-01 upload types/quota; owner Hive deletion (P1.7) |
| `docs/DEVELOPMENT-PLAN.md` | Status index |
| `docs/HIVEFORYOU-V3-DEVELOPMENT-PLAN-database-first-PROPOSED.md` | Governing sequence |
| `docs/acceptance/P1.P-gate1-processing-persistence.md` | Gate 1 live acceptance (release blocker) |
| `docs/acceptance/P1.P-gate2-planning-artifacts.md` | Gate 2 live acceptance (when implemented) |
| `docs/acceptance/P1.5-processing-ui-oracle.md` | P1.5-processing live acceptance (release blocker) |
| `docs/acceptance/P1.7-document-workspace-hive-delete.md` | P1.7 live acceptance |
