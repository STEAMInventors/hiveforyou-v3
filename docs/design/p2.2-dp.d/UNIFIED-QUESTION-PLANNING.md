# Unified Question Planning — finalized design

**Ticket:** P2.2-DP.D  
**Status:** **CLOSED (design, 2026-10-22)** — documentation and persistence assessment only; not runtime  
**Date:** 2026-10-22  
**Normative pack instance (unchanged domain content):** `docs/design/p2.2-dp.d/iep-manifest@2.CANDIDATE.json`  
**Qualification:** `docs/design/p2.2-dp.d/IEP-PACK-QUALIFICATION.md` §12  
**Authority:** `docs/DOMAIN-PACK-DESIGN-GUIDE.md` §13, `docs/ARCHITECTURE.md`, `docs/ERROR-HANDLING-RECOVERY.md`

This document corrects the initial P2.2-DP.D question-planning proposal. It does **not** change IEP domain intelligence: **19** document types, **27** concepts, **23** relationships, **18** investigations, **2** views, **4** canonical questions (Q01–Q04), or `domain-pack-manifest@3` / `CANDIDATE_NOT_IMPLEMENTED`.

---

## 1. Purpose

Turn authorized uploader intent and an optional pinned Domain Pack question catalog into:

1. A **frozen**, deduplicated `study-question-set@1` per `study_run_id`.
2. A bounded `study-plan@1` that reuses verified Canonical Study facts and accepted findings before scheduling new work.
3. A `study-question-coverage@1` artifact that separates **evidence coverage** from **answer status**.

One Hive, one evolving Canonical Study. Pack-free grocery uses the same planner with an empty catalog.

---

## 2. Resolved design decisions (before → after)

| Topic | Before (initial proposal) | After (this document) |
|-------|---------------------------|------------------------|
| Equivalence | Semantic similarity + fixed auto-merge thresholds | **Structured equivalence only.** Similarity may *nominate* a catalog link; it never proves merge. |
| Ambiguous match | Threshold band “no merge” | **Never discard** uploader atomics; keep distinct `study_question_id`s; optional `related_catalog_question_id`. |
| Narrow vs broad | Could merge into one question | **Remain distinct**; may **share** investigation `run_key` and findings. |
| CORE investigations | Treated as “execute” | **CORE = required binding** for a selected question; execution follows reuse + prerequisite checks. |
| Investigation budget | Hard default cap of 12 | **Configurable bounded budget** (`WORKER_QUESTION_PLAN_MAX_INVESTIGATIONS` or run policy); explicit deferral, never silent truncate. |
| Coverage | Single status enum | **Split:** `evidence_coverage` vs `answer_status`; partial evidence cannot yield complete answer. |
| Q04 / professional | Baseline whenever IEP pack pinned | **Relevance-based** (trigger policy + scope + intent); pack pin alone does not select Q04. |
| Question set mutability | Unclear re-plan after classify | **Frozen** at end of `plan_questions`; classification **re-evaluates prerequisites** only (does not add/remove merged questions). |
| Model calls | Decompose + match possibly separate | **One bounded structured LiteLLM call** (decomposition + catalog match proposals), deterministic validation after. |
| Error codes | New pack/plan codes suggested | **Reuse `error-envelope@1` codes** unless ADR proves a diagnostic gap. |
| Intent storage | In question-set artifact | **Verbatim intent in authorized private storage**; artifacts hold `intent_id` + hash only. |
| Planning failure | Prior study intact (stated) | **Explicit:** terminal `FAILED`, no `current_revision_id` advance; prior revision and coverage from last success remain authoritative. |
| Persistence | New tables assumed | Prefer **`study_runs` / run-scoped artifact storage** when P1.P lands; if insufficient, **future schema approval** documented in §10. |

---

## 3. Processing sequence

| Step | Stage | Behavior |
|------|-------|----------|
| 1 | `plan_questions` (early) | Capture `intent_id`, store verbatim text in **private** store; artifact records hash + id only. |
| 2 | `plan_questions` | One LiteLLM structured call → atomic questions + spans + flags + **proposed** catalog links (`question_id`, not merge decisions). |
| 3 | `plan_questions` | Deterministic catalog selection (trigger policy, scope signals, relevance); **no persona gate**. |
| 4 | `plan_questions` | Deterministic merge/split using **equivalence features** (§4). |
| 5 | `plan_questions` | Emit **frozen** `study-question-set@1`. |
| 6 | `load_sources` / classify | Existing P2.2 classification; **does not mutate** question set membership. |
| 7 | `plan_schema` + compile | Build `study-plan@1`: reuse scan → prerequisite evaluation → schedule **missing** investigations only (§5). |
| 8 | extract → verify → merge → analyze | Existing pipeline. |
| 9 | `analyze` / finalize | Emit `study-question-coverage@1` (§6). |

**Prerequisite reevaluation (step 6–7 boundary):** After document types and source scope are known, recompute which investigations are **eligible to execute** (e.g. `service_commitment_versus_delivery` only when `service_delivery_observation` exists in verified snapshot or in-scope upload). Eligibility changes **execute flags** and coverage expectations; it does **not** add/remove `merged_questions`.

---

## 4. Semantic matching and deduplication

### 4.1 Principles

- **Similarity ≠ equivalence.** Embedding or lexical similarity is a **hint** for operators and UX, not a merge proof.
- **Every uploader atomic question** appears in at least one `merged_questions[].origins` entry until explicitly closed by product rules (never by match failure).
- **Ambiguous** catalog association: retain atomic; set `match_status: "ambiguous"`; do **not** merge.

### 4.2 Equivalence features (all must align to merge)

When combining an uploader atomic with a catalog question (or two atomics), merge **only if** deterministic checks pass:

| Feature | Rule |
|---------|------|
| **Subject** | Same student/subject scope, or both unspecified and same default Hive subject policy. |
| **Time period** | Same explicit interval (e.g. “last year”, “since 2024 amendment”) or both unspecified. |
| **Population / domain slice** | Same goal area, service type, or document class when the wording implies one (e.g. “reading” vs “all goals”). |
| **Document scope** | Same referenced doc types or “current plan” vs “entire upload”. |
| **Qualifiers** | Modality preserved: progress vs delivery vs eligibility vs meeting prep. |

**Examples (must stay distinct):**

- Narrow: “Is my child on track for **reading** fluency?”  
- Broad: “How is my child progressing **overall**?” (maps toward Q02 but **not** merged with the narrow question.)

Both may bind `goal_progress_alignment` with different `parameter_scope_hash` values; findings may still be **reused** when scope overlaps (§5).

**Catalog link without merge:** `catalog_question_id` on a **hybrid** entry only when equivalence passes; otherwise `related_catalog_question_ids: ["Q02"]` on the dynamic entry.

### 4.3 Dedup log

Every merge or explicit non-merge emits `deduplication_log[]` with `decision: "merged" | "kept_distinct"`, `reason_codes[]`, and preserved `origins`.

---

## 5. Investigation execution

### 5.1 Priority classes (binding vs execution)

| Class | Meaning |
|-------|---------|
| **CORE** | Investigation is **required** to fully address the selected question’s declared bindings. |
| **CONDITIONAL** | Required only when prerequisites or explicit intent justify it. |
| **SUGGESTED** | Follow-up; not scheduled unless budget and policy allow. |

**CORE does not mean “run automatically.”**

### 5.2 Scheduling order

1. **Reuse verified assertions** from pinned `based_on_revision_id` when coverage proof shows they satisfy plan inputs.
2. **Reuse accepted findings** from prior revisions when `run_key` matches (investigation id + parameters + evidence scope + pinned revision inputs).
3. **Evaluate pack preconditions** and verified snapshot (post-classify refresh).
4. **Schedule** only investigations where derived work is still missing.
5. **Deduplicate** scheduled runs by:

```text
run_key = sha256(
  investigation_id,
  operator_id,
  operator_version,
  parameter_scope_hash,
  evidence_scope_hash,
  based_on_revision_id | snapshot_id
)
```

6. Apply **configurable budget** (max investigations, max new reads, max reasoning calls). On exhaustion: mark remaining as `deferred_reason: "BUDGET_EXHAUSTED"`, set coverage accordingly (§6); **never** claim run-complete for affected questions.

### 5.3 IEP illustration

`goal_progress_alignment` shared by Q01, Q02, Q03, and a narrow uploader reading question → at most **one** execution per distinct `parameter_scope_hash`; all linked questions reference the same finding in coverage.

`service_commitment_versus_delivery` with no delivery observation → **not scheduled**; evidence gap only (`identify_gap` / UNRESOLVED), never non-delivery.

---

## 6. Question coverage (`study-question-coverage@1`)

### 6.1 Split dimensions

Each `study_question_id` carries:

**Evidence coverage** (`evidence_coverage`):

| Value | Meaning |
|-------|---------|
| `NOT_ASSESSED` | Run not finished. |
| `IN_SCOPE_COMPLETE` | Declared dimensions for this question have required evidence types present in **reviewed scope**, or explicit NOT_FOUND with scope proof. |
| `IN_SCOPE_PARTIAL` | Some dimensions satisfied; others missing in upload. |
| `OUT_OF_SCOPE` | Question asks beyond reviewed documents (documented scope boundary). |
| `BLOCKED` | Verify/merge/plan failure prevents assessment. |

**Answer status** (`answer_status`):

| Value | Meaning |
|-------|---------|
| `NOT_EVALUATED` | No finding yet. |
| `SUPPORTED` | Sufficient verified assertions/findings to answer within pack safe output rules. |
| `PARTIAL` | Some sub-parts answered; material gaps remain. |
| `UNRESOLVED` | Insufficient or incompatible evidence. |
| `NOT_FOUND_IN_REVIEWED_SCOPE` | Explicit scoped search found no record (not proof of non-occurrence). |

**Invariant:** `answer_status` ∈ {`SUPPORTED`} requires `evidence_coverage` ∈ {`IN_SCOPE_COMPLETE`} **and** no required CORE investigation still `NOT_EXECUTED` or `UNRESOLVED` when that investigation is prerequisite for the answer. Partial evidence → at most `PARTIAL` or `UNRESOLVED`.

### 6.2 Required fields per item

- `reviewed_scope`: source ids, document types, date window used.
- `missing_evidence[]`: typed codes (e.g. `progress_report_absent`).
- `investigation_dispositions[]`: `run_key`, disposition, deferred reason.
- `supporting_assertion_ids`, `supporting_finding_ids`.
- **Never** infer service non-delivery or event non-occurrence from absence alone.

Legacy single `status` in pack JSON maps to **`answer_status`** for backward compatibility in manifest docs; implementations emit both fields.

---

## 7. Budgets

Configured per environment / run policy (not hardcoded):

| Budget | Purpose |
|--------|---------|
| `max_investigations_executed` | Cap new investigation runs this study run. |
| `max_model_reasoning_calls` | Includes the single plan_questions call + schema supplements. |
| `max_new_sources_read` | OD-07 alignment. |

**Prioritization:** (1) uploader-selected merged questions by priority, (2) CORE bindings for those questions, (3) CONDITIONAL with satisfied prerequisites, (4) SUGGESTED only if budget remains.

**On exhaustion:** Persist completed investigations and verified facts; emit `deferred_investigations[]` on `study-plan@1`; coverage shows `IN_SCOPE_PARTIAL` / `UNRESOLVED` with `deferred_reason: BUDGET_EXHAUSTED`; run may still `SUCCEEDED` with **incomplete answer** flags — **never** silent truncate or “complete” wording for deferred items.

---

## 8. Contracts (summary)

Full TypeScript/JSON schemas belong in `packages/contracts` at **P2.2-DP.I**. Normative fields:

### `study-question-set@1`

- Private intent: `intent_id`, `text_hash` only in artifact.
- Frozen after step 5; `frozen_at`, `content_hash`, `planner_version`.
- `merged_questions[]` with `origins[]`, optional `catalog_question_id`, `equivalence_class_id`.
- `investigation_bindings[]` with `priority_class` only (execution in study plan).

### `study-plan@1`

- `study_question_set_hash`, `reuse_summary`, `investigation_execution_plan[]` with `execute`, `run_key`, `skip_reason`, `deferred_reason`.
- `budgets` applied and `budget_outcome`: `WITHIN_BUDGET` | `PARTIAL_DEFERRED`.

### `study-question-coverage@1`

- Per question: `evidence_coverage`, `answer_status`, scope, missing evidence, dispositions.

---

## 9. Error handling and privacy

| Condition | Code | Notes |
|-----------|------|-------|
| Bad catalog / dangling refs at load | `INVALID_REQUEST` | Fail closed for required pack. |
| Model timeout (plan call) | `MODEL_TIMEOUT` | Inngest retry; no partial freeze without valid set. |
| Invalid model JSON | `MODEL_OUTPUT_INVALID` | Terminal; prior revision intact. |
| Budget / incomplete required work | `COVERAGE_INCOMPLETE` or succeeded with explicit partial coverage | No false complete answers. |
| Storage / intent read failure | `STORAGE_*` | Per error table. |

**Logging:** `correlation_id`, `study_run_id`, `stage`, `study_question_set_hash`, pack pin, counts (`atomic`, `merged`, `scheduled`, `reused`, `deferred`), reason codes. **Never** log verbatim intent, document text, quotes, or model payloads.

**Intent storage:** Supabase private column or storage object keyed by `intent_id` + Hive RLS — exact column **P1.P schema approval** if not already present.

---

## 10. Persistence

**Preferred:** Attach artifact JSON to durable run record (`study_runs.metadata` or `study_run_artifacts` when approved in database-first plan).

**If no suitable column yet:** Worker holds artifacts in run-scoped object storage; design stands; **blocker:** schema ADR for artifact retention and browser-safe status projection.

Planning failure: no new revision; UI reads last `SUCCEEDED` run coverage.

---

## 11. Component ownership

| Layer | Role |
|-------|------|
| **Core** | Equivalence feature validation, `run_key` hashing, pack ref validation, budget defaults parser. |
| **Worker** | `plan_questions`, study plan compile, reuse scan, coverage emission, LiteLLM call. |
| **Reader** | None (extract only). |
| **Web** | Submit intent; never receive private catalog or raw intent in logs. |

---

## 12. Remaining blockers (implementation)

1. P1.P / `study_runs` artifact columns.  
2. P2.2-DP.I `@3` loader and views/outcomes parser.  
3. P3.I investigation executor and finding reuse API.  
4. LiteLLM alias for structured question planning (P5.3).  
5. ADR only if `COVERAGE_INCOMPLETE` vs partial success semantics need a new code.

---

## 13. Verification

Acceptance matrix: `IEP-PACK-QUALIFICATION.md` §12. No automated run executed for this documentation ticket.
