# HiveForYou V3 — Controlled Development Plan

**Version:** 0.1  
**Status:** APPROVED — governing development plan (2026-10-20). Filename kept so existing links and proposal history stay on this path.  
**Date:** 2026-10-20  
**Approval:** User-directed adoption of this plan at the start of P1.1 (2026-10-20). Approval sets sequencing. It does not authorize migrations, application code, commits, pushes, or deployments.  
**History:** Drafted 2026-10-20 as a proposal, including this database-first amendment and a superseded connectivity-first P1 (§4.1). Approved the same day as the governing plan.  
**Target:** A user uploads L001's eight documents through the browser and receives one accurate, provenance-backed Canonical Study, then useful Customer and Professional outputs. A second, pack-free grocery use case demonstrates generality.

## 1. Authority and scope

1. `docs/PRODUCT-REQUIREMENTS.md` (current V3 requirements draft) determines **what** the product must do; open requirements cannot be silently assumed resolved.
2. `docs/ARCHITECTURE.md` (current V3 architecture proposal) determines **how** only after its relevant decisions are approved.
3. This document governs sequencing and completion gates. `docs/DEVELOPMENT-PLAN.md` is the status index and must match this document.
4. `docs/NEXT.md` is the **only active ticket**, updated after each completed ticket.
5. `reference/HiveForYou brand guide.pdf` remains unchanged and authoritative for brand/UI.
6. V2 architecture/agentic plan/repository maps remain read-only historical references; V2 production and its data are not migrated by default.

If documents conflict, pause and record a decision; do not silently reinterpret requirements to fit existing code. This plan is not permission to create repositories, modify code, deploy, spend on model calls, use sensitive documents with external AI, or migrate data.

## 2. Non-negotiable development rules

- **One ticket at a time.** Nothing outside `docs/NEXT.md` except a blocking defect required to complete it; record everything else in Parking Lot.
- **Approval before implementation.** For each ticket: proposed exact files/contract changes → user approval → implementation → proof → completion decision.
- **One runtime path.** Browser/real API and acceptance tests use the same processing entry point. Unit tests may mock external dependencies, never create a parallel product pipeline.
- **One Hive = one evolving Canonical Study.** Revisions/snapshots are history, not independent canonical studies.
- **Domain-neutral Core.** IEP rules live only in optional Domain Pack material; pack-free intent must work.
- **No source, no claim.** Assertions, classifications, calculations, evidence and user corrections must be differentiated.
- **No premature configuration.** Each required variable has a single owner and purpose. All model calls use the existing Oracle LiteLLM gateway; no silent provider fallback, direct-provider bypass, competing model settings, environment-specific business logic, activation registry, test orchestrator, or new service without approved need.
- **No bypasses to pass a gate.** No weakened verifier, invented provenance, hardcoded L001 facts, bypassed owner checks or report claims.
- **Record reproducibility.** Release commit, contract versions, Reader model, pack digest (if any), input set, processing status and output snapshot are inspectable.
- **Secure data.** Private storage, ownership checks, no credentials in Git/events, no real customer data in copied lower environments. Sensitive-domain external model processing requires explicit policy approval.

## 3. Target repository boundaries (proposed)

```text
hiveforyou-v3/
  apps/web/                 Next.js, Vercel: auth, Hive UI, upload, job status, outputs
  apps/worker/              TypeScript, Oracle: workflows, verification, study merge, persistence
  apps/reader/              Python FastAPI, Oracle: candidate extraction via LiteLLM
  packages/contracts/      Small versioned HTTP and data contracts; no cross-app source imports
  packages/core/           Pure domain-agnostic study logic; consumed by worker only
  domain-packs/            Optional declarative pack files, IEP first
  supabase/                Migrations and access policies
  infra/oracle/            Existing Docker deployment pattern, minimal configuration
  docs/                    Requirements, architecture, plan, NEXT, ADRs, test evidence
  reference/               Brand guide and read-only V2 historical docs
```

**Deployment:** Vercel UI, Inngest orchestration, Oracle TypeScript worker, Python Reader and the existing Oracle LiteLLM model gateway, Supabase data/storage. One internal versioned HTTP contract between Worker and Reader. No direct UI → Reader calls. Inngest's execution entry point is specified explicitly during P1, not assumed to be automatic.


## Database-first sequencing amendment — APPROVED (2026-10-20)

User direction: design the complete V3 database first, in isolated Supabase schema `hive3`, with every table's purpose, fields, keys, security and relationships documented. Do not apply migrations without separate approval.

**P1 order (governing):** P1.1 schema inventory and ERD → P1.2 SQL/RLS/storage design → P1.3 isolated database qualification (approval-gated) → P1.4 repository/application bootstrap → P1.5 UI/Inngest/Oracle integration. The superseded connectivity-first P1.1–P1.3 definitions are historical only (§4.1). P0 design remains a prerequisite.

**Companion design (still proposed):** `HIVEFORYOU-V3-DATABASE-DESIGN-v0.1.md`. P1.1 inventory: `HIVEFORYOU-V3-DATABASE-INVENTORY-P1.1.md`. Start from the 16-table candidate inventory; one conditional collaboration table, all subject to review. No full V2 migration replay or domain pack activation registry. A reported manual `hive3.hives` object is not a migration baseline.

## 4. Phase-and-ticket plan

| Phase | Ticket | Deliverable | Done when (objective proof) |
|---|---|---|---|
| **P0 — Design freeze** | **P0.1** | Approve prioritized requirements and resolve MVP blocking open decisions | File types, privacy/provider policy, access model, output expectations, minimum limits agreed; open nonblockers deferred explicitly |
| | **P0.2** | Architecture decisions and minimal contracts | **VERIFIED (2026-10-20):** `docs/ERROR-HANDLING-RECOVERY.md`, ADR-001, `packages/contracts` (`error-envelope@1`). Integration-time only (see `docs/NEXT.md`): LiteLLM alias ownership → P2.1/P5.3; Worker–Reader HTTP → P2.1/P1.5; service auth → P1.4/P1.5/P5.3; numeric retries/timeouts → P1.5/P5.3; concurrent runs per Hive → P1.3/P1.5 |
| | **P0.3** | V2 reuse inventory | Each candidate tagged **reuse as-is / port+trim / reference only / discard**, with path, dependencies and rationale; no implementation |
| **P1 — Database first, then foundation** | **P1.1** | Schema inventory, ERD, drift assessment, qualification checklist | **READY_FOR_REVIEW (2026-10-20):** `docs/HIVEFORYOU-V3-DATABASE-INVENTORY-P1.1.md`. No migration executed. Live `hive3.hives` remains user-reported, not independently verified |
| | **P1.2** | Reviewed SQL, RLS, storage policies, and an adopt-not-drop plan for the manual `hives` table | SQL static review only; no migrations executed |
| | **P1.3** | Isolated non-production qualification after separate approval to apply SQL | Reproducible owner-isolation, uniqueness, revision, and evidence checks; `hives.owner_user_id` is `ON DELETE CASCADE`. Account-deletion processing (OD-12) is a later ticket. Clean migration status |
| | **P1.4** | Repository/app bootstrap | UI, Worker, and Reader each build independently; import boundaries enforced; no inherited V2 runtime dependencies |
| | **P1.5** | UI → Inngest → Oracle Worker → Reader → `hive3` write/read | From the browser, a synthetic non-sensitive job completes on that same pathway; timeouts and errors visible |
| **P2 — Reader/evidence** | **P2.1** | Python Reader with one stable HTTP contract and LiteLLM model routing | An authorized, policy-permitted document returns candidate JSON and error metadata through Oracle LiteLLM; alias and model/config recorded; direct-provider fallback prohibited |
| | **P2.2** | Intent-driven dynamic schema and optional Pack input | Without pack, user intent produces extraction fields; with pinned IEP pack, guidance is applied without Core rule changes |
| | **P2.3** | Evidence verification | Invalid source/page/quote rejected; unknown explicitly retained; verified records have traceable anchors |
| | **P2.4** | L001 eight-document Reader qualification | All 8 addressed; no silent omissions; accepted facts and rejected reasons audited against V2 baseline/golden with qualitative review; differences understood, not just counts |
| **P3 — Canonical Study** | **P3.1** | One Hive current study and immutable revision snapshots | First study created; subsequent job updates **same** study; prior revision still queryable; no data loss |
| | **P3.2** | Merge/entities/relationships/time and uncertainty | L001 current vs historical claims, relationships and conflicts correctly explained with evidence; newer ≠ automatically authoritative |
| | **P3.3** | Incremental intents/docs, attributed corrections | Reuse known receipt/IEP facts; extra evidence only where needed; user interpretation corrections do not overwrite source facts |
| **P4 — Outputs** | **P4.1** | Customer analysis from pinned study revision | Plain-language, intent-relevant results; every factual claim links to evidence or labeled derivation; limitations visible |
| | **P4.2** | Professional-defined report | Professional selects scope/questions; generated report references same study revision and provenance; role access enforced |
| **P5 — Product acceptance** | **P5.1** | End-to-end L001 UI acceptance | Real browser path with 8 synthetic L001 docs, stable study, current/historical distinctions, source chips, usable customer/pro output; reviewed against golden |
| | **P5.2** | Pack-free grocery acceptance | Receipt Hive works without pack; 20→30 documents update same study; second intent reuses data; separate Hive stays isolated; purchase vs consumption distinguished |
| | **P5.3** | Reliability, privacy, operational qualification | Idempotent retries, clear failures, no leaked secrets, owner isolation, model costs/runtime recorded, repeatable full journey |
| **P6 — Stabilize and release** | **P6.1** | Release candidate freeze | Zero unresolved P0/P1 blockers or P5 critical defects; docs and release manifest complete; no unapproved architecture changes |
| | **P6.2** | Production promotion | Approved tested Git SHA/images/config schema deployed; migrations reviewed and reversible; post-deploy browser smoke succeeds |
| | **P6.3** | Reproducible lower-environment template | Clone infrastructure/config *definitions*, never customer data/secrets; independent credentials, isolated storage; identical contract/runtime versions initially |

### 4.1 Historical P1 IDs (superseded 2026-10-20)

These IDs were the connectivity-first draft. They are not active tickets. Their intent moved to P1.4 (bootstrap) and P1.5 (integration). Do not reopen them under the old numbers.

| Old ticket | Former deliverable | Former done-when |
|---|---|---|
| **P1.1 (old)** | New repo, docs, independent build layout, secret contract | UI/Worker/Reader each build independently; import boundaries enforced; no inherited V2 runtime dependencies |
| **P1.2 (old)** | Minimal Supabase model, private source storage and auth | Two users/Hives cannot access each other's records; one current study per Hive; source hashes and revision history supported |
| **P1.3 (old)** | Real UI → Inngest → Oracle Worker → Reader → result/status round trip (gateway reachability checked) | From browser, synthetic non-sensitive job completes; same pathway used later; timeouts/errors visible; no LLM needed for connectivity gate |

**Sequencing:** Work top-to-bottom, one ticket at a time. A ticket may depend on prior verified outputs; don't advance on “compiles”, healthy Docker containers, or isolated unit tests alone. Phases P2–P4 can be refined at P0, but adding/subdividing tickets requires recorded approval. P5 acceptance governs product readiness, even if component checks are green.

## 5. Ticket execution protocol (mandatory)

For every ticket, provide exactly:

```text
Phase / Ticket: P?.?
Status: NOT_STARTED | IN_PROGRESS | BLOCKED | READY_FOR_REVIEW | VERIFIED
Objective: one observable outcome
Requirements: Rxx references
Scope: exact intended files/services; explicitly excluded files
Approvals needed: code / model calls / database / deployment / production data
Implementation: smallest change, no incidental refactors
Done-when: reproducible commands + expected outcome + artifact/log location
Evidence: commit SHA, tests, UI/job IDs, screenshots when useful, known limitations
Next ticket: only after user accepts DONE
```

**Escalation:** If blocked, STOP. Give one root-cause hypothesis with evidence and one minimal remediation proposal. No fallback route, environment-specific script, or scope expansion without approval.

**Change control:** Requirement change → edit requirements and acceptance case → document architecture impact → approve replan → edit this plan/NEXT. Do not implement from informal discussions alone.

## 6. Acceptance metrics (baseline definitions)

- **L001:** eight logical source documents addressed; document-level failure, coverage and source anchors visible; candidate vs accepted vs rejected counts; comparison with baseline V2 **168 accepted verifier facts** is diagnostic only (not a minimum quality score); canonical entities/relationships/currentness and reports reviewed against golden/reference.
- **Receipt case:** can run with no Domain Pack; required analyses are reproducible with unknown classifications explicitly reported; 20→30 receipt enrichment and new intent reuse observable.
- **Access:** unauthorized cross-user/Hive access denied on both API and storage.
- **Replay:** same job retry cannot duplicate facts or corrupt the current study; earlier revisions remain inspectable.
- **Outputs:** every supported factual report claim is linked to underlying evidence or explicitly labeled as calculation/interpretation; professional output has user-specified parameters.
- **Operations:** service-to-service authentication and failure logs are actionable; one role-specific LiteLLM alias per model-calling role, gateway routing verified; end-to-end release SHA recorded.

**OD-01 (P0.1):** Free tier **10 successful uploads per UTC calendar month** (all Hives); initial types PDF, PNG, JPG, DOCX; per-file size configurable. **OD-05:** other numeric performance/cost/concurrency limits are **implementation-time**, not invented here.

## 7. Environments and production policy

**First:** one integrated non-production development environment, built on the target Vercel + Inngest + Oracle + Supabase topology, using synthetic/authorized data. **Then:** stabilize, snapshot/tag a reviewed release, deploy to production under separate credentials and a controlled migration. **Only after that:** replicate deployment/infrastructure definitions into lower environments, without copying production documents/keys. Different environments may diverge in size/configuration, not evidence/contract/business semantics without a versioned approved change.

## 8. Current state

- **This plan:** **APPROVED** (2026-10-20) as governing sequencing. Filename unchanged.
- **Active ticket:** **P1.2** READY_FOR_REVIEW — `docs/NEXT.md`. P1.1 is **ACCEPTED**.
- **P0.1, P0.2, P0.3:** **VERIFIED** (2026-10-20). See `docs/DEVELOPMENT-PLAN.md` and `docs/NEXT.md`.
- **P1.3 and later:** NOT_STARTED. Migration apply, bootstrap, and integration are not authorized. The P1.2 SQL file is review-only.
- **Parking lot:** proactive intent suggestions/local intelligence, domain knowledge learning, cross-Hive intelligence, expanded pack governance, additional processing modes; failed-run artifact retention **duration** (OD-06 / DB design §6.5). Account deletion is OD-12 (30-day policy approved; processing is a future ticket).

**Approval record:** User approved this plan as V3 development governance on 2026-10-20 and directed P1.1 inventory. That approval is not permission to migrate, deploy, or treat database design v0.1 as executable SQL.
