# HiveForYou V3 — Development Plan

**Version:** 1.0 | **Date:** 2026-10-22 | **Status:** Replacement-ready plan aligned to approved Canonical Intelligence Architecture. Local ticket status below is based on Cursor/user reports and requires repository verification when executing.

**Active ticket:** [`docs/NEXT.md`](./NEXT.md) — **UX-DOC-1 ACTIVE (2026-10-25)** (Step 3 live progress modal implemented in repo; migration `20261025120000` not applied; release order migration → Worker → web; user-approved active-only honeycomb loop with reduced-motion support — brand PDF synchronization pending). **P2.2-PX.P CLOSED (2026-10-25)** — Worker **`e3a5d14`** live on Oracle; study run **`49543887-b363-43e1-81e6-5c4c05854b32`**, 8/8 documents, 0 unusable, `concurrency_limit=2`, `max_in_flight_documents=2`, `duration_ms=128086`, 268 accepted / 1 rejected (`QUOTE_NOT_IN_PAGE`) candidates (operator-reported). **P2.2-PX.I CLOSED (2026-10-25)** — selected-Pack extraction implementation and **live L001 extraction qualification** (Worker **`03dcc59`**, study run **`c8fd4586-1ca8-4851-b7f9-b70cff453c7e`**, 8/8 **`VALID`** batches, 260 accepted facts, zero rejections); **not** P2.3 verification, Gate 3, or P5.1. **P2.2-PX.D** design closed. **P2.2-DP.I** remains plan-only. **P1.P Gate 2**, **P1.5-processing**, and **P1.P Gate 1** remain **IMPLEMENTED (repo) — integrated live acceptance deferred**.

## 1. Mission and release definition

Deliver one production-equivalent pipeline that turns an authorized collection of documents and user intent into **one evolving, provenance-grounded Canonical Study**, discovers defensible cross-document findings, and answers changing queries for customers and authorized professionals. Optional reviewed **Domain Intelligence Packs** improve interpretation; unfamiliar documents work without packs. Success is measured by an **actual UI-to-Oracle** journey, not isolated passing tests.

Initial qualifying journeys: **L001 eight-document IEP**, **pack-free grocery 20→30 receipts across changing intents**, and an additional **synthetic Medicaid dual-persona architectural/functional probe** once core investigations are in place. A newly added synthetic pack must work without changing domain-specific application code.

### Governing constraints

- `NEXT.md` is **the sole active ticket authority**; this plan is the backlog and sequencing source, not permission to execute multiple tracks.
- Current product and architecture documents, repository map, Cursor standards, scoped rules and approved decisions govern each ticket. V2 is reference-only.
- No implementation before a scoped plan and approval. Commits, pushes, migrations, deployments, sensitive data use and paid model runs require separate authorization.
- One integrated Vercel + Inngest + Oracle Worker/Reader/LiteLLM + Supabase processing path; one retry authority (Inngest), one current study per Hive.
- No claim without evidence or labeled derivation; packs never create document facts; no domain-specific conditionals in universal processing code.
- Preserve unrelated work and unpushed local commits. Sync decisions across affected docs and `.cursor/rules`, verify positive/negative paths, and close only after acceptance evidence.

## 2. Status reconciliation — 2026-10-22

The uploaded earlier development-plan draft and NEXT.md describe P0 as not started. They are **outdated relative to the supplied Cursor reports**; do not reset tickets to `NOT_STARTED` or discard implemented work when replacing repository files. Confirm against local Git and the current repo's `docs/NEXT.md` before synchronizing.

| Work | Reported state | Evidence / caveat |
|---|---|---|
| P0 design / architecture / reuse | Progressed historically | Prior planning performed; precise local closures need repo check |
| P1.1 database design/inventory, P1.2 SQL/RLS, P1.3 qualification | Partly progressed | Actual applied migration set must be inspected; do not assume proposed processing tables are live |
| P1.4 app/bootstrap, P1.7 workspace and uploads | Local product work reported | Exact integration/deploy acceptance must be checked |
| **P1.5-processing** | **IMPLEMENTED (repo) — live acceptance deferred** (2026-10-22) | Web submit + Inngest + Worker orchestration + Reader path in repo; **10** Worker unit tests (orchestration + persistence); integrated browser proof + migrations apply still **release blockers** |
| **P1.P** | **Gate 1 IMPLEMENTED (repo) — live acceptance deferred**; **Gate 2 IMPLEMENTED (repo) — live acceptance deferred**; **Gate 3 NOT_STARTED** | Gate 1: `study_run_artifacts` + Worker RPCs. Gate 2: three planning `@1` contracts + Worker persistence on same store — **no new artifact table**; **`extraction_batches`** deferred. **Six Gate 1 + eight Gate 2 live scenarios** remain **release blockers** |
| **P2.1 Reader** | **ACCEPTED local**, commit `71365af` | P2.1 read/contract; LibreOffice full tests reportedly passed on configured host, absent on later host |
| **P2.2 Dynamic extraction** | **ACCEPTED local**, commit `f9c9bbb` | Worker planning, pack matching, Reader extraction; mocked model tests, not live integrated qualification |
| **P2.2-DP (repo)** | **IMPLEMENTED** per `NEXT.md` | Pack/catalog L001 fixtures; distinct from **P2.2-DP.D** design closure and **P2.2-DP.I** |
| **P2.2-DP.D** | **CLOSED (design, 2026-10-22)** | `docs/design/p2.2-dp.d/*`; candidate **`CANDIDATE_NOT_IMPLEMENTED`**; **not** P2.2-DP.I |
| **P2.2-DP.I** | **PARKED (plan only)** | Repo prerequisites met (**P2.2-DP.D**, **Gate 2**, **P2.2**, **P1.5-processing**); integrated proof on live orchestration + optional **P2.3** |
| **P2.2-PX.D** | **CLOSED (design, `e3482d6`, 2026-10-24)** | Selected-Pack extraction + prompt architecture |
| **P2.2-PX.I** | **CLOSED (2026-10-25)** — extraction + live L001 path qualified | Commit **`03dcc59`** deployed on Oracle Worker; Gate 2b **applied in live target env**; tier 1 mocked + tier 2 live (8/8 batches, 260 accepted, 0 rejections). **Does not** close P2.3, Gate 3, Gate 1/2/P1.5 live matrices, P2.4/P5.1, or pack-free grocery |
| **P2.3 Evidence verification** | **ON HOLD** per `NEXT.md` | Resumes after P2.2-DP local acceptance; integrated path needs **P1.5-processing** |
| P3 study, investigations, P4 outputs, P5 acceptance, P6 release | **Not verified implemented in V3** | V2 history is not V3 completion |

**User-approved order for current design work:** replace comprehensive architecture → replace comprehensive development plan → design definitive IEP reference Domain Pack → then implement approved tickets. This approval covers documents/design, **not code, migration, commit, push or deployment**.

## 3. Dependency-driven roadmap

**Persistence reality (repo vs live):** M1 delivers Hive ownership, registered sources, upload policy, and study-source lock RPCs. **P1.P Gate 1** migration SQL, qualification assertions, and Worker persistence client are **in repo** (2026-10-22); **operator apply** and **live acceptance** are tracked separately and remain release gates. Do not assume Gate 1 objects exist in a target Supabase until applied there. **Gate 2** planning artifact **contracts + Worker persistence** are **in repo**; **Gate 2 live acceptance** and **Gate 3** Canonical Study revisions are **not** qualified. **P2.2-DP.I** runtime planning is **not** implemented.

```text
P0 architecture + Domain Pack design guide (incl. question-driven planning §13)
   ↓
P2.2-DP.D — finalize declarative IEP pack, two views, four questions, Unified Question Planning
   (docs/design/p2.2-dp.d/* — design closed; does not mark P2.2-DP.I implemented)
   ↓
P1.P Gate 1 — study_runs, correlation/stage/status, delivery idempotency, private intent storage,
   run-scoped artifact attachment (mechanism only; no second persistence path)
   ↓
P1.5-processing — Web → Inngest → Oracle Worker ↔ Reader, recovery boundaries, durable run status
   (requires P1.P Gate 1; does not require question-planning artifacts or study merge)
   ↓
P2.1 / P2.2 integrated acceptance (local ACCEPTED; levels 4–5 need P1.5-processing + P1.P batches as scoped)
   ↓
P2.3 evidence verification → P2.4 L001 qualification (integrated paths blocked without P1.5-processing)
   ↓
P1.P Gate 2 — versioned durable storage for study-question-set@1, study-plan@1, study-question-coverage@1
   (+ extraction_batches / evidence tables per approved database design; still one hive3 path)
   ↓
P2.2-DP.I — pack @3 contracts, generic plan_questions, equivalence matching, investigation selection, plan compile
   (requires P2.2-DP.D + P1.P Gate 2; not satisfied by schema validation or isolated unit tests alone)
   ↓
P3.1–P3.3 Canonical Study merge, identity, time, incremental intents (requires P2.3 + P1.P study/revision persistence)
   ↓
P3.I1 / P3.I2 — execute investigations per study-plan@1, lineage-backed findings (requires P3.1 snapshot + P2.2-DP.I plan path)
   ↓
P4 audience outputs → P5 product qualification → P6 release
```

**P1.5-processing vs P1.P (no circular dependency):** **P1.P Gate 1 precedes P1.5-processing.** Inngest/Worker integration must read/write durable run identity, stage, terminal status, safe errors, and correlation IDs; that is not optional mock state. **P1.5-processing does not implement Canonical Study merge or question artifacts** — those are **P1.P Gate 2** (planning artifacts) and **P3.1** (accepted revision pointer). **P1.P never depends on P1.5-processing**; Worker may hold ephemeral artifacts during development, but **P2.2-DP.I** and browser-visible planning lineage **require P1.P Gate 2** before dependency claims.

**Ticket ID note:** **`P1.5`** in `NEXT.md` is **document upload** (repo implemented; operator apply pending). **`P1.5-processing`** here is **UI → Inngest → Oracle processing integration** (not started).

**Governance:** `NEXT.md` remains the sole active-ticket authority; this section is the dependency map only. All processing-table SQL remains separately approval-gated. Implementation tickets fail closed if they depend on durable question artifacts before P1.P Gate 2 lands.

## 4. Ticket catalog and objective gates

Status vocabulary: `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `READY_FOR_REVIEW`, `VERIFIED`, and **`ACCEPTED_LOCAL_INTEGRATION_PENDING`** when appropriate. “Committed” or “tests green” is not the same as integrated or production verified.

### P0 — Product and architecture governance

| Ticket | Outcome | Gate |
|---|---|---|
| P0.1 | Requirements/outcome and MVP decisions | Journeys, limits, privacy/provider, roles and non-goals acknowledged or explicitly deferred |
| P0.2 | Architecture/contracts and LiteLLM gateway policy | One route, auth/state/retry ownership, versioned contracts and trust boundaries documented |
| P0.3 | V2 reuse inventory | Each asset tagged reuse/port/reference/discard with verified paths; no implicit code inheritance |
| **P0.A** | **Canonical Intelligence architecture synchronization (design)** | This replacement architecture/plan reviewed; project docs, NEXT and Cursor rules mapped for update; no code edits |

### P1 — Data foundation and integration

| Ticket | Outcome | Gate |
|---|---|---|
| P1.1 | Database inventory/ERD | Tables, relationships, retention and failure semantics documented in isolated `hive3` schema design |
| P1.2 | SQL/RLS/private storage design | Owner/Hive isolation, schema indexing, partial-write recovery, secrets policy; migration approval separate |
| P1.3 | Isolated Supabase qualification | Applied approved migrations in authorized environment; cross-tenant denial, storage/RLS and rollback tests |
| P1.4 | Independent app/package bootstrap | Web, Worker, Reader and contracts build/test without forbidden cross-boundary imports |
| P1.5-processing | **UI → Inngest → Oracle Worker → Reader → durable run integration** | **Prerequisite (repo): P1.P Gate 1 implemented.** Real synthetic browser run with service auth, **durable** `study_run_id`/stage/status, Inngest retry boundaries, terminal failures with `error-envelope@1`, correlation propagation; mocked orchestration is not done. **Gate 1 live six-scenario acceptance** remains a **release** gate, not a blocker to start P1.5-processing planning |
| P1.7 (existing work) | Workspace, upload/delete/replace and source lock | User-visible auth/owner/source lock and negative paths verified; preserve established ticket history |
| **P1.P** | **Processing persistence** (approval-gated SQL) | **Gate 1 — IMPLEMENTED (repo), live acceptance deferred:** `study_runs`, private intent storage, run stage/status, delivery-scoped idempotency, run-scoped artifact store (single mechanism); readonly qualification + Worker RPC EXECUTE checks in repo. **Gate 2 (blocks P2.2-DP.I runtime planning):** durable versioned **`study-question-set@1`**, **`study-plan@1`**, **`study-question-coverage@1`** per `study_run_id`; **`extraction_batches`** and evidence disposition storage per approved design. **Gate 3 (blocks P3.1 merge acceptance):** `canonical_studies` / `study_revisions` atomic pointer. Transactional/idempotent writes; no parallel persistence stack |

### P2 — Reader, pack knowledge and evidence qualification

| Ticket | Outcome | Gate |
|---|---|---|
| P2.1 | Page-grounded PDF/image/DOCX Reader | Stable page/source hash, OCR/DOCX and errors; local acceptance reported at `71365af`; live wiring deferred |
| P2.2 | Intent-driven classify → pack match → dynamic schema → candidate extract | Exact/partial/generic + mock LiteLLM, errors and security; local acceptance at `f9c9bbb`. **Selected-Pack path superseded in design by P2.2-PX** (no schema generation when a pack is selected); generic path implementation unchanged, its redesign **deferred** |
| **P2.2-PX.D** | **Selected-Domain-Pack extraction + prompt architecture (design)** | **CLOSED (design, `e3482d6`):** `docs/design/p2.2-px/PACK-EXTRACTION-PROMPT-ARCHITECTURE.md`, `docs/acceptance/P2.2-PX-pack-extraction-L001.md` |
| **P2.2-PX.I** | **Selected-Pack extraction implementation** | **CLOSED (2026-10-25):** tier 1 mocked + **tier 2 live L001 extraction qualified** (Worker **`03dcc59`**, run **`c8fd4586-1ca8-4851-b7f9-b70cff453c7e`**, 8/8 **`SUCCEEDED`/`VALID`**, 260 accepted, 0 rejections). Gate 2b migration **`20261024120000` applied in live target env** for qualification. **Extraction validation only** — P2.3 evidence verification, Canonical Study (Gate 3), P2.4/P5.1 and integrated Gate 1/2/P1.5 acceptance **unchanged**. Cache telemetry L4/L5 recorded when operator completes; **no cache-reuse release threshold**. `PAYLOAD_TOO_LARGE` ADR if envelope code changes |
| **P2.2-DP.D** | **Universal Domain Pack + IEP + Question Planning design** | **CLOSED (design):** `IEP-DOMAIN-INTELLIGENCE-PACK-SPEC.md`, `IEP-PACK-QUALIFICATION.md`, `UNIFIED-QUESTION-PLANNING.md`, `iep-manifest@2.CANDIDATE.json`; two views, four catalog questions (Q01–Q04); candidate remains **`CANDIDATE_NOT_IMPLEMENTED`**; runtime is **P2.2-DP.I** after **P1.P Gate 2** |
| **P2.2-DP.I** | **Generic pack + question planning implementation** | **Prerequisites: P2.2-DP.D, P1.P Gate 2, P2.2 local path.** `@1` compatibility; `@3` loader/views/outcomes; structured equivalence + catalog selection; `plan_questions` → frozen question set → study plan compile → coverage; investigation `run_key` reuse; synthetic second pack without domain branches; **integrated** acceptance requires **P1.5-processing** + **P2.3** before verified-fact promotion |
| P2.3 | Independent evidence verification | **Prerequisites: P2.2 extract path; integrated gate: P1.5-processing + P1.P batch/evidence persistence.** Source/hive/hash/page/quote checked; candidate never auto-promoted; schema/compile success alone is not done |
| P2.4 | L001 eight-document quality qualification | **Prerequisites: P2.3, P1.5-processing for E2E.** Eight actual document identities; audited anchors; IEP-PACK-QUALIFICATION §12 planning gates on same engine path as L001 |

**P2.2-DP contract choice:** the manifest version (e.g., `domain-pack-manifest@2`) and IEP pack release version (e.g., `iep/2.0.0`) are separate. Pick actual pack release only after inspecting authoritative V2 v0.3 and v3 parser. Preserve `iep/1.0.0` immutable. Reviewed versions are explicitly pinned by ID/version/digest; no automatic semver upgrades for existing runs. A UI pill is domain-level, not a document-type list.

**P2.2-DP non-goals:** executing regulations, full canonical merge, investigation runtime, graph database, client-side private pack definitions, paid live model tests without approval, new per-domain engine, pack activation registry, broad refactor. A missing optional pack allows generic extraction; corrupt required/reviewed pack is diagnosable and cannot silently masquerade as valid guidance.

### P3 — Canonical Study and investigation intelligence

| Ticket | Outcome | Gate |
|---|---|---|
| P3.1 | One study/Hive, immutable snapshots and atomic current pointer | **Prerequisites: P2.3, P1.P Gate 3.** First run creates study; second enriches *same* study; failed run leaves accepted pointer and reports intact; planning failure leaves prior revision authoritative (`UNIFIED-QUESTION-PLANNING.md` §2) |
| P3.2 | Entity/record identity, temporal reconciliation, relationships, contradictions | Service/goal records keep item membership, dates/modality/author; uncertain matching retained; amendments scoped; no blind latest-wins |
| P3.3 | Incremental documents/intents and attributed corrections | Unchanged verified observations reused; delta extract when needed, new study revision; correction provenance and permissions preserved |
| **P3.I1** | **Universal operator/derived-finding contract and implementation** | **Prerequisites: P3.1 pinned snapshot.** Allowlisted operators; versioned inputs/status/coverage; executes investigations scheduled in **`study-plan@1`**, not pack callbacks |
| **P3.I2** | **Investigation findings + coverage completion** | **Prerequisites: P3.I1, P2.2-DP.I plan/coverage emission.** Findings anchored to assertions; **`study-question-coverage@1`** evidence vs answer split; pack-free grocery uses same operators |

**P3 intelligence gate:** simulated IEP baseline → target → progress comparison handles measurement-method incompatibility; Medicaid bank transfer ↔ gift letter ↔ application identifies **possible** discrepancy, not eligibility verdict; grocery sum and repeat-item analysis preserves quantity/unit ambiguity. All require verifiable input provenance.

### P4 — Audience-specific query and reporting

| Ticket | Outcome | Gate |
|---|---|---|
| P4.1 | Customer answers from pinned snapshots | Plain-language verified observations + labeled findings, suggested clarifying questions, unknown coverage shown, no unsupported narrative |
| P4.2 | Authorized professional report | Report template/scope/questions/format from same study; evidence-dense view, chronological comparison and review tasks, auth/access control |
| **P4.3** | **New-intent answers without recreating truth** | Existing snapshot answered first, targeted additional extraction only when needed; old responses/snapshots intact |

### P5 — End-to-end acceptance and supportability

| Ticket | Outcome | Gate |
|---|---|---|
| P5.1 | Full L001 browser-to-study-to-personas qualification | Eight actual synthetic files, source chips, current/historical, progress/goal links, customer + pro reports, unacceptable errors recorded |
| P5.2 | Pack-free grocery 20→30 and multiple intents (**mandatory release gate**; generic extraction redesign deferred, not waived) | One study, three questions (purchase categories, organic evidence/unknown, comparable unit prices), no fabricated category/consumption claims |
| **P5.2M** | **Medicaid dual-persona synthetic dry-run** | Same generic study/investigation contracts; applicant vs attorney output, traceable possible disclosure discrepancy; no legal adjudication or required complete Medicaid Pack |
| **P5.2X** | **New-pack extension proof** | Install reviewed synthetic pack + metadata only; domain pill and Worker pack discovery, document matching/schema use; zero domain-specific Web/Worker/Reader/Core edits |
| P5.3 | Reliability, privacy, model routing/cost and recovery | Real LiteLLM alias authorized, source boundaries, model/timeouts, duplicate retries, DB uncertainty, safe logs, observability, failure recovery and run-level idempotency proven |

### P6 — Release and environment promotion

| Ticket | Outcome | Gate |
|---|---|---|
| P6.1 | Freeze immutable release candidate | P5 critical defects resolved, artifacts/contracts/pins/SHA and rollback reviewed |
| P6.2 | Authorized production promotion | Verified exact release deployed, separately approved migrations, access and rollback checks, browser smoke with safe inputs |
| P6.3 | Reproduce isolated lower environments | Same deploy/config definitions with independent keys, private storage and synthetic/sanitized data; never clone customer records |

## 5. Detailed design gates for the next three user-approved documents

**Gate A — architecture (current):** this complete file defines the topology, source→candidate→verified→study→finding→answer boundaries, optional pack semantics, generic operators, access, failure semantics, qualification and explicit pending choices. Approval of text ≠ implementation.

**Gate B — development plan (current):** this file integrates delivery dependencies, ticket scope and tests without erasing P2.1/P2.2 progress. Approval of this plan ≠ approval of P2.2-DP.I implementation.

**Gate C — IEP Domain Intelligence Pack + Question Planning (design):** **Closed in repo documentation** under `docs/design/p2.2-dp.d/` (spec, qualification, **`UNIFIED-QUESTION-PLANNING.md`**, candidate manifest). Authoritative implementation planning starts at **P2.2-DP.I** after **P1.P Gate 2** approval; do not treat Gate C closure as P2.2-DP.I implemented.

**Gate C must explicitly reject:** treating eight generic Web kind chips as proof of eight L001 types; assuming source paths exist without inspecting the local checkout; hardcoded frontend enum additions per domain; hiding partially mapped v0.3 definitions; generic framework growth unrelated to L001/grocery tests.

## 6. Ticket execution template (mandatory)

For each substantial ticket:

```text
Ticket: <phase/id>
Objective: <one measurable outcome>
Context: <requirements, current code, evidence>
Scope: <verified files and explicit exclusions>
Constraints: <architecture, security, scope, approvals>
Implementation: <minimal approved steps>
Error Handling: <codes, timeouts, recovery, failure states>
Observability: <correlation and safe diagnostics>
Verification: <positive, negative, integration, real-journey gates>
Done When: <reproducible output and acceptance criteria>
Report: <diff, tests, status, blockers, risks>
```

Workflow: **Understand → read-only plan → approve → implement → verify → synchronize affected docs/rules → close**. If the active task in `NEXT.md` differs, stop and synchronize governance before execution. Park unrelated findings. No unattended changes outside scope.

## 7. Acceptance and reliability matrix

| Area | Must prove | Must fail safely |
|---|---|---|
| Owner isolation | Correct Hive can read sources/study/reports | Unauthorized cross-Hive API or storage fetch denied |
| Source fidelity | Hash/source/page matches and value anchored | Fabricated quote, wrong page, unbound candidate rejected/unresolved |
| Pack selection | Reviewed pinned digest, known version, no domain code | Missing selected pack, corrupt manifest, title collision, within-domain tie diagnosable |
| Model routing | Approved alias through Oracle LiteLLM | Missing alias, timeout, invalid JSON no silent fallback or direct-provider call |
| Data completeness | Full or explicitly targeted source coverage | Missing expected source produces `COVERAGE_INCOMPLETE` or bounded unknown, not false completeness |
| Record identity | Goal/service/transfer/item rows remain intact | Near-duplicate identities stay unresolved, no accidental merge |
| Time/measure | Compatible numeric trend correct with as-of dates | Different method/unit/denominator not silently compared |
| Derived insights | Operator input links + coverage reproducible | Unbacked insight never accepted as a source fact |
| Study evolution | Same Hive study, immutable snapshots, no overwrite | Failed/retried run cannot duplicate or advance accepted pointer |
| Audience | Customer + lawyer/pro get appropriate same-snapshot views | Wrong permissions or factual discrepancy between persona results denied |
| Operational recovery | Trace stage/run/batch, retry authority and safe failures | No secrets/source text in logs or event payloads |

## 8. Verification levels and status reporting

1. **Static:** contract schema/typecheck, lints, import boundaries.
2. **Unit:** pack parse, title matching, identity, matching, operator math and negative tests.
3. **Component:** Reader pages/OCR/DOCX/extract, Worker planning/verifier, mocked LiteLLM.
4. **Integrated:** actual authenticated Oracle Worker→Reader/storage/database, Inngest orchestrated; failure and retry.
5. **Product:** real authorized browser through eight-document L001 and pack-free grocery with inspected provenance/reports.
6. **Release:** immutable approved commit/images/config/migrations promoted and smoked in target environment.

Only level 3 local P2.1/P2.2 progress was reported as accepted; do not infer levels 4–6. The later Reader suite reported `21 passed, 2 skipped` due to missing local LibreOffice; record the environment requirement without mischaracterizing P2.2 logic.

## 9. Source-of-truth synchronization checklist

After the architecture and plan are approved, separately synchronize repository versions of `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT-PLAN.md`, relevant product requirements, `docs/NEXT.md`, `docs/REPOSITORY-STRUCTURE.md`, design decision records, acceptance files and `.cursor/rules/*.mdc`. Verify links, version names and stale prohibitions. Do not overwrite unrelated changes, lose old decisions, alter actual migrations, or claim source-repo replacement until Git status/diff confirms it.

The current uploaded project copies and local repository are **not automatically synchronized** by producing these two downloadable documents.

## 10. Open decisions, risks, parking lot

**Need separate approval/qualification:** precise v2 pack schema and selected pack release version; production pack catalog distribution and public projection; verification of semantic quote support; exact derived-finding contracts; author/party/identity review policies; processing migrations, RLS and concurrent pointers; sensitive external-model provider policy, retention/deletion; collaboration/sharing/correction permissions; upload quotas, cost/latency targets, report exports; when live LiteLLM paid calls may occur.

**Key risks:** overfitting IEP, loading an unreviewed or invalid pack, model inventing matches, confusing legal rules with source evidence, fragmenting nested record rows, re-processing unchanged receipts, error recovery that corrupts current study, premature new engine/services, and claiming completion from mocks.

**Parking lot unless promoted by approval:** automatic pack-learning, broader domain marketplace, cross-Hive knowledge graph, autonomous legal verdicts, expansive regulatory execution, separate graph DB, multiple competing model gateways, domain-specific per-pack services and premature performance frameworks.

**Immediate next action (dependency order, not parallel authorization):** **UX-DOC-1** active per `NEXT.md` (Step 3 release: migration → Worker → web → browser check; Step 2 still required before UI-to-result acceptance; approve remaining steps individually). **P2.2-PX.I** and **P2.2-PX.P** closed — next extraction work is **P2.3** (on hold) or **P2.2-DP.I** only after explicit approval. Carry **Gate 1**, **Gate 2**, and **P1.5-processing live acceptance** forward as integrated-release proof; do not start **Gate 3** or full **P2.3** integrated verification in parallel unless explicitly re-scoped.

### Dependency blockers (explicit)

| Blocker | Unblocks |
|---|---|
| Gate 1 live six-scenario acceptance not passed (repo SQL may be unapplied) | Five-feature **release** qualification; integrated env must apply Gate 1 before durable run proof |
| P1.5-processing live acceptance not passed (repo implemented) | P1.5-processing integrated proof; P2.4 E2E; P5 browser qualification; integrated P2.3 |
| P1.P Gate 2 live eight-scenario acceptance not passed (repo implemented) | Integrated proof that planning artifacts persist in target env; **P2.2-DP.I** live §12 qualification |
| P2.2-DP.I runtime not implemented | Browser-visible planning lineage; IEP `@3` loader; **IEP-PACK-QUALIFICATION** §12 automated scenarios |
| No Canonical Study revision pointer (P1.P Gate 3) | P3.1 merge acceptance; P3.I execution against accepted snapshot |
| Marking pack/parser tests green without UI→Oracle run | **Rejected** as product acceptance per §8 level 4–5 |
