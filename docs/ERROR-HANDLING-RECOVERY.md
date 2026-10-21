# HiveForYou V3 — Error Handling & Recovery

**Status:** Approved (P0.2).  
**Contract version:** `error-envelope@1`  
**Authority:** `docs/REPOSITORY-STRUCTURE.md`, this document, `packages/contracts`, `docs/adr/ADR-001-error-handling-recovery.md`.

## 1. Purpose

One consistent, production-supportable error-handling strategy across Vercel, Inngest, Oracle Worker, Oracle Reader, LiteLLM, and Supabase (`hive3`). No second orchestration system, retry queue, or error framework.

## 2. Ownership

| Concern | Owner |
|---------|--------|
| Workflow retries | **Inngest** (native step/function retries only) |
| Durable run status for UI and ops | **Supabase** `study_runs`, `extraction_batches` (Worker writes) |
| Failure classification, coverage gates, merge | **Oracle Worker** |
| Candidate extraction | **Oracle Reader** (no study pointer, no verified claims) |
| Model access | **Oracle LiteLLM** (exclusive path; fail closed on missing alias) |
| Browser-safe errors | **Vercel Web** (reads `study_runs`; never exposes internal diagnostics) |

## 3. Run identity and idempotency

### 3.1 Identifiers

| ID | Rule |
|----|------|
| **`study_run_id`** | New UUID for **every** intentional Generate, Reprocess, or Study action. |
| **`correlation_id`** | End-to-end support thread; propagated on all processing paths; stored on `study_runs`. |
| **`delivery_idempotency_key`** | Dedupes **duplicate delivery** of the same enqueue (double-submit, Inngest redelivery). Stored in `study_runs.idempotency_key`. Must **not** block a new run after failure or user retry. |

### 3.2 Idempotency rules

1. A new user action always creates a **new** `study_run_id`, even for the same intent or document set.
2. Duplicate delivery of **that** run must not repeat committed work (use run-scoped keys on batches, fact upserts, merge guard on `study_revisions.based_on_run_id`).
3. Failed runs do **not** prevent intentional new attempts.
4. Failed or partial runs must not delete or overwrite prior `current_revision_id`, `study_revisions`, `reports`, or `analyses`.

**SQL intent (P1.2):** `UNIQUE (delivery_idempotency_key)` or equivalent one-row-per-envelope scope. **Do not** use `UNIQUE (hive_id, intent_id)` on runs.

## 4. Retry ownership

- **Inngest** is the only retry scheduler for orchestration.
- Worker and Reader perform **one logical attempt per step invocation** (no nested HTTP/model retry loops).
- **Bounded inline DB retries only:** within a single Worker invocation, at most **3** immediate retries on classified `DB_TRANSIENT` (no backoff queue; Inngest owns backoff).

Classify each failure as **retryable** or **permanent**. Permanent failures use Inngest non-retriable failure so retries stop.

## 5. Error envelope (`error-envelope@1`)

Shared types: `packages/contracts`. Browser and public APIs use **only** the safe fields below.

```text
contract_version: "error-envelope@1"
error_code: string
category: auth | authorization | validation | not_found | storage | model | processing | dependency
retryable: boolean
message_safe: string
correlation_id: string
study_run_id?: string
stage?: string
```

**Internal diagnostics** (structured logs; never in browser JSON): `service`, `diagnostic_detail`, `extraction_batch_id`, `inngest_run_id`, `duration_ms`.

### 5.1 Core error codes

| Code | Category | Retryable |
|------|----------|-----------|
| `AUTH_FAILED` | auth | false |
| `ACCESS_DENIED` | authorization | false |
| `INVALID_REQUEST` | validation | false |
| `NOT_FOUND` | not_found | false |
| `STORAGE_UNAVAILABLE` | storage | true |
| `STORAGE_NOT_FOUND` | storage | false |
| `MODEL_UNAVAILABLE` | model | true |
| `MODEL_TIMEOUT` | model | true |
| `MODEL_OUTPUT_INVALID` | validation | false |
| `EVIDENCE_NOT_VERIFIED` | validation | false |
| `EXTRACTION_FAILED` | processing | false |
| `COVERAGE_INCOMPLETE` | processing | false |
| `MERGE_FAILED` | processing | false |
| `DB_TRANSIENT` | dependency | true |
| `DB_OUTCOME_UNKNOWN` | dependency | true |
| `DEPENDENCY_UNAVAILABLE` | dependency | true |

Extend codes only via ADR and contract version bump.

### 5.2 Inngest and HTTP semantics

- Worker steps invoked by Inngest **must fail the invocation** on business failure (throw / non-retriable error). **Never** return success with `{ ok: false }` or an error envelope in a 200 response.
- Idempotent completion (run already succeeded, merge already applied for this `study_run_id`) is a **successful** step return.
- Web enqueue returns **202** with `study_run_id`; terminal state is read from **`study_runs`**.

## 6. Processing stages

`study_runs.stage` values (ordered):

`enqueue` → `load_sources` → `plan_schema` → `extract` → `verify` → `merge_study` → `analyze` → `report` → `finalize`

`study_runs.status`: `QUEUED` | `RUNNING` | `SUCCEEDED` | `FAILED` | `CANCELLED`

Store only sanitized `error_code` and `error_message_safe` in DB columns readable via browser APIs.

## 7. Atomic Canonical Study updates

Merge commits in **one transaction**:

1. Insert `study_revisions` (`based_on_run_id = study_run_id`).
2. Update `canonical_studies.current_revision_id` to that revision.

No abandoned-revision lifecycle or orphan-revision sweeper in v1.

### 7.1 Unknown commit reconciliation

On connection loss after merge attempt, reconcile by **`study_run_id`** only:

1. If revision `R` exists with `R.based_on_run_id = study_run_id` and `current_revision_id = R.id` → already committed; continue pipeline.
2. If no such revision → re-run merge from verified inputs only (same atomic transaction).
3. If revision exists for run but pointer does not match → `MERGE_FAILED` (invariant violation; manual ops).

Log `DB_OUTCOME_UNKNOWN` during reconciliation; user may see `RUNNING` at `merge_study` with a safe “Confirming save…” message.

## 8. Partial processing failures

- Persist **`extraction_batches`**, storage artifacts, and **verifier-passed facts** linked to the run (reuse on later runs). **OD-06:** do not merge **unverified** facts from a failed run into the Canonical Study; failed-run artifacts retained privately only under an approved retention policy (`PRODUCT-REQUIREMENTS.md` §3.2).
- **Required document coverage** not met → terminal **`FAILED`**, `COVERAGE_INCOMPLETE` (or `EVIDENCE_NOT_VERIFIED` per doc).
- **Never** advance `current_revision_id` for an incomplete required set.
- **Never** mark run `SUCCEEDED` while promoting an under-qualified study.
- UI: failed run; per-document batch status; prior study and reports unchanged; **new action** uses a **new** `study_run_id`.

**Full Study (OD-07):** run plan includes **all eligible documents** in the Hive; all in-scope documents must pass required verification for promotion.  
**Targeted reprocess (OD-07):** run plan **explicitly records scope** (subset of documents/batches); required set is that scope — missing coverage → `COVERAGE_INCOMPLETE`.  
**L001:** eight logical documents — full Study over that Hive’s eligible set.  
**Grocery:** required set defined by the run plan (full Study vs incremental reprocess scope).

## 9. Observability

**Required log fields:** `timestamp`, `level`, `service`, `correlation_id`, `study_run_id`, `stage`, `error_code`, `retryable`, `duration_ms`.

**Propagation:** Web → Inngest event → Worker → Reader headers (`X-Correlation-Id`, `X-Study-Run-Id`, `X-Extraction-Batch-Id`) → LiteLLM metadata (IDs and alias only).

**Never log:** secrets, tokens, prompts, completions, document text, signed URLs with credentials.

## 10. Verification matrix (acceptance)

| Scenario | Expected |
|----------|----------|
| New attempt after FAILED | New `study_run_id`; prior revision/reports intact |
| Duplicate Inngest delivery | No duplicate revision or verified facts |
| Model timeout | Step fails; Inngest retries; no nested model loop |
| Malformed model output | Permanent; study pointer unchanged |
| Storage transient / missing | Retryable vs permanent per code table |
| Auth / access denied | Permanent; no run side effects |
| L001 one doc fails | `FAILED`; pointer unchanged; batch detail visible |
| Grocery incremental failure | Prior revision 1 intact; explicit unsuccessful run |
| Interrupted / unknown merge | Reconcile by `study_run_id`; at most one current revision from that run |

## 11. Requirements vs implementation-time decisions

**Resolved at P0.1 (2026-10-20) — `PRODUCT-REQUIREMENTS.md` OD-07:**

1. **Full Study:** all **eligible documents** in the Hive must be accounted for in the run plan and meet required verification for merge.
2. **Targeted reprocess:** run plan must **explicitly record scope** and **coverage outcome**; incomplete required scope → terminal failure.

**Resolved at implementation (not P0 design blockers):**

| Decision | Owner tickets | Notes |
|----------|---------------|--------|
| LiteLLM alias configuration and ownership | P2.1, P5.3 | Role-specific aliases; fail closed on missing alias |
| Worker–Reader HTTP integration | P2.1, P1.5 | Versioned shapes in `packages/contracts`; no browser→Reader |
| Service-to-service authentication | P1.4, P1.5, P5.3 | Secrets out of Git; patterns at bootstrap/integration |
| Numeric Inngest retries and HTTP/model timeouts | P1.5, P5.3 | Inngest owns orchestration backoff; no nested loops in Worker/Reader |
| **Concurrent runs per Hive** (allow, reject, or queue) | P1.3, P1.5 | Separate from delivery idempotency (P0.2) |

P0.2 closure: 2026-10-20. See `docs/adr/ADR-001-error-handling-recovery.md` and `docs/NEXT.md`.
