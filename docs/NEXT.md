# Active ticket

**Phase / Ticket:** **UX-DOC-1 — Documents → Continue → Live Hive Progress**
**Status:** **ACTIVE (2026-10-25)** — Step 1 **IMPLEMENTED (repo)**; Step 3 live progress modal **IMPLEMENTED (repo 2026-10-25) — awaiting user verification**; Step 3 Living Hive animation + status-poll ordering **IMPLEMENTED (repo 2026-10-25)**; **approved Living Hive design (`reference/prototype/Living-Hive-Motion-Approved.html`) implemented in the progress modal (repo 2026-10-25) — awaiting user review and live-run verification**. Step 3 migration `20261025120000` **applied (operator-reported 2026-10-25)**; Worker `1a40000` deployed. No migrations applied, deploys, pushes or paid model calls without separate authorization.

---

## Closed — P2.2-PX.P (2026-10-25)

**Phase / Ticket:** **P2.2-PX.P — Bounded parallel extraction**
**Status:** **CLOSED (implementation + live qualification, user-reported 2026-10-25)** — bounded document-level concurrency (`WORKER_P2_EXTRACTION_CONCURRENCY`, supported `1..4`, default `2`) on the selected-Pack extraction path (`runPackExtractionForSources`). Sequential Mode B windows per document, input-order output preservation, in-flight drain + persistence on retryable failure, and sanitized run-level summary telemetry.

**Live qualification (operator-reported):**

| Check | Result |
|-------|--------|
| Deployed Worker SHA (Oracle) | **`e3a5d14`** (`perf(p2px): add bounded parallel document extraction`) |
| Study run | **`49543887-b363-43e1-81e6-5c4c05854b32`** |
| Documents | **8 / 8** completed; **0** unusable |
| Concurrency | `concurrency_limit=2`, `max_in_flight_documents=2` |
| Duration | `duration_ms=128086` |
| Extraction candidates | **268** accepted, **1** rejected (`QUOTE_NOT_IN_PAGE`) |

**Does not close:** P2.3 evidence verification, P1.P Gate 3, P2.4 / P5.1 product qualification, pack-free grocery gate (P5.2), Gate 1 / Gate 2 / P1.5-processing integrated live acceptance.

---

## UX-DOC-1 — plan

**Objective:** Replace the Analyze Documents form with one journey: question at the top (editable), a context-aware **Continue** above the document list, a brand-aligned progress modal driven only by real `study_runs` status, and an honest results handoff that never claims a Canonical Study exists before Gate 3.

| Step | Scope | State |
|------|-------|-------|
| 1 | Web only: question card + context-aware Continue above documents; shared `useHiveStudyRun` hook; no run IDs/diagnostics in the main experience; Canonical Study tab read-only (no duplicate submit) | **Implemented (repo)** — `HiveAnalyzeHeader.tsx`, `CanonicalStudyStatusPanel.tsx`, `use-hive-study-run.ts`, `handoff.ts` (+tests); `HiveProcessingPanel.tsx` removed |
| 2 | One active run per Hive: partial unique index + submit RPC returns the existing active run (`active_run_exists`); re-enqueue only a still-`QUEUED` run with its original key | Await approval; migration needs separate SQL authorization; **required before UI-to-result acceptance** |
| 3 | Live progress modal: honeycomb loops subtly only while the run is active (stops on success/failure/cancel; static under reduced motion — brand guide amended 2026-10-25); stage-specific copy tied to real `study_runs` status and planning summary; extract-stage stale copy; per-document "finished reading X of N" from Worker completion markers via a counts-only owner RPC; reconnect/minimize/failure/success states | **Implemented (repo 2026-10-25) — awaiting verification.** Web: `HoneycombActivity.tsx`, `HiveProgressModal.tsx`, `handoff.ts`, `use-hive-study-run.ts`, `extraction/progress` route. Contracts: `pack-extraction-progress@1`. Worker: `pack-extraction-document@1:<source_document_id>` run artifact per finished document (selected-Pack path only). SQL: `supabase/migrations/20261025120000_hive3_uxdoc1_extraction_progress.sql` + `supabase/qualification/uxdoc1_extraction_progress_assertions_readonly.sql` — **applied, integrity checks passed; Worker commit `1a40000` deployed, Inngest ACTIVE; live counter observed at 7 of 8 (operator-reported 2026-10-25).** **Living Hive signature animation (approved 2026-10-25) — implemented (repo), awaiting browser verification:** one cell snap + same-colour echo per newly observed finished document, one combined pulse for a multi-document jump, one inward seal when the stage moves past reading while the run is active; never replays on load/reopen/reconnect/hidden tab; stops on terminal status; static under reduced motion. Status polls are now ordered (`studyRunStatusDecision` in `handoff.ts`): responses older than the latest settled poll are ignored (including late failures), and a finished run never returns to active. Web only — no Worker, contract, RPC, SQL, polling-interval or count changes. **Approved Living Hive design (2026-10-25, web only):** modal layout, typography, counter with real `+N` chip, one bar segment per run document, step row, expandable real-filename list and footer from the prototype; motion vocabulary Relay 0.65 s/cell · Deposit 1050 ms · Swarm 1150 ms · Sync 1500 ms · Hold 900 ms · Rest 700 ms · Still (reduced motion) ported to `HoneycombActivity` (rAF light engine; replaces breathe/snap/echo/seal). Copy adopted only where backed by recorded status/counts; unsupported prototype semantics not shipped (per-document Reading/Read/Queued/Couldn't-read rows and filenames per event — progress contract is counts-only; Connecting findings / Checking sources / Preparing your study stages; "Your study is ready" / "Open my study"; resume-without-rereading; completion notifications; simulation controls). Failure offers **Back to my Hive** and **Try again** (existing submit, only when Continue would offer retry). One closing progress read per run when it leaves reading so "All N documents are read" and success/failure counts come from durable markers. |
| 4 | Canonical Study status handoff copy; development plan §3.1.3 + screen matrix row 11 sync | Await approval |

**Animation approval (user, 2026-10-25):** subtle continuous honeycomb animation is approved **only while processing is active**; it stops on success, failure or cancel and is static under `prefers-reduced-motion`. Progress messages stay tied to actual system status, not timers. `reference/HiveForYou-brand-guide.md` is amended; **`reference/HiveForYou brand guide.pdf` has NOT been updated and still says "never loop" — PDF synchronization pending (brand owner).** Event motion (scale-based snap, same-colour echo, reading-complete seal) approved by the user 2026-10-25 and recorded in the markdown guide only; the PDF needs this amendment too.

**Step 3 release scope (approved; not yet deployed):** apply migration `20261025120000` and run `uxdoc1_extraction_progress_assertions_readonly.sql` → deploy Worker (marker write on top of live `e3a5d14`) → deploy web → browser check on a live selected-Pack L001 run (count rises to N and never exceeds it, loop stops on terminal state, reduced motion static, minimize/reconnect, non-owner denied, pack-free run shows no count). Each step needs separate authorization.

**Constraints:** Progress counts come only from durable Worker markers (no timers, percentages or inferred completion). Pack-free runs show no per-document count (generic path unchanged; redesign deferred). Processing APIs other than the new read-only owner RPC, evidence rules and domain-neutral Core unchanged.

**Plan:** `.cursor/plans/documents_continue_journey_*.plan.md` (agent plan, revised 2026-10-24).

---

## Closed — P2.2-PX.I (2026-10-25)

**Phase / Ticket:** **P2.2-PX.I — Selected-Domain-Pack extraction (implementation)**
**Status:** **CLOSED (extraction implementation + live L001 extraction qualification)** — Worker deploy at commit **`03dcc59`** (Oracle); study run **`c8fd4586-1ca8-4851-b7f9-b70cff453c7e`**. **Not** P2.3 evidence verification, **not** Canonical Study promotion (P1.P Gate 3), **not** P2.4 / P5.1 product qualification, **not** pack-free grocery release gate.

**Objective (met):** Selected-Pack branch on the P1.5-processing Worker path: prompt compile and `prompt_digest`, Reader read-only source preparation, Worker-owned extraction model call, fact-level validation and disposition, Gate 2b persistence, tier 1 mocked acceptance, and **demonstrated live** eight-document L001 extraction with persisted batches.

**Live extraction qualification (2026-10-25, operator-verified):**

| Check | Result |
|-------|--------|
| Deployed Worker SHA | **`03dcc59`** (`fix(p2px): normalize pack fact IDs before validation`) |
| Study run | **`c8fd4586-1ca8-4851-b7f9-b70cff453c7e`** |
| Extraction batches | **8 / 8** — disposition **`SUCCEEDED`** / validation **`VALID`** |
| Accepted facts (validator) | **260** accepted candidates |
| Rejections | **0** rejected facts; **0** `VALID_WITH_REJECTIONS` / rejected batch records |
| Gate 2b persistence | **Applied in live target env** for this run (`pack_extraction_prompts`, amended `extraction_batches`, Worker RPCs — migration `20261024120000`) |

**Implementation scope (final):**

| Step | Layer | Deliverable | State |
|------|--------|-------------|--------|
| 1A–1B, 3–5, 7, UI | contracts / core / worker / web | Per design §14 | **CLOSED** (2026-10-24 repo + 2026-10-25 live path) |
| 6 | Supabase SQL | Gate 2b | **APPLIED (live target env)** — `supabase/migrations/20261024120000_hive3_p2px_gate2b_pack_extraction.sql`, `supabase/qualification/p2px_gate2b_pack_extraction_assertions_readonly.sql` |
| 8 | Gateway (P5.3) | Alias + cache/redaction policy (L4/L5 telemetry) | **Partially verified** — extraction alias used for live run; cache/reuse release criteria and full L4/L5 operator record **not** closure gates for this ticket |
| 9 | Acceptance | Tier 1 mocked + tier 2 live L001 extraction | **CLOSED** — see `docs/acceptance/P2.2-PX-pack-extraction-L001.md` §4–§5 |

**Authority:** `docs/design/p2.2-px/PACK-EXTRACTION-PROMPT-ARCHITECTURE.md`, `docs/acceptance/P2.2-PX-pack-extraction-L001.md`.

**Does not close (unchanged release / product gates):** **P2.3** evidence verification and verified-fact promotion; **P1.P Gate 3** Canonical Study merge; **P1.P Gate 1 / Gate 2** and **P1.5-processing** integrated live acceptance matrices; **P2.2-DP.I**; **pack-free grocery** (P5.2); **P2.4** / **P5.1** L001 product qualification; **`PAYLOAD_TOO_LARGE` ADR** if envelope code changes; generic / no-Pack extraction redesign (**DEFERRED**).

**Carry forward:** **`WORKER_ENABLE_PACK_EXTRACTION`** remains an operator flag (live qualification used enabled path with reviewed `domain-packs/iep/2.0.0`); prefix cache correctness threshold **not** a release gate until provider/gateway verified.

---

## Closed — P2.2-PX.D (2026-10-24)

**Phase / Ticket:** **P2.2-PX.D — Domain Pack Extraction Design and Prompt Architecture**
**Status:** **CLOSED (design approved)** — commit `e3482d6` (2026-10-24). Documentation only; no application code, migrations, gateway configuration or paid model calls in that commit.

**Objective (met):** When a reviewed Domain Pack is selected, the Pack owns the document-type taxonomy and complete fact catalog; the model identifies document types and extracts only defined facts with mandatory evidence; **no model-driven schema-generation stage**. Prompt construction, caching, validation, persistence and failure handling specified.

**Evidence:** `docs/design/p2.2-px/PACK-EXTRACTION-PROMPT-ARCHITECTURE.md`, `docs/acceptance/P2.2-PX-pack-extraction-L001.md`; synchronized authority docs and Cursor rules listed in git commit `e3482d6`.

**Carry forward:** **P2.2-PX.I** closed (2026-10-25); generic/no-Pack redesign **DEFERRED**; pack-free grocery gate **mandatory**; `PAYLOAD_TOO_LARGE` ADR still open if used as envelope code.

---

## UX-DOC-1 (detail — active ticket at top)

Local verification (2026-10-24): `apps/web` typecheck OK, vitest **117/117**, `next build` OK. Browser check not yet run.

Step 3 local verification (2026-10-25): typecheck OK in `packages/contracts`, `apps/worker`, `apps/web`; vitest contracts `pack-extraction/v1` **20/20**, worker **236 passed / 1 skipped**, web **158/158**; `next build` OK (new route `/api/v1/hives/[hiveId]/study-runs/[studyRunId]/extraction/progress`). Not yet done: browser check, migration apply + `uxdoc1_extraction_progress_assertions_readonly.sql`, Worker deploy, live run with a visible count. Brand PDF still says "never loop" (markdown summary amended; PDF synchronization pending). UX investigation complete; design direction approved. Steps are approved, verified and reported one at a time.

Living Hive local verification (2026-10-25): `apps/web` typecheck OK, vitest **189/189** (new `HoneycombActivity.test.tsx`, `use-hive-study-run.test.tsx`; extended `handoff.test.ts`, `HiveProgressModal.test.tsx`), `next build` OK. Disabling the ordering guard makes the out-of-order tests fail (mutation check). Not yet done: browser check of the motion (normal + emulated reduced motion), live run observing an arrival, batch and seal.

Approved Living Hive design local verification (2026-10-25): `apps/web` typecheck OK, vitest **218/218** (rewritten `HoneycombActivity.test.tsx`, `HiveProgressModal.test.tsx`; extended `handoff.test.ts`, `use-hive-study-run.test.tsx`), `next build` OK, no editor diagnostics (no lint script in repo). Browser check on a temporary local fixture harness (deleted afterwards; no backend): measured deposit ≈1.0 s, swarm ≈1.1 s, sync 1.5 s, hold 0.9 s, counter lift 0.9 s, chip 1.6 s; reduced motion requested zero animation frames while counts/live line updated; failure, reconnect and 390 px layouts checked. Reference prototype could not be rendered side by side (its `support.js` runtime is not in the repo; `file://` blocked). Local dev rendered Outfit via fallback (`next/font` download unavailable) — re-check typography on deployed web. Not yet done: live selected-Pack run in the browser, user design review.

---

## Paused — Five-Feature Release Deployment (operator runbook)

**Phase / Ticket:** **Five-Feature Release — Deployment** (operator runbook)  
**Status:** **PAUSED** — runbook unchanged; **UX-DOC-1** is active (2026-10-25); await explicit commit/push/deploy/SQL authorization for bundle promotion (2026-10-22)

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
3. **Vercel:** Push **`main`** to GitHub (triggers production deploy of `apps/web`); confirm `INNGEST_EVENT_KEY` (and Inngest integration signing key); `/api/inngest` registers **no** functions (Connect owns `hive3-process-study-run`).
4. **Oracle Worker / Reader:** Pull release SHA on Oracle host; `npm ci` + `npm run start` in `apps/worker` (requires **Node ≥ 22.4** for Connect); set `INNGEST_SIGNING_KEY` per `infra/oracle/worker-inngest-connect.md`; `pip install -e .` + `uvicorn hive_reader.main:app` in `apps/reader`; env from `infra/oracle/*.config.env.example` (no deploy script in repo — operator unit/restart as on host).
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
| Web APIs + Inngest send | `apps/web/src/app/api/v1/hives/[hiveId]/study-runs/`, `apps/web/src/lib/inngest/send-study-run-queued.ts` |
| Inngest Connect (Oracle) | `apps/worker/src/inngest/` |
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
| **V3 Database-First Persistence — Plan Revision 2** | **PENDING (T2/T3 persistence **DECIDED** 2026-10-23 — §3.1.6; await implementation approval)** | User review of remaining §3.1.7 open items and Gate 2b+ implementation; active ticket unchanged |
| **P2.2-DP.I** | **PARKED** (plan only) | Explicit implementation approval (prerequisites in repo) |
| **P2.2-PX.I** | **CLOSED (2026-10-25)** — live L001 extraction qualified; commit `03dcc59`, run `c8fd4586-1ca8-4851-b7f9-b70cff453c7e` | Does not substitute Gate 1/2/P1.5 live matrices, P2.3, Gate 3, P2.4/P5.1 |
| **P1.P Gate 3** | NOT_STARTED | Gate 2 repo; Gate 2b/2c per Plan Revision 2 §3.1.2; Canonical Study promote RPC |
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
| `docs/design/p2.2-px/PACK-EXTRACTION-PROMPT-ARCHITECTURE.md` | P2.2-PX.D selected-Pack extraction design (proposed) |
| `docs/acceptance/P2.2-PX-pack-extraction-L001.md` | P2.2-PX L001 acceptance — tier 1 mocked + tier 2 live extraction qualified (2026-10-25); not P2.3/P2.4 |
