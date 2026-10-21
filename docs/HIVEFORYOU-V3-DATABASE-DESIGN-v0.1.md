# HiveForYou V3 — Database Design v0.1

**Status:** PROPOSED schema — do not execute this document as SQL. **Target:** Supabase PostgreSQL schema `hive3`. **Date:** 2026-10-20.

**Sequencing:** The database-first development plan was approved 2026-10-20. Table definitions in this file are still proposed. **Inventory and drift:** `docs/HIVEFORYOU-V3-DATABASE-INVENTORY-P1.1.md` (P1.1, ready for review). A user-reported manual `hive3.hives` object is not a migration baseline and was not independently catalogued in P1.1.

## 1. Design constraints

- **One Hive, one current Canonical Study.** The study is one logical object with a mutable *current revision pointer* and immutable historical snapshots.
- **Intent-first and domain-optional.** Store customer intents and generated extraction schemas without requiring a Domain Pack row or registry.
- **Evidence-first.** Preserve document source, page/quote anchors, fact origin, confidence/uncertainty, derivations and user assertions distinctly.
- **Incremental reuse.** Every extraction run records which documents, intent, and dynamic schema it used. Facts can be reused by many analyses.
- **Minimal operational model.** No separate study per intent, giant graph subsystem, schema activation registry, shadow runs, or event-sourcing framework.
- **Ownership and privacy (OD-02).** User identity remains in `auth.users`; **all** application data in shared schema **`hive3`** (no per-user schemas/databases). Files stored in **private** Supabase Storage buckets, not large PDF blobs in relational rows. Isolation via ownership, RLS, storage policies, and Worker server-side checks.
- **Supported uploads (OD-01).** Initial `source_documents.mime_type` values: PDF, PNG, JPG, DOCX; per-file size limits configurable at implementation; Free-tier monthly successful-upload quota enforced outside or alongside `source_documents` (see requirements §3.2).
- **One execution path.** Web → Inngest → Oracle Worker → Python Reader → LiteLLM, with a single persistent run status model.

## 2. Tables proposed (16 total; logical groups)

### A. Ownership and intake (5)

| Table | Why it exists | Key columns / constraints |
|---|---|---|
| `hives` | Workspace boundary | `id uuid PK`, `owner_user_id uuid FK auth.users ON DELETE CASCADE` (OD-12; matches reported live FK), `name text NOT NULL`, `description text NULL`, `client_request_id text NOT NULL`, `created_at`, `updated_at`, `archived_at`; **`UNIQUE (owner_user_id, client_request_id)`** (create-Hive idempotency, P0.1 MD-01); index on `owner_user_id` |
| `hive_members` | User/pro collaboration, **only when sharing is in MVP scope** | `hive_id FK`, `user_id FK auth.users`, `role enum/text CHECK(owner,editor,viewer,professional)`, `created_at`, composite PK; defer table creation until role policy approved |
| `source_documents` | Registered uploads and immutable file identity | `id uuid PK`, `hive_id FK`, `uploaded_by uuid`, `filename`, `mime_type` (**OD-01:** PDF, PNG, JPG, DOCX initially), `byte_size`, `sha256`, `storage_path`, `status`, `created_at`, `deleted_at`; unique `(hive_id, sha256)` decision **open** (duplicate uploads may be legitimate) |
| `document_pages` | Page-level text/OCR and stable evidence locators | `id uuid PK`, `source_document_id FK`, `page_number int`, `text_storage_path` (or bounded text, decision pending), `extraction_status`, `created_at`; unique `(source_document_id,page_number)` |
| `intents` | User goals and clarifications within a Hive | `id uuid PK`, `hive_id FK`, `created_by`, `request_text`, `status`, `clarification_json jsonb`, `created_at`; multiple per Hive |

### B. Study processing (5)

| Table | Why it exists | Key columns / constraints |
|---|---|---|
| `study_runs` | Job attempts and operational diagnostics | `id uuid PK`, `hive_id FK`, `intent_id FK nullable`, `status`, `stage`, `trigger`, `idempotency_key` (**delivery dedupe only**; see P0.2), `correlation_id`, `started_at`, `finished_at`, `error_code`, `error_message_safe`, `model_alias`, `pack_version nullable`; **`UNIQUE (idempotency_key)`** or one key per enqueue envelope — **not** unique on `(hive_id, intent_id)` |
| `extraction_schemas` | Generated per-intent extraction specification (no registry) | `id uuid PK`, `hive_id FK`, `intent_id FK`, `schema_json jsonb`, `schema_hash`, `created_by_run_id FK`, `created_at`; validate JSON schema before use; immutable row |
| `extraction_batches` | Which Reader call covered which source and schema | `id uuid PK`, `study_run_id FK`, `source_document_id FK`, `extraction_schema_id FK nullable`, `status`, `raw_artifact_path nullable`, `validated_artifact_path nullable`, `error_code nullable`, `created_at`; **`UNIQUE (study_run_id, source_document_id, extraction_schema_id)`** for idempotent retries |
| `canonical_studies` | Exactly one logical Canonical Study per Hive | `id uuid PK`, `hive_id uuid UNIQUE FK`, `current_revision_id uuid nullable`, `created_at`, `updated_at`; pointer updated transactionally |
| `study_revisions` | Immutable snapshots of study state and version history | `id uuid PK`, `canonical_study_id FK`, `revision_number int`, `based_on_run_id FK nullable`, `snapshot_json jsonb` **or** private `snapshot_storage_path`, `created_at`, `created_by`; unique `(canonical_study_id,revision_number)`; never overwrite snapshots |

### C. Evidence and correction (3)

| Table | Why it exists | Key columns / constraints |
|---|---|---|
| `facts` | Reusable verified observations and labeled interpretations | `id uuid PK`, `hive_id FK`, `source_document_id FK nullable`, `document_page_id FK nullable`, `origin_batch_id FK nullable`, `kind` (observed/classification/derived), `subject_key`, `predicate`, `value_json jsonb`, `confidence nullable`, `verification_status`, `created_at`; **do not equate interpretation with source truth** |
| `fact_evidence` | One-to-many evidence anchors; quote/page for document claims | `id uuid PK`, `fact_id FK`, `source_document_id FK`, `document_page_id FK nullable`, `page_number`, `exact_quote nullable`, `location_json jsonb nullable`, `verification_status`, `created_at`; enforce evidence for source-backed verified facts via validation workflow |
| `user_assertions` | Corrections without erasing original facts | `id uuid PK`, `hive_id FK`, `fact_id FK nullable`, `created_by uuid`, `scope` (hive/intent), `intent_id nullable`, `assertion_json jsonb`, `reason nullable`, `created_at`, `retracted_at`; immutable meaning / append new assertions rather than destructive rewrites |

### D. Analyses and outputs (3)

| Table | Why it exists | Key columns / constraints |
|---|---|---|
| `analyses` | Intent-specific results attached to exact study revision | `id uuid PK`, `hive_id FK`, `intent_id FK`, `study_revision_id FK`, `created_by`, `result_json jsonb` or private artifact, `status`, `created_at`; each result pinned to a revision |
| `reports` | Customer/professional-generated outputs (**OD-04:** evidence-backed findings + provenance) | `id uuid PK`, `hive_id FK`, `analysis_id FK nullable`, `study_revision_id FK`, `audience` (customer/pro), `request_json jsonb`, `created_by`, `status`, `output_storage_path nullable`, `created_at`; independent runs/history |
| `report_claim_evidence` | Auditable link from a report claim to verified facts | `report_id FK`, `claim_id text`, `fact_id FK`, composite PK; no validated claim without linked evidence/derivation |

**Minimum initial migration recommendation:** implement ownership, uploads, intents, runs, schemas, one study/revisions, facts/evidence, and analyses/reports with explicit policy; `hive_members` is conditional on clarified MVP roles. Do not create unused extra tables simply to complete the inventory.

## 3. Relationships (cardinality)

```text
auth.users 1—N hives
hives 1—N source_documents 1—N document_pages
hives 1—N intents 1—N extraction_schemas
hives 1—N study_runs 1—N extraction_batches
source_documents 1—N extraction_batches
hives 1—1 canonical_studies 1—N study_revisions
hives 1—N facts 1—N fact_evidence
hives 1—N user_assertions
hives 1—N analyses N—1 study_revisions
hives 1—N reports N—1 study_revisions
reports N—M facts through report_claim_evidence
```

### 3.5 Canonical Study initialization (Milestone 1 — approved P0.1 MD-02)

- **Hive create (M1):** insert `hive3.hives` only; **no** `canonical_studies` row.
- **First successful study run (P1.5+):** insert `canonical_studies` for the Hive and the first `study_revisions` row per merge rules in `docs/ERROR-HANDLING-RECOVERY.md`.
- M1 UI may show an empty workspace at `/hives/[hiveId]` without a study pointer.

### 3.6 Account deletion (OD-12 — approved policy; future ticket)

Approved 2026-10-20. The Milestone 1 migration does not implement this lifecycle and does not add deletion tables.

| Step | Behavior |
|---|---|
| Request | Owner asks to delete the account. |
| Notify | Product tells the owner that deletion was requested and that recovery stays available for 30 days. |
| Retain | Auth user, owned `hive3` rows, and private storage objects remain for 30 days. |
| Recover | Owner can restore the account during those 30 days. `auth.users` is still present, so the Hive foreign key does not cascade. |
| Permanent cleanup | After 30 days without recovery, remove the auth user, owned database rows, and private storage objects. |
| Audit | Record the deletion so it can be traced without storing document contents, object bodies, credentials, or tokens. |

`hives.owner_user_id` uses **`ON DELETE CASCADE`**. That action fires when the permanent step removes `auth.users`. It is the reported live foreign-key behavior and the reviewed P1.2 target. Later child tables must be removable in that same permanent step (cascade or an equivalent ordered cleanup). Their foreign-key actions are specified when those tables are designed.

Future cleanup requirements: partial failure is recoverable; retries are idempotent; terminal states are explicit (recovered, permanently deleted, retries exhausted). Traces include correlation id, account id, step, and state only.

Hive archive (`archived_at`) and the Milestone 1 ban on `authenticated` DELETE are separate from account deletion.

## 4. Non-table database objects and invariants

- `CREATE SCHEMA hive3`; keep it independent of existing `hive`/public V2 schemas. Never modify or backfill V2 tables implicitly.
- **Private Storage**: bucket(s) for raw documents, Reader raw/validated artifacts, and exports; storage object names scoped by owner/hive; **bucket creation and storage policies are separate migration deliverables**.
- **RLS (OD-02)**: enable and test on every browser-accessible table. Owner is derived by membership/`hives.owner_user_id`; no user can supply arbitrary `owner_user_id` to read another Hive. Storage objects scoped by owner/hive with policies matching relational access. Any service-role bypass confined to trusted Oracle Worker with explicit server-side ownership and Hive-scope checks.
- **Cross-Hive integrity**: composite foreign keys or transaction-time validation for `hive_id` relationships so a report in Hive A cannot point to evidence in Hive B.
- **Revision correctness**: one `canonical_studies` row per Hive; `current_revision_id` must belong to that study; revisions monotonically numbered and immutable; **insert revision and advance pointer in one transaction** (P0.2). Reconcile unknown commit by `study_revisions.based_on_run_id = study_run_id`.
- **Run identity**: every Generate/Reprocess/Study action creates a new `study_runs.id`; failed runs do not block new runs. **OD-06:** no **unverified** fact from a failed run is merged into the Canonical Study; failed-run artifacts may be retained privately under an approved retention policy (duration: §6.5). Verifier-passed facts from a failed run may persist for reuse on later runs; **`current_revision_id` advances only on successful merge** with required coverage met (`docs/ERROR-HANDLING-RECOVERY.md`, **OD-07**).
- **Coverage (OD-07):** full Study run plans include all **eligible** `source_documents` for the Hive; targeted reprocess run plans persist explicit scope (documents/batches) and coverage outcome on `study_runs` (e.g. `request_json` / plan artifact) for UI and failure classification.
- **Status values**: short documented CHECK constraints (e.g. QUEUED/RUNNING/SUCCEEDED/FAILED), not a new configuration registry.
- **Safe error handling**: store sanitized `error_code` and message, stage and timestamps; detailed private traces are logs/artifacts, not raw exceptions or sensitive data in browser-readable columns.
- **Audits**: use `created_at`, `created_by`, run linkage and revision snapshots; defer a general event ledger unless acceptance tests require one. The OD-12 deletion audit is part of the future account-deletion ticket. Milestone 1 does not add that table.
- **Indexes**: FK columns, `(hive_id, created_at desc)` for documents/intents/runs/analyses/reports, `(canonical_study_id, revision_number desc)`, `(source_document_id,page_number)`, `facts(hive_id, subject_key, predicate)`; add indexes after measured query need.
- **Dynamic extraction**: `extraction_schemas.schema_json` is the approved *runtime-generated* JSON schema per intent; it is NOT a mandatory predefined domain registry. `facts.value_json` supports variable subject matter.

## 5. Worked workflows

**IEP L001:** user creates Hive → uploads 8 files → `source_documents` and page metadata → intent and schema → `study_runs` plus per-document `extraction_batches` → verified facts/evidence → one `canonical_studies` row and revision 1 → `analyses` and `reports` referencing revision 1.

**Grocery receipts:** 20 receipts + junk-food intent → facts and study revision 1 → organic-food intent → new extraction schema and only missing observed attributes extracted where possible → same study, revision 2 → distinct analyses linked to revisions. New Hive always gets a separate study.

**Correction:** user changes a classification → `user_assertions` linked to fact/intention and attributed to user → new study revision materializes the effective classification, preserving document evidence and earlier analysis/reports.

## 6. Open design decisions (resolve before migration)

1. **Access and sharing:** **M1 approved owner-only** (P0.1 MD-05); defer `hive_members` until professional/sharing policy is approved beyond M1.
2. **Fact identity:** normalized subject/predicate/value rows vs full `snapshot_json` with evidence index; current recommendation is compact facts/evidence tables plus a projection snapshot, but avoid dual sources of truth.
3. **Page text:** store bounded text in DB vs encrypted/private object storage; ensure exact quote/page verifier consistency.
4. **Artifact sizing:** JSONB snapshots or private storage pointer for potentially large Canonical Studies, reports, raw model output.
5. **Account deletion (OD-12):** **approved** 2026-10-20 — notification, 30-day retention, recovery, then permanent storage and database cleanup with a deletion audit. Processing waits for a future ticket. Milestone 1 keeps `hives.owner_user_id` **`ON DELETE CASCADE`** and adds no deletion tables. **Still open:** failed-run private-artifact retention duration (OD-06) and document-level delete versus physical object cleanup during ordinary Hive use.
6. **Scoping:** how `created_by` and role-based report access work when professionals collaborate.
7. **Idempotency and concurrency:** create-Hive idempotency on `hives (owner_user_id, client_request_id)` (P0.1 MD-01); delivery idempotency on `study_runs.idempotency_key` (resolved P0.2). **Concurrent runs per Hive** — implementation decision at P1.3/P1.5 (allow vs reject vs queue); not a P0 blocker.
8. **Evidence provenance:** allow non-document insights/interpretations explicitly; page may be absent for unpaginated files.
9. **Naming:** whether tables should use singular or plural conventions (proposed plural); SQL namespaces and Supabase API exposure.
10. **Migration baseline:** V3 isolated from V2; no copy of existing live customer data unless separately approved.

## 7. Database-first development plan amendment

**Status:** Sequencing **approved** 2026-10-20 in `docs/HIVEFORYOU-V3-DEVELOPMENT-PLAN-database-first-PROPOSED.md`. The table definitions in this design file remain proposed. P1.1 inventory does not close the open decisions in §6, except account deletion, which OD-12 approved on 2026-10-20 (implementation still deferred). Don't run migrations before a reviewed P1.2 script is separately approved.

| New ticket | Objective | Gate |
|---|---|---|
| **P1.1 — Database inventory** | Inventory `hive3` tables, relationships, ownership, lifecycle, storage, and access | ERD and entity dictionary reviewed. Open §6 decisions stay open until explicitly accepted. P1.1 evidence: `docs/HIVEFORYOU-V3-DATABASE-INVENTORY-P1.1.md` |
| **P1.2 — SQL + RLS design** | Create a reviewed migration for `hive3`, FKs/indexes/constraints, bucket policies and rollback/repair notes | SQL static review, no migrations executed |
| **P1.3 — Isolated database qualification** | With explicit approval, apply to **non-production** Supabase; test owner isolation, one-study uniqueness, revision concurrency, evidence references, and that `hives.owner_user_id` is `ON DELETE CASCADE`. Account-deletion notification, retention, recovery, cleanup, and audit are a later ticket | Reproducible SQL tests/logs and clean migration status |
| **P1.4 — Repository/app bootstrap** | Repo structure + UI/Worker/Reader independent builds/contracts | Three independent builds; no V2 dependency imports |
| **P1.5 — Integration** | UI → Inngest → Oracle → Reader → `hive3` write/read | Synthetic workflow and error state observed end-to-end |

After the database milestone, continue Reader → Canonical Study → Outputs → acceptance → release as already numbered in the approved development plan. Historical connectivity-first P1 IDs live only in that plan’s §4.1.

**No migration, repo changes, DB updates, production deployment, or paid model calls are authorized by this document.**
