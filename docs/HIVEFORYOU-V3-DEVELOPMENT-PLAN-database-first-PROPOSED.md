# HiveForYou V3 — Controlled Development Plan

**Version:** 0.2 (Plan Revision 2 — planning amendment 2026-10-23)  
**Status:** APPROVED — governing development plan (2026-10-20). **Plan Revision 2 (§3.1)** is **PROPOSED** — planning/documentation only until user approves implementation tickets derived from it. Filename kept so existing links and proposal history stay on this path.  
**Date:** 2026-10-20 (sequencing); **2026-10-23** (Revision 2 amendment)  
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

**P1 order (governing):** P1.1 schema inventory and ERD → P1.2 SQL/RLS/storage design → P1.3 isolated database qualification (approval-gated) → P1.4 repository/application bootstrap → **P1.P processing persistence (Gate 1 before integration)** → P1.5 UI/Inngest/Oracle integration. The superseded connectivity-first P1.1–P1.3 definitions are historical only (§4.1). P0 design remains a prerequisite.

**Amendment 2026-10-22 (P1.P / question planning — approved documentation alignment):** M1 migrations persist Hives and sources only. **P1.P Gate 1** (`study_runs`, intent private storage, run status) is a **hard prerequisite** for **P1.5** processing integration — not circular (persistence does not depend on Inngest). **P1.P Gate 2** persists **`study-question-set@1`**, **`study-plan@1`**, and **`study-question-coverage@1`** before **P2.2-DP.I** runtime question planning. **P2.2-DP.D** design is closed in `docs/design/p2.2-dp.d/`; **P2.2-DP.I** is not started. Full gate table: `docs/DEVELOPMENT-PLAN.md` §3–§4.

**Amendment 2026-10-22 (Gate 1 → P1.5-processing ticket transition):** **P1.P Gate 1** recorded **IMPLEMENTED (repo) — live acceptance deferred** in `docs/NEXT.md`; active ticket is **P1.5-processing** (`P1.5` in NEXT remains document upload). Gate 1 six live persistence scenarios stay mandatory release gates in `docs/acceptance/P1.P-gate1-processing-persistence.md`.

**Companion design (still proposed):** `HIVEFORYOU-V3-DATABASE-DESIGN-v0.1.md`. P1.1 inventory: `HIVEFORYOU-V3-DATABASE-INVENTORY-P1.1.md`. Start from the 16-table candidate inventory; one conditional collaboration table, all subject to review. No full V2 migration replay or domain pack activation registry. A reported manual `hive3.hives` object is not a migration baseline.

### 3.1 Database-first Plan Revision 2 (2026-10-23) — PROPOSED

**Amendment 2026-10-23 (T2/T3 persistence location):** **DECIDED** — extracted pages, study revision snapshots, verified facts, and persona report bodies are **PostgreSQL**-resident; original uploads and T4 raw Reader blobs stay in **Storage**; oversized T2/T3 (and fact/report JSONB) fail with **`PAYLOAD_TOO_LARGE`**, not silent Storage spillover (**§3.1.6**). Reader/Documents UI acceptance (**§3.1.3**) unchanged.

**Ticket (planning):** V3 Database-First Persistence — Plan Revision 2  
**Objective:** Align approved PostgreSQL-as-system-of-record direction, Gate 1–2 repo reality, and Claude prototype Reader/Documents workspace requirements into one implementation sequence — without authorizing SQL apply, code, deploy, or paid model calls.  
**Prototype path (verified in repo):** `reference/prototype/HiveForYou Prototype.html` (see `reference/prototype/README.md`; fully linked assets remain in V2 `design-reference/claude-prototype/`).  
**Active ticket unchanged:** `docs/NEXT.md` remains **Five-Feature Release — Deployment** until the user explicitly retargets `NEXT.md`.

#### 3.1.1 Architectural corrections (binding for downstream implementation)

| # | Correction | Proposed behavior |
|---|------------|-------------------|
| **A1** | **`canonical_studies.current_revision_id` mutability** | The pointer is updated **only** inside an authorized, transactional **`hive3_*_promote_study_revision`** RPC (Gate 3): insert immutable `study_revisions` row, then set `current_revision_id`, in **one** transaction. **No** direct `UPDATE canonical_studies` for `authenticated`; **no** Worker bypass that sets the pointer outside this RPC. Revisions and snapshot rows are **never** updated in place. Reconcile ambiguous commits by `study_revisions.based_on_run_id = study_run_id` (`docs/ERROR-HANDLING-RECOVERY.md` §7). |
| **A2** | **JSONB content hashing (backward compatible)** | **Problem:** PostgreSQL `jsonb` normalizes key order and numeric formatting; hashing `payload_jsonb::text` or re-reading JSONB from the database can disagree with Gate 1 Worker `sha256JsonPayload` (`JSON.stringify` in `apps/worker/src/persistence/artifact-json-hash.ts`). **Solution:** Treat `content_sha256` as a **contract-defined semantic digest**, not “hash of stored JSONB text.” (1) **Gate 1 run artifacts** (`study_run_artifacts`): keep existing rows; Worker continues to hash the **canonical object** immediately before RPC (same algorithm as today). On read, reload idempotency compares stored `content_sha256` only — **do not** re-hash JSONB from SQL for equality. (2) **Planning artifacts** (`study-question-set@1`, etc.): continue **`content_hash` inside the contract** with field excluded from digest (`planning-artifacts.ts` pattern). (3) **New tables** (`document_pages.page_text`, `facts.value_json`, revision snapshots): introduce **`hive3.canonical_json_sha256(jsonb)`** (immutable SQL function, `pgcrypto`) that hashes **`jsonb_strip_nulls` + deterministic key sort** (recursive for objects; array order preserved). Worker and SQL **must** call the same definition; add **`supabase/qualification/p1p_json_hash_regression_readonly.sql`** with fixed vectors proving agreement with Worker test vectors. **Migration rule:** never change digest algorithm for an existing `artifact_kind` / contract version; new versions get new `contract_version` labels. |
| **A3** | **Reuse vs failure taxonomy (no silent re-extract / no duplicate paid calls)** | Classify persistence and cache outcomes explicitly at Worker boundaries (`error-envelope@1` extensions as needed): **`PAGE_CACHE_MISS`** (no row for `(source_document_id, page_number, content generation version)` — proceed to Reader); **`STORAGE_UNAVAILABLE` / `STORAGE_OBJECT_MISSING`** (Supabase Storage — fail batch, retryable per policy, **do not** call Reader to “replace” DB); **`PERSISTENCE_CORRUPT_JSONB`** / **`ARTIFACT_HASH_MISMATCH`** (row present but unreadable or digest mismatch — terminal for that artifact, **no** auto re-extract on same run); **`DB_UNAVAILABLE` / `DB_TRANSIENT`** (bounded inline retries only per `.cursor/rules/30-worker-reader.mdc`); **`READER_UNAVAILABLE`**. **Never** treat a persistence failure as a cache miss. **Never** repeat LiteLLM/Reader paid work when the only failure was write or hash verification after a successful read/extract response — mark run/batch failed, retain diagnostics, allow **new** `study_run_id` on user action. |
| **A4** | **Payload size tiers (not one 512 KiB cap)** | Gate 1 **`study_run_artifacts`** keeps **`octet_length(payload_jsonb::text) <= 524288`** (512 KiB) for orchestration/planning blobs — **do not** reuse this limit for page corpora, revision snapshots, or report bodies. **Tiers (implementation-time, documented in Gate SQL):** (T1) run/planning artifacts — 512 KiB JSONB inline or **explicit** **`storage_path`** + empty/minimal JSONB sentinel (existing Gate 1 pattern only); (T2) **`document_pages`** — extracted page text and provenance in **Supabase PostgreSQL** (**DECIDED** §3.1.6), **≤ 64 KiB** per page text enforced in SQL; (T3) **`study_revisions.snapshot_json`** — Canonical Study revision snapshots in **PostgreSQL JSONB** (**DECIDED** §3.1.6), **≤ 2 MiB** per snapshot enforced in SQL; (T4) raw Reader candidate blobs — **private Storage only** (no large JSONB in `extraction_batches`). **Original uploaded files** stay in **Supabase Storage** (`source_documents.storage_path`) only. **Verified model facts** (`facts`, `fact_evidence`, Gate 2c) and **persona report bodies** (`analyses.result_json`, `reports` output JSONB, P4) persist in **PostgreSQL** with gate-specific bounds. **Oversized handling:** RPC rejects with stable code **`PAYLOAD_TOO_LARGE`**; **do not** silently truncate, spill to Storage, or auto-redirect oversized T2/T3/fact/report JSONB to Storage — fail closed and surface a safe user-visible recovery state. T1 may use the existing explicit storage-pointer sentinel; that pattern **must not** be reused as an implicit overflow path for T2/T3. UI shows safe “content too large to preview inline” where applicable — never truncate silently for verified evidence. |
| **A5** | **Evidence verification authority** | Reader `quote_verified` on `reader-candidate-extraction@1` is **diagnostic only** (Reader may set `false` on format errors; Worker **must not** treat `true` as verified). **P2.3** re-checks every candidate anchor against **persisted** `document_pages` page text/provenance in PostgreSQL and `source_documents.sha256` / hive scope. UI document findings bind to **`facts` + `fact_evidence`** with `verification_status = verified` (or explicit “unknown/unverified” states) — not raw extraction JSON. |
| **A6** | **Preserved invariants** | **Source-hash/version reuse** via `extraction_batches` + stored pages/facts keyed by document identity; **tenant isolation** via composite hive-scoped FKs (inventory PC-12); **immutable historical revisions**; **independent Writer/report runs** (`reports` / `analyses` pinned to `study_revision_id`, separate from merge). Keep **`ReaderReadDocumentPageV1`**; no V2 word-level adapter. |

#### 3.1.2 Revised persistence schema and Gate sequence (companion detail in `HIVEFORYOU-V3-DATABASE-DESIGN-v0.1.md` §2–§4; inventory `HIVEFORYOU-V3-DATABASE-INVENTORY-P1.1.md`)

| Gate / ticket | Depends on | SQL / repo deliverables (approval-gated) |
|---------------|------------|-------------------------------------------|
| **P1.P Gate 1** | M1 upload/hive SQL | **IMPLEMENTED (repo):** `20261022100000`, `20261022203000`; Worker `apps/worker/src/persistence/*`. Live: `docs/acceptance/P1.P-gate1-processing-persistence.md`. |
| **P1.P Gate 2** | Gate 1 | **IMPLEMENTED (repo):** planning artifact kinds on `study_run_artifacts`; live: `docs/acceptance/P1.P-gate2-planning-artifacts.md`. |
| **P1.P Gate 2b — pages & batches** | Gate 1, P1.5-processing path | Migration: `document_pages`, `extraction_batches`, `extraction_schemas` (per design v0.1); Worker RPCs **service_role** only; readonly qualification for uniqueness, hive binding, page locator integrity. Contracts: extend `packages/contracts` for page persistence projections only — no browser exposure of full page text. |
| **P1.P Gate 2c — facts & evidence** | Gate 2b, P2.2 extract | Migration: `facts`, `fact_evidence`; disposition columns on batches; idempotent insert per `(study_run_id, source_document_id, extraction_schema_id)`. |
| **P1.P Gate 3 — study pointer** | Gate 2c, P2.3 | Migration: `canonical_studies`, `study_revisions`; **`hive3_*_promote_study_revision`** (A1); deferrable FK/trigger per inventory PC-10; readonly qualification for pointer/revision monotonicity and cross-hive denial. |
| **P2.3** | Gate 2b, Reader extract | Worker verify stage: page/quote match against persisted pages; stable reject reasons; no merge. |
| **P3.1** | Gate 3, P2.3 | Core merge into revision snapshot + fact graph; uses promote RPC only. |
| **P1.P-UI — Reader/Documents workspace** | Gate 2b (status), Gate 2c (findings), P1.5-processing | See §3.1.3. |
| **P4.1 / P4.2** | P3.1 | Customer/pro **`reports`** tables; independent Writer runs. |

#### 3.1.3 Reader/Documents UI acceptance (Claude prototype — `reference/prototype/HiveForYou Prototype.html`)

**Scope:** Hive workspace at `/hives/[hiveId]` — shell, sticky workspace tabs, and three panels. **Preserve** existing V3 upload, quota, delete/replace, and processing submit (`HiveDocumentsPanel`, `HiveProcessingPanel`, P1.5-processing APIs).

| Prototype element | Match criteria | Data binding (no mocks in production) |
|-------------------|----------------|----------------------------------------|
| **Layout** | `max-width: 1160px`, page padding ~`28px 32px`, workspace background `#F7F8FA`, content cards white `#fff` / border `#E7E9ED`, radius 16–18px | Existing `HiveCustomerShell` / workspace container; extend tokens to match prototype spacing |
| **Typography** | Headings **Outfit** 26–28px semibold; body **Figtree** 15–16px; muted `#6B7280` / `#4A525C` | Align with brand guide + prototype screen D/E/F |
| **Sticky tabs** | Labels **Documents | Canonical Study | Reports**; active tab `#1F2328` + underline `#2F6FE4`; sticky ~`top: 56px` | Client tab state; deep-link query optional (`?tab=documents`) — defer if not in M1 scope |
| **Documents — empty** | Dashed upload CTA, “Add your first documents” | Real zero-count from list RPC; existing upload flow |
| **Documents — list** | Count line (“N documents”), **Add documents**, expandable cards: filename, date, type pill, status chip | `source_documents` + processing/batch status; type from `hfy-doc-kind` / mime mapping |
| **Documents — processing** | “Reading your documents” card + stage checklist (done/active/pending) | Map stages to **`study_runs.stage`/`status`** and per-document batch status — not prototype timers |
| **Documents — success banner** | “All N documents are ready” → CTA **Go to Canonical Study** | All in-scope batches terminal success |
| **Documents — partial failure** | Amber/red banner, per-doc **Retry**, optional continue | Failed batch with retry-eligible code; reuse P1.5 idempotent retry |
| **Documents — study outdated** | Blue info banner when sources changed after revision | Compare document set/hash snapshot vs `current_revision_id` metadata — **defer** until Gate 3 metadata exists; show only when detectable |
| **Document card expand — findings** | “What we found in this document” grouped categories; provenance chips; View original / Delete | **Verified facts only** for groups/chips; chips link to page/quote metadata (not raw model JSON). Delete: existing P1.7-B flow |
| **Canonical Study — locked/empty** | Large card “Your study starts with your documents” | No `canonical_studies` row or no successful revision (MD-02) |
| **Canonical Study — build/processing/failed** | Build CTA, processing steps, **Try again** / Back to Documents | Bind to study run stages; failed run leaves prior revision unchanged |
| **Reports — empty** | “Reports come from your study” + CTA to study tab | No reports for revision; no fake report list |
| **Responsive** | Prototype uses wrapping flex, `auto-fit` grids, horizontal tab scroll | Match `HiveForYou Responsive Previews.html` breakpoints where web shell lacks coverage |

**Explicit deferrals (do not fake in V3):** Sample/explore Hive (`isSample` flows); pro report **purchase** and subscription modals; prototype mock document catalog IDs; simulated progress via `setTimeout`; full in-app PDF viewer if only signed download URL exists; Canonical Study entity browser beyond verified fact summaries until P3.2; investigation operator UI until P3.I; any finding not backed by Gate 2c + P2.3.

**Security:** No public API returns private extraction JSON, full page text, or storage paths without owner auth; UI never renders candidate proposals as accepted facts.

#### 3.1.4 File-level implementation tasks (after Revision 2 approval — ordered)

| Step | Files / areas | Notes |
|------|---------------|-------|
| 1 | `supabase/migrations/*_hive3_p1p_gate2b_document_pages_batches.sql`, `supabase/qualification/p1p_gate2b_*_readonly.sql` | Gate 2b |
| 2 | `supabase/migrations/*_hive3_canonical_json_sha256.sql`, `supabase/qualification/p1p_json_hash_regression_readonly.sql` | A2 |
| 3 | `apps/worker/src/persistence/document-pages.ts`, `extraction-batches.ts`, orchestration hooks in `process-study-run.ts` | A3 taxonomy |
| 4 | `packages/contracts/src/` page/batch/fact read models for **owner-scoped web projections** | No raw extract in contracts |
| 5 | `apps/worker/src/verification/*` (P2.3), tests against fixture pages | A5 |
| 6 | `supabase/migrations/*_hive3_p1p_gate3_canonical_study.sql`, promote RPC, qualification SQL | A1 |
| 7 | `apps/web/src/components/workspace/` — prototype-aligned tabs, extend `HiveDocumentsPanel`, study/reports panels | §3.1.3 |
| 8 | `apps/web/src/app/api/v1/hives/[hiveId]/` — read-only projections (counts, statuses, verified findings) | RLS-safe |
| 9 | `docs/acceptance/P1.P-gate3-canonical-study.md`, `docs/acceptance/P1.P-ui-reader-documents-prototype.md` (new), update P2.3/P5.1 rows | Qualification |

#### 3.1.5 Error handling, observability, and verification

**Failure paths (must be testable):** database outage (`DB_UNAVAILABLE`); corrupt/missing page row (`PERSISTENCE_CORRUPT_JSONB`); hash mismatch on artifact reload (`ARTIFACT_HASH_MISMATCH`); partial Gate 3 write (reconcile or `MERGE_FAILED`); authorization denial on all new RPCs and web routes; unsupported UI actions hidden or disabled with stable message; processing failure with prior revision intact.

**Observability:** Propagate `correlation_id` and `study_run_id` from web through Inngest, Worker, Reader, and SQL RPCs; log `error_code`, `stage`, `retryable` — never log document text, quotes, or model payloads.

**Acceptance tests (Revision 2 closure):**

1. **L001 eight PDFs:** page-level rows with provenance; batches per doc; no silent doc skip.  
2. **Reuse:** second run with unchanged `sha256` skips Reader when pages+batches satisfied (cache hit), with explicit audit field — not silent skip on error.  
3. **Verified facts + revisions:** promotion RPC only advances pointer; revision 1 immutable after revision 2.  
4. **Reports:** customer and pro snapshots on same revision independently.  
5. **UI:** side-by-side or checklist against `reference/prototype/HiveForYou Prototype.html` screens D/E/F (Documents list, processing, study empty, reports empty).  
6. **UI states:** empty, loading, success, failed, retry-eligible — each with persisted backend state.  
7. **Negative:** cross-user Hive denial; corrupt JSONB does not trigger re-extract; storage failure does not call Reader.

#### 3.1.6 Persistence location (DECIDED 2026-10-23)

Documentation-only closure for Plan Revision 2 — no SQL apply, code, or deployment authorized by this amendment.

| ID | Decision | Binding behavior |
|----|----------|------------------|
| **T2** | Extracted page text and provenance | Persist in **Supabase PostgreSQL** on **`document_pages`** (bounded columns + provenance metadata). Gate 2b SQL enforces per-page size (**≤ 64 KiB** page text unless a future approved tier change). P2.3 quote verification reads this row data — not Storage. |
| **T3** | Canonical Study revisions and snapshots | Persist in **Supabase PostgreSQL JSONB** on **`study_revisions.snapshot_json`**. Gate 3 SQL enforces snapshot size (**≤ 2 MiB** unless a future approved tier change). Immutable revision rows; pointer advance only via promote RPC (A1). |
| **Uploads** | Original source files | Remain in **private Supabase Storage**; **`source_documents`** holds identity, hash, and **`storage_path`** only — not extracted page text or study snapshots. |
| **Facts & reports** | Verified model output and persona reports | **Verified facts** and **`fact_evidence`** (Gate 2c) and **Writer persona report bodies** (`analyses` / `reports` JSONB, P4) persist in **PostgreSQL** with explicit gate bounds — same **no silent Storage redirect** rule as T2/T3. |
| **Overflow** | Large payloads | **Explicit bounded-size handling** in RPC/SQL (`PAYLOAD_TOO_LARGE`). **Do not** silently redirect oversized extracted pages, snapshots, facts, or report JSONB to Storage; T4 raw Reader artifacts and T1’s **explicit** planning-artifact storage sentinel remain the only approved Storage-backed JSON substitutes. |

**Companion detail:** `docs/HIVEFORYOU-V3-DATABASE-DESIGN-v0.1.md` §2 (`document_pages`, `study_revisions`, `facts`, `reports`) and §6.3–§6.4.

#### 3.1.7 Unresolved decisions (explicit — do not assume at implementation)

1. **Concurrent runs per Hive** (P1.3/P1.5) — queue vs reject.  
2. **Deep-link tab URLs** and evidence chip → full-page viewer UX.  
3. **Study-outdated banner** exact predicate (document revision counters vs hash set).

#### 3.1.8 Documentation synchronization (required when Revision 2 **implementation** is approved — not done by this planning ticket)

| Document / rule | Sync action |
|---------------|-------------|
| `docs/HIVEFORYOU-V3-DATABASE-DESIGN-v0.1.md` | Gate 2b–3 columns, RPC names, payload tiers, promote RPC — **T2/T3 persistence synced 2026-10-23** |
| `docs/HIVEFORYOU-V3-DATABASE-INVENTORY-P1.1.md` | `document_pages`, batch/fact lifecycle, PC items — **T2/T3 columns synced 2026-10-23** |
| `docs/HIVEFORYOU-V3-DATABASE-MIGRATION-P1.2.md` / P1.3 qualification | New migration IDs and readonly scripts |
| `docs/DEVELOPMENT-PLAN.md` | Gate 2b/2c/3 and P1.P-UI rows |
| `docs/NEXT.md` | Active ticket when implementation starts |
| `docs/HIVEFORYOU-V3-SCREEN-ADOPTION-MATRIX-PROPOSED.md` | Row 11 workspace → **Adopt** with prototype reference |
| `docs/ERROR-HANDLING-RECOVERY.md` / `docs/adr/ADR-001-error-handling-recovery.md` | Taxonomy codes, promote RPC name |
| `docs/acceptance/*` | New gate 3 + UI prototype acceptance docs |
| `.cursor/rules/30-worker-reader.mdc`, `40-contracts-data.mdc`, `90-verification.mdc` | Payload tiers, verification authority, UI evidence rules |

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
| | **P1.P** | Processing persistence (`study_runs`, batches, intents, planning artifacts, study revisions) | Gate 1 unblocks P1.5; Gate 2 unblocks P2.2-DP.I; **Gate 2b/2c** (pages, batches, facts) + **Gate 3** (promote RPC) per **§3.1.2** unblock P2.3/P3.1; **P1.P-UI** (prototype Documents/Study/Reports) after Gate 2b status + verified findings path; separately approved SQL only |
| | **P1.5** | UI → Inngest → Oracle Worker → Reader → durable run read/write | **After P1.P Gate 1.** Synthetic non-sensitive job completes with durable run status, correlation, and recovery; not mock orchestration |
| **P2 — Reader/evidence** | **P2.1** | Python Reader with one stable HTTP contract (`reader-document-read@1`) and selective LiteLLM OCR routing | An authorized document returns page-grounded read JSON (methods, quality, source hash); LiteLLM used only for approved selective OCR; alias and model/config recorded; direct-provider fallback prohibited; P2.2 adds schema-driven field extraction |
| | **P2.2** | Intent-driven dynamic schema and optional Pack input | Without pack, user intent produces extraction fields; with pinned IEP pack, guidance is applied without Core rule changes |
| | **P2.2-DP.D** | Universal pack + IEP + Unified Question Planning design | Documentation in `docs/design/p2.2-dp.d/`; no runtime |
| | **P2.2-DP.I** | Generic pack `@3`, question planning, study plan compile | After P2.2-DP.D + P1.P Gate 2; integrated acceptance after P1.5 |
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

- **This plan:** **APPROVED** (2026-10-20) as governing sequencing; **Plan Revision 2 (§3.1) PROPOSED** (2026-10-23). Filename unchanged.
- **Active ticket:** **`docs/NEXT.md`** — **Five-Feature Release — Deployment** (2026-10-22); do not infer active work from this section alone.
- **P0.1, P0.2, P0.3:** **VERIFIED** (2026-10-20). **P1.P Gate 1–2:** IMPLEMENTED (repo), live acceptance deferred. **P1.5-processing:** IMPLEMENTED (repo), live acceptance deferred. M1 upload/hive/document workspace: IMPLEMENTED (repo), operator SQL/deploy pending per NEXT.
- **Plan Revision 2 implementation:** **NOT AUTHORIZED** — pending explicit approval after user review of §3.1.
- **Parking lot:** proactive intent suggestions/local intelligence, domain knowledge learning, cross-Hive intelligence, expanded pack governance, additional processing modes; failed-run artifact retention **duration** (OD-06 / DB design §6.5). Account deletion is OD-12 (30-day policy approved; processing is a future ticket).

**Approval record:** User approved this plan as V3 development governance on 2026-10-20 and directed P1.1 inventory. That approval is not permission to migrate, deploy, or treat database design v0.1 as executable SQL.
