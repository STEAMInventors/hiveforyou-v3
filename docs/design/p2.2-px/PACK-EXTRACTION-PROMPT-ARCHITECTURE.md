# Selected-Domain-Pack Extraction and Prompt Architecture

**Ticket:** P2.2-PX.D — Domain Pack Extraction Design and Prompt Architecture  
**Status:** **PROPOSED (design, 2026-10-24)** — documentation only. Nothing in this file is implemented. Contract names, columns and JSON shapes are **proposed**, not accepted contracts.  
**Scope:** Extraction when a reviewed Domain Pack is **selected and pinned** for a study run. **Generic / no-Pack extraction is DEFERRED** (its existing P2.2 implementation is unchanged by this ticket; the pack-free grocery 20 → 30 release gate remains **mandatory**).  
**Authority:** `docs/ARCHITECTURE.md`, `docs/DOMAIN-PACK-DESIGN-GUIDE.md` §14, `docs/ERROR-HANDLING-RECOVERY.md` (P0.2, approved), `docs/HIVEFORYOU-V3-DEVELOPMENT-PLAN-database-first-PROPOSED.md` §3.1, `docs/HIVEFORYOU-V3-DATABASE-DESIGN-v0.1.md`.  
**Acceptance:** `docs/acceptance/P2.2-PX-pack-extraction-L001.md`.

Marking convention: **[UNVERIFIED]** = depends on the deployed Oracle LiteLLM gateway, provider or model and has not been checked against real configuration (no gateway configuration exists in this repository; only `infra/oracle/*.config.env.example` and the Worker/Reader HTTP clients). **[PROPOSED CODE]** = an error code that does not exist in `error-envelope@1` today and requires an ADR before use.

---

## 1. Decisions

| # | Decision |
|---|---|
| D1 | When a Domain Pack is selected, the **Pack owns the document-type taxonomy and the complete fact catalog**. The model identifies document types and extracts **only** catalog-defined facts. |
| D2 | **No model-driven schema-generation stage** on the selected-Pack path: `generate_schema` and `supplement_schema` are not invoked. The catalog is compiled deterministically from the validated pack. |
| D3 | **User intent never enters the extraction prompt** and cannot add fact definitions. Intent drives `plan_questions` / study planning only. Extraction is therefore reusable across intents within the same Hive. |
| D4 | **Python Reader = source text preparation only** (native text, DOCX, OCR via the existing P2.1 OCR alias, page boundaries, quality, fingerprint). **TypeScript Worker owns extraction model orchestration** and deterministic validation. All model calls route through Oracle LiteLLM. |
| D5 | One **versioned, byte-stable system prompt per (pack version, template version, output contract version)**, identified by `prompt_digest`. Document content is only in the user message. |
| D6 | The compiled prompt is stored **once per unique `prompt_digest`** (immutable), not duplicated per study run. Runs and batches **reference** the digest and versions. |
| D7 | Validation is **fact-level**: a malformed fact is rejected and recorded; other valid candidates are preserved. A document fails only when its extraction is **unusable** (§8.3). |
| D8 | Prompt caching is an **optimization, never a correctness dependency**. No cache-reuse ratio is a release requirement until provider, gateway, context limits and cache telemetry are verified. |
| D9 | Existing `error-envelope@1` codes only; anything new (notably `PAYLOAD_TOO_LARGE`) is **[PROPOSED CODE]** pending ADR. |
| D10 | Existing stage enum is reused (no migration): `plan_schema` = deterministic pack load + prompt compile/lookup; `extract` = model call + validation + persistence. |

Non-goals: generic/no-Pack redesign, changes to the existing generic P2.2 code path, P2.3 verification promotion, Canonical Study merge, investigation execution, Writer.

## 2. Component ownership

```mermaid
sequenceDiagram
  participant W as Worker
  participant R as Reader
  participant G as OracleLiteLLM
  participant DB as Postgres
  W->>W: "plan_schema: load pinned pack, validate, compile prompt, prompt_digest"
  W->>DB: "insert-if-absent pack_extraction_prompts by prompt_digest"
  W->>R: "POST /v1/read-document (text preparation only)"
  R-->>W: "pages, boundaries, quality, read_fingerprint"
  W->>G: "extract_pack_document: system = stable prefix, user = pack-extraction-input@1"
  G-->>W: "pack-extraction-output@1 + usage"
  W->>W: "deterministic fact-level validation, disposition"
  W->>DB: "idempotent insert extraction_batches (JSONB + digests + usage)"
```

| Concern | Owner | Notes |
|---|---|---|
| Source read, OCR, page boundaries, `read_fingerprint` | **Reader** (`POST /v1/read-document`, `reader-document-read@1`) | Unchanged P2.1 contract. OCR model calls stay a text-preparation step via `READER_OCR_LITELLM_ALIAS`. |
| Pack load, validation, pinning | **Worker** (`apps/worker/src/packs/`) using **Core** validators | Reviewed packs only; pinned id/version/digest. |
| Canonicalization, deterministic ordering, partition plan, completeness proof | **Core** (domain-neutral) | No IEP logic. |
| Prompt compile, digest, prompt-store lookup | **Worker** | Template text versioned in Worker; inputs only from validated pack. |
| Extraction model call | **Worker** → Oracle LiteLLM | New role alias (proposed) `WORKER_P2_EXTRACTION_LITELLM_ALIAS`; fail closed if unset. |
| Provider routing, cache-control injection, response-cache disablement, log redaction | **Oracle LiteLLM gateway** (operator, P5.3) | **[UNVERIFIED]** |
| Validation and disposition | **Worker** | Deterministic; no model involvement. |
| Persistence | **Worker** via service-role RPCs | Proposed Gate 2b tables (§10). |
| Verification / promotion | **P2.3** (Worker) | Out of scope; everything here stays an **unverified candidate**. |

The Reader `POST /v1/extract-candidates` route and `READER_P2_REASONING_LITELLM_ALIAS` are **not used on the selected-Pack path**. They remain in place for the existing generic P2.2 implementation, which this ticket does not change.

## 3. Prompt layers and message boundaries

Each extraction request has exactly two messages. Nothing else is sent (no tools, no assistant prefill).

### 3.1 System message — stable, reusable, non-private prefix

One content block, assembled in this fixed order from the template `pack-extraction-system@1`:

| Section | Source | Content |
|---|---|---|
| `[HIVE EXTRACTION RULES]` | `hive-extraction-rules@1` (fixed Worker text) | Universal rules (§3.3). |
| `[DOMAIN PACK]` | validated pack | `pack_id`, `pack_version`, `pack_canonical_digest`, domain id/label/description. |
| `[DOCUMENT TYPES]` | `document_types[]` | `document_type_id`, label, author role, title/title-only/body/negative signals, filename patterns, `disambiguation_priority`, `min_pages`, `classification_policy`, `checklist` (record types expected), reading note for that type. |
| `[CLASSIFICATION RULES]` | fixed text + pack signals | Title / first-page identity before body mentions; negative signals; compound documents as page segments; ties retained as `AMBIGUOUS`; types outside the catalog → `UNRECOGNIZED`. |
| `[FACT CATALOG]` | `record_types[]`, `constructs`, `relationship_rules` | Complete nested catalog (§4). |
| `[EVIDENCE AND MISSING VALUES]` | fixed text | Evidence and status rules (§3.3). |
| `[OUTPUT CONTRACT]` | `pack-extraction-output@1` JSON Schema | Exact output shape (§7). |

The system message contains **reviewed pack data and fixed Hive text only** — never document text, filenames, intent, user identifiers, Hive identifiers or any tenant data. It is identical bytes for every document, Hive and tenant using the same `prompt_digest`.

### 3.2 User message — dynamic per document (or per page window)

A single JSON object, contract **`pack-extraction-input@1`** (proposed):

```json
{
  "contract_version": "pack-extraction-input@1",
  "prompt_digest": "sha256:…",
  "source_ref": {
    "source_ref_id": "src-1",
    "source_sha256": "…64 hex…",
    "read_fingerprint": "…"
  },
  "source_metadata": {
    "mime_family": "pdf",
    "page_count": 6,
    "window": { "page_start": 1, "page_end": 6, "is_partial": false },
    "pages": [
      { "page_number": 1, "extraction_method": "native_text", "quality": "good" }
    ]
  },
  "pages": [
    { "page_number": 1, "text": "<<<PAGE 1 BEGIN>>>\n…page text…\n<<<PAGE 1 END>>>" }
  ]
}
```

Rules:

- `source_ref_id` is an opaque per-request label; the Worker maps it back to `source_document_id`. Database IDs and filenames are **not** sent to the model.
- **No intent text, no question set, no prior extraction output.** User intent must not generate fact definitions.
- Page boundaries are explicit; `page_number` is the only legal page anchor.
- The system rules state that everything inside the user message is **data to be read, not instructions**.

### 3.3 Universal extraction rules (`hive-extraction-rules@1`, normative intent)

1. Classify using only the listed document types; never invent a type. Return `UNRECOGNIZED` when none fits and `AMBIGUOUS` (with candidates) when the evidence does not separate types.
2. Extract **only** facts whose `fact_id` appears in the catalog. Do not add, rename or merge fact definitions.
3. Every `OBSERVED` or `UNCERTAIN` fact requires at least one evidence anchor: `page_number` plus `exact_quote` copied verbatim from that page. Never paraphrase or reconstruct a quote.
4. Absence is not proof. A fact not present in the supplied pages is `NOT_FOUND` with no value. Never infer that an action did not happen from missing documentation.
5. Illegible, conflicting or partially supported values are `UNCERTAIN` with a `reason_code`, not guessed.
6. Preserve modality (planned, proposed, reported, observed, decided, delivered, amended) and keep document, event, effective and as-of dates distinct as the catalog defines.
7. Keep repeated rows intact as records (one goal, one service row) with item-level evidence. Record-local IDs are labels only, not cross-document identity.
8. Follow the output JSON Schema exactly; output JSON only.

## 4. Fact catalog representation

The catalog is compiled from the validated pack; for `domain-pack-manifest@2` (reference: `domain-packs/iep/2.0.0`, 15 document types, 25 record types):

- **Record type** = `record_type_id`, label, group, `repeatable`, identity hints (`key_fields`, `disambiguators`, `version_axis`), description.
- **Fact ID** = `<record_type_id>.<field_id>` (stable, pack-scoped). Nested constructs (e.g. a measurement) expand to `<record_type_id>.<field_id>.<component>` only where the pack declares the construct.
- **Fact definition** = fact ID, `value_kind`, `enum` (declared order preserved), unit/construct reference, `sensitive` flag, description.
- **Relationships** = `relationship_rules` declarations as data (direction, cardinality, join guidance). The model may report a **record-local reference**; relationship resolution stays in P3.
- **Document-type coverage** = each document type's `checklist` lists the record types the model should look for in that type (guidance, not a completeness claim).

Completeness rule: the compiled catalog contains **every** `fact_id` in the pinned pack. The compiler computes `catalog_fact_count` and a sorted fact-ID list digest (`catalog_digest`) and fails compile if any declared field cannot be represented. Facts are never silently dropped (see §6 for size handling).

The `@3` candidate (`docs/design/p2.2-dp.d/iep-manifest@2.CANDIDATE.json`, ~151 KB, `concepts` / `relationships` shape) is the sizing case for §6; its loader is P2.2-DP.I scope and is not assumed here.

## 5. Assembly, canonicalization and versioning

1. **Input:** only a validated, reviewed, pinned pack (`review_status: reviewed`); draft packs are rejected before compile.
2. **Deterministic ordering:** document types sorted by `document_type_id`; record types by `record_type_id`; fields by `field_id`; enum values in **declared** order (order is meaningful); object keys sorted.
3. **Canonical serialization:** RFC 8785 JSON Canonicalization Scheme (JCS) for every JSON section; UTF-8; LF line endings; no trailing whitespace; fixed section delimiters.
4. **No interpolation of untrusted text:** pack strings enter only as JSON-encoded values inside delimited sections; template prose is fixed Worker text. Document text never enters the system message. Pack validation rejects control characters and section-delimiter sequences in pack strings.
5. **Digests (all SHA-256, lowercase hex):**

| Digest | Over |
|---|---|
| `pack_digest` | Raw manifest bytes (existing `computePackDigest`, `packages/core/src/schema-hash.ts`). |
| `pack_canonical_digest` (proposed) | JCS of the validated, normalized manifest (stable across whitespace/key-order edits). |
| `catalog_digest` | Sorted list of all fact IDs. |
| `output_schema_digest` | JCS of the `pack-extraction-output@1` JSON Schema instance. |
| `prompt_digest` | Exact UTF-8 bytes of the rendered system message. |

6. **Version identity:** `prompt_digest` changes whenever `hive-extraction-rules@N`, `pack-extraction-system@N`, pack content, output contract version or serializer changes. A version label is never mutated in place; edits require a new version.
7. **Reproducibility:** re-compiling the same inputs must reproduce the same `prompt_digest`; the stored prompt (§10.1) is compared on insert.

Illustrative rendered skeleton (not an implemented template):

```text
[HIVE EXTRACTION RULES hive-extraction-rules@1]
…fixed rules text…
[DOMAIN PACK]
{"domain":{"id":"iep","label":"Special Education / IEP"},"pack_canonical_digest":"sha256:…","pack_id":"iep","pack_version":"2.0.0"}
[DOCUMENT TYPES]
[{"author_role":"education_agency","checklist":["document_header","student","goal","service"],"document_type_id":"iep.plan","label":"Individualized Education Program","match":{…}}, …]
[CLASSIFICATION RULES]
…fixed text…
[FACT CATALOG]
{"record_types":[{"facts":[{"fact_id":"document_header.document_date","value_kind":"date"}, …],"record_type_id":"document_header","repeatable":false}, …]}
[EVIDENCE AND MISSING VALUES]
…fixed text…
[OUTPUT CONTRACT pack-extraction-output@1]
{…JSON Schema…}
```

## 6. Context-size handling

Budgets are per alias runtime configuration: `max_input_tokens`, `output_reserve_tokens` **[UNVERIFIED — real limits unknown]**. Token counts are estimated conservatively from UTF-8 byte length (tokenizer per model unknown **[UNVERIFIED]**); the estimate must over-count.

| Mode | When | Behavior |
|---|---|---|
| **A — single call** (default) | prefix + document + output reserve fit | One call with the full catalog and full document. |
| **B — page windows** | document too large; prefix fits | Same system prefix (cache-friendly); user message covers a contiguous page window with a one-page overlap; `window.is_partial=true`. Each window is a separate batch row. Cross-window record identity is **not** resolved here (P3). |
| **C — pack partitions** | prefix alone exceeds budget | Compile-time deterministic partition plan (below). |

**Partition plan (Mode C only, bounded):**

1. A **classification prefix** contains all document types and classification rules, no fact catalog. One classification call per document.
2. **Extraction partitions** group document types; each partition contains the transitive closure of record types in those types' `checklist`, plus referenced constructs and relationship declarations. Partitions are ordered and sorted deterministically; each has its own `prompt_digest`.
3. **Completeness proof:** union of all partition fact IDs = full catalog (`catalog_digest`), stored with the partition plan. Compile fails if the proof fails.
4. The classified document type(s) select the partition(s) to call. A compound document may require more than one partition.
5. If a single document type's closure cannot fit, **compile fails** at pack qualification time — never at runtime by dropping facts.
6. Partitioning is used **only** when Mode A/B cannot fit; the IEP 2.0.0 manifest (~60 KB raw) is expected to fit Mode A **[UNVERIFIED until a real context limit is known]**.

Output truncation (`finish_reason = length`) is never accepted as a partial result (§9).

## 7. Output contract — `pack-extraction-output@1` (proposed)

Illustrative response (not an implemented contract):

```json
{
  "contract_version": "pack-extraction-output@1",
  "prompt_digest": "sha256:…",
  "source_ref_id": "src-1",
  "classification": {
    "status": "CLASSIFIED",
    "primary_document_type_id": "iep.evaluation.speech_language",
    "candidates": [
      { "document_type_id": "iep.evaluation.speech_language", "rank": 1,
        "evidence": [{ "page_number": 1, "exact_quote": "Speech-Language Evaluation Report" }] }
    ],
    "segments": [
      { "document_type_id": "iep.evaluation.speech_language", "page_start": 1, "page_end": 6 }
    ]
  },
  "records": [
    {
      "record_type_id": "document_header",
      "record_local_id": "r1",
      "segment_index": 0,
      "facts": {
        "document_header.document_date": {
          "status": "OBSERVED",
          "value": "2025-03-14",
          "evidence": [{ "page_number": 1, "exact_quote": "Date of Report: March 14, 2025" }]
        },
        "document_header.effective_end": { "status": "NOT_FOUND" }
      },
      "children": []
    }
  ],
  "missing_facts": [
    { "fact_id": "document_header.refers_to_plan_date", "status": "NOT_APPLICABLE" }
  ],
  "ambiguities": [
    { "kind": "value_conflict", "fact_ids": ["…"], "reason_code": "two_dates_for_same_event",
      "evidence": [{ "page_number": 2, "exact_quote": "…" }] }
  ]
}
```

| Element | Rules |
|---|---|
| `classification.status` | `CLASSIFIED` \| `AMBIGUOUS` \| `COMPOUND` \| `UNRECOGNIZED`. `AMBIGUOUS` keeps ranked candidates; `COMPOUND` requires non-overlapping `segments` covering declared pages. Every `document_type_id` must be in the pack. |
| `records[]` | `record_type_id` from catalog; `record_local_id` unique within output; `segment_index` refers to `segments`; repeated rows are separate records; nested repeated rows in `children[]`. Non-repeatable record types appear at most once per segment. |
| `facts{}` | Keys are catalog `fact_id`s belonging to that record type. `status`: `OBSERVED` \| `UNCERTAIN` \| `NOT_FOUND` \| `NOT_APPLICABLE`. `OBSERVED`/`UNCERTAIN` require `value` matching `value_kind`/`enum` and ≥ 1 evidence anchor; `UNCERTAIN` also requires `reason_code`. `NOT_FOUND`/`NOT_APPLICABLE` carry no `value`. |
| Evidence anchor | `{ page_number, exact_quote }`; page must be within the request window; quote is verbatim from that page. |
| `missing_facts[]` | Explicit catalog facts not found at document level (optional summary; never a substitute for `NOT_FOUND` inside a present record). |
| `ambiguities[]` | Classification, segment, identity or value ambiguities with `reason_code` and evidence. |

Model output is **untrusted**. All candidates remain unverified until P2.3.

## 8. Deterministic validation — `pack-extraction-validation@1` (proposed)

### 8.1 Fact-level and record-level rejection (the default)

The Worker validates each fact and record independently. A failed item is **rejected and recorded**; all other valid candidates are **preserved**.

| Validation reason code (disposition-level; not `error-envelope@1` codes) | Applies to | Effect |
|---|---|---|
| `UNKNOWN_FACT_ID` | fact | fact rejected |
| `FACT_NOT_IN_RECORD_TYPE` | fact | fact rejected |
| `TYPE_MISMATCH` / `ENUM_INVALID` | fact | fact rejected |
| `MISSING_EVIDENCE` | `OBSERVED`/`UNCERTAIN` fact without anchor | fact rejected |
| `PAGE_OUT_OF_RANGE` | anchor | fact rejected if no valid anchor remains |
| `QUOTE_NOT_IN_PAGE` | anchor (normalized-whitespace substring check against the read page text) | fact rejected if no valid anchor remains |
| `VALUE_WITH_NON_OBSERVED_STATUS` | fact | fact rejected |
| `UNKNOWN_RECORD_TYPE` | record | record rejected |
| `DUPLICATE_NON_REPEATABLE_RECORD` | record | later duplicates rejected |
| `SEGMENT_REF_INVALID` | record | record rejected |

The quote check here is a cheap structural guard, not P2.3 verification; it never promotes a candidate.

### 8.2 Disposition

| Document disposition | Meaning |
|---|---|
| `VALID` | Usable; no rejections. |
| `VALID_WITH_REJECTIONS` | Usable; ≥ 1 fact/record rejected. Accepted candidates preserved, rejections listed with reason codes. |
| `UNRECOGNIZED` | Classification `UNRECOGNIZED`; no facts expected; recorded for coverage. No generic fallback on this path (generic is deferred). |
| `UNUSABLE` | Extraction cannot be used (§8.3). Document fails. |

Validation output (illustrative):

```json
{
  "contract_version": "pack-extraction-validation@1",
  "disposition": "VALID_WITH_REJECTIONS",
  "counts": { "records": 14, "facts_accepted": 61, "facts_rejected": 2, "records_rejected": 0 },
  "rejections": [
    { "path": "/records/3/facts/goal.target", "reason_code": "MISSING_EVIDENCE" },
    { "path": "/records/5/facts/service.minutes_per_week", "reason_code": "TYPE_MISMATCH" }
  ],
  "validator_version": "pack-extraction-validator@1"
}
```

### 8.3 When a document is `UNUSABLE`

Only when the extraction as a whole cannot be trusted or used:

- Response is not parseable JSON, or not a JSON object.
- `contract_version` or `prompt_digest` does not match the request.
- `classification` missing, or names a `document_type_id` outside the pack, or `COMPOUND` segments are invalid/overlapping.
- Output truncated (`finish_reason = length`).
- Required top-level structure absent (`records` not an array).

A document with zero accepted facts but a valid structure is **not** `UNUSABLE`: it is `VALID`/`VALID_WITH_REJECTIONS` with explicit `NOT_FOUND`s or rejections, and coverage reflects it.

## 9. Failure handling

Existing `error-envelope@1` codes (approved P0.2) with safe `reason` diagnostics; retry ownership unchanged (Inngest only; no nested model retries; ≤ 3 inline `DB_TRANSIENT` retries).

| Failure | Code (existing unless marked) | Retryable | Behavior |
|---|---|---|---|
| Selected/pinned pack missing, corrupt or unreviewed | `INVALID_REQUEST` (`reason: pack_not_available` / `pack_invalid` / `pack_not_reviewed`) | false | Run fails at `plan_schema`; no model call; no generic fallback. |
| Prompt compile or catalog completeness failure | `EXTRACTION_FAILED` (`reason: catalog_incomplete` / `prompt_compile_failed`) | false | Run fails at `plan_schema`; no model call. |
| Extraction alias not configured | `DEPENDENCY_UNAVAILABLE` (`reason: alias_not_configured`) | true (config) | Fail closed; no direct-provider fallback. |
| Context budget exceeded before call (no mode fits) | `EXTRACTION_FAILED` (`reason: context_budget_exceeded`) | false | Document fails; no call. |
| Provider rejects for context length | `EXTRACTION_FAILED` (`reason: context_length_exceeded`) | false | Document fails; budget config flagged. |
| 429 / 5xx / network | `MODEL_UNAVAILABLE` | true | Inngest retries the step. |
| Timeout | `MODEL_TIMEOUT` | true | Inngest retries the step. |
| Malformed / truncated / structurally unusable output | `MODEL_OUTPUT_INVALID` (`reason: output_not_json` / `output_truncated` / `contract_mismatch` / `classification_invalid`) | false | Document `UNUSABLE`; safe metadata persisted (§10.3). |
| Individual fact/record invalid, missing evidence, wrong fact ID | — (validation reason codes, §8.1) | — | Fact/record rejected; document stays usable. |
| Unrecognized document type | — (`UNRECOGNIZED` disposition) | — | Recorded; coverage decides run outcome. |
| Database transient | `DB_TRANSIENT` | true | ≤ 3 inline retries, then Inngest. |
| Database outcome unknown | `DB_OUTCOME_UNKNOWN` | true | Read back by idempotency key before any re-insert. |
| Same idempotency key, different content hash | `INVALID_REQUEST` (`reason: batch_hash_conflict`) | false | Conflict surfaced; no overwrite. |
| Payload exceeds JSONB cap | **Until ADR:** `EXTRACTION_FAILED` (`reason: payload_too_large`). **[PROPOSED CODE]** `PAYLOAD_TOO_LARGE` after ADR. | false | §10.3; no truncation; no silent Storage spill. |
| Required coverage not met (OD-07) | `COVERAGE_INCOMPLETE` | false | Run `FAILED`; no pointer advance. |

Duplicate or interrupted runs: batch inserts are idempotent per key (§10.2); redelivery of a committed document is a successful no-op. The prior accepted Canonical Study revision is never touched by this stage. Provenance requirements are never weakened to recover from a failure.

## 10. Persistence (PostgreSQL; proposed Gate 2b — not applied)

All tables in `hive3`, RLS forced, **no `authenticated` policies**, writes and reads via `service_role` Worker RPCs only. Insert-only; no updates to stored content. Requires separately authorized SQL.

### 10.1 `hive3.pack_extraction_prompts` — compiled prompt, stored once per digest

| Column | Notes |
|---|---|
| `prompt_digest text PK` | SHA-256 of system bytes. |
| `prompt_template_version`, `extraction_rules_version`, `output_contract_version` | e.g. `pack-extraction-system@1`, `hive-extraction-rules@1`, `pack-extraction-output@1`. |
| `pack_id`, `pack_version`, `pack_digest`, `pack_canonical_digest`, `catalog_digest`, `output_schema_digest` | Pins. |
| `partition_id text NULL`, `partition_plan_digest text NULL` | Mode C only. |
| `system_text text` | The exact compiled prompt (pack data + fixed Hive text; **no tenant data**). Size-capped. |
| `prompt_byte_length int`, `estimated_prompt_tokens int` | Diagnostics. |
| `created_at`, `first_study_run_id` | Audit only. |

Insert-if-absent: same digest + same bytes → no-op; same digest + different bytes → hard failure (`reason: prompt_digest_collision`). Not Hive-scoped because it contains no tenant data; still not browser-readable.

**Run reference (no duplication):** each run records the digests it used in a small existing-mechanism artifact on `hive3.study_run_artifacts`, kind `pack-extraction-ref@1` (`pack_id`, `pack_version`, `pack_digest`, `prompt_digest`(s), template/rules/output versions, partition plan digest) — **digests and versions only, no prompt text**. `study_runs.pack_version` remains the run-level pin. Each `extraction_batches` row also carries `prompt_digest` (FK).

### 10.2 `hive3.extraction_batches` — one row per document (or page window / partition)

Amends the design v0.1 row (`raw_artifact_path` / `validated_artifact_path`) for the selected-Pack path; generic-path columns are untouched until the deferred design.

| Group | Columns |
|---|---|
| Identity | `id`, `hive_id`, `study_run_id`, `source_document_id`, `source_sha256`, `read_fingerprint` |
| Pins | `prompt_digest FK`, `pack_id`, `pack_version`, `pack_digest`, `output_contract_version`, `partition_id NULL`, `page_start`, `page_end` |
| Model | `model_alias`, `provider_model NULL` (if gateway returns it), `gateway_request_id NULL` |
| Usage | `input_tokens`, `output_tokens`, `cached_input_tokens NULL`, `cache_write_tokens NULL`, `cache_status` (`HIT` \| `PARTIAL` \| `MISS` \| `NOT_REPORTED`), `latency_ms`, `finish_reason` |
| Output | `extraction_json jsonb NULL` (complete parsed model output), `extraction_sha256`, `extraction_byte_length` |
| Validation | `validation_json jsonb`, `disposition` (`VALID` \| `VALID_WITH_REJECTIONS` \| `UNRECOGNIZED` \| `UNUSABLE`), `validator_version` |
| Status | `status` (`SUCCEEDED` \| `FAILED`), `error_code NULL`, `error_reason NULL` (safe), `created_at` |

Keys:

- **Idempotency:** `UNIQUE (study_run_id, source_document_id, prompt_digest, page_start)`; same key + same `extraction_sha256` → no-op; different → conflict.
- **Same-Hive reuse lookup:** `(hive_id, source_sha256, read_fingerprint, prompt_digest, model_alias)` with disposition `VALID`/`VALID_WITH_REJECTIONS`. Reuse **never crosses Hives**, even for identical bytes.
- Hive-scoped composite FKs (`hive_id` matches run and source).

### 10.3 Safe persistence and oversized payloads

- **Retained in Postgres:** complete structured extraction JSON (`extraction_json`) and complete `validation_json`. These contain verbatim quotes from private documents and are protected by the same Hive-scoped, service-role-only boundary as `document_pages`.
- **Never persisted or logged:** secrets, gateway keys, auth tokens, raw HTTP bodies, the user message (page text is already in `document_pages`), and private document content in **diagnostic logs or error columns**. `error_reason` is an allowlisted code string only.
- **Unparseable output:** `extraction_json = NULL`; persist `extraction_sha256` of raw bytes, `extraction_byte_length`, `finish_reason`, `error_code`, `error_reason`. Raw unparseable text is not stored (no reproducible structure, may contain anything).
- **Oversized payloads:** `extraction_json` cap ~1 MiB (`octet_length(extraction_json::text)`; exact value implementation-time, consistent with Plan Rev 2 A4 tiers). If exceeded: **no truncation, no silent Storage spill**; batch row inserted with `status = FAILED`, `extraction_json = NULL`, `extraction_sha256`, `extraction_byte_length`, and error `EXTRACTION_FAILED` / `reason: payload_too_large` (until the **[PROPOSED CODE]** `PAYLOAD_TOO_LARGE` ADR is approved). Prevention: the planner sizes `output_reserve` and Mode B windows so expected output fits; a recurring oversize is a pack/window configuration defect.
- **Retention:** failed-run batches are private artifacts under OD-06; duration remains database design §6.5.

## 11. Prompt caching contract (provider-neutral)

### 11.1 Contract

1. **Prefix:** the entire system message; byte-identical per `prompt_digest`; contains no user-private or tenant data.
2. **Breakpoint placement:** at the **end of the system block only**; never on user content. Preferred mechanism: gateway-side injection on the extraction alias (e.g. LiteLLM `cache_control_injection_points` targeting the system message) so the Worker stays provider-neutral. **[UNVERIFIED — deployed LiteLLM version and support]**
3. **Correctness independence:** a cache miss, an unsupported provider or absent telemetry produces the same output contract and validation path. A miss **never** triggers a retry or alternate route.
4. **Eligibility:** caching is only meaningful when the prefix exceeds the provider minimum; the compiler records `estimated_prompt_tokens` so operators can see eligibility.
5. **Warm-up (optional, configurable):** process the first document of a run before fanning out with bounded concurrency so later documents can read the cache. This is a latency/cost optimization only.
6. **Invalidation:** new `prompt_digest`, alias change, provider model change, or provider TTL expiry. No manual cache purging is designed.
7. **Fallback:** provider without prompt caching → full input billed; `cache_status = NOT_REPORTED` or `MISS`.

### 11.2 Privacy and tenant isolation

- The cached prefix holds reviewed pack data only; sharing it across tenants exposes no tenant data by construction.
- **LiteLLM response/semantic caching must be disabled** for the extraction alias (it would store completions containing private quotes). **[UNVERIFIED]**
- **LiteLLM request/response logging must redact message content** for the extraction alias. **[UNVERIFIED]**
- Providers with **automatic** prefix caching may cache user-message tokens as well; whether that is acceptable is a provider data-handling question that requires explicit approval under OD-02. **[UNVERIFIED]**
- Extraction batch reuse (§10.2) is Hive-scoped; provider caching never substitutes for, or bypasses, Hive authorization.

### 11.3 Provider capability matrix — all **[UNVERIFIED against deployed gateway/models]**

| Provider family | Mechanism | Minimum prefix | Lifetime | Usage telemetry |
|---|---|---|---|---|
| Anthropic (direct, Bedrock, Vertex) | Explicit `cache_control: {"type":"ephemeral"}` on a content block (up to 4 breakpoints) | ~1024 tokens (most models); ~2048 (smaller models) | ~5 min default, optional ~1 h at higher write cost | `cache_creation_input_tokens`, `cache_read_input_tokens` |
| OpenAI / Azure OpenAI | Automatic prefix caching; optional `prompt_cache_key` (would be `prompt_digest`) | ~1024 tokens, 128-token increments | Minutes of inactivity; longer retention on some models | `prompt_tokens_details.cached_tokens` |
| Google Gemini / Vertex | Implicit caching on newer models; explicit `cachedContents` with TTL | Model-dependent (~1024–4096) | Implicit: provider-managed; explicit: configured TTL | `cached_content_token_count` |
| Other / self-hosted | Varies or none | — | — | Often none → `NOT_REPORTED` |

LiteLLM normalizes some usage fields (`prompt_tokens_details.cached_tokens`) and may pass provider-specific fields through. Exact field availability on the deployed version is **[UNVERIFIED]**.

### 11.4 Measurement (observability only, not a release threshold)

Per batch: `input_tokens`, `cached_input_tokens`, `cache_write_tokens`, `cache_status`. Per `prompt_digest`: hit ratio and effective input cost. **No cache-reuse percentage is a release requirement** until the provider, gateway configuration, context limits and cache telemetry are verified; a target may be set by a later approved ticket.

## 12. Observability

Structured log fields (no prompts, page text, quotes, completions, filenames or intent):

`timestamp`, `level`, `service`, `correlation_id`, `study_run_id`, `stage`, `extraction_batch_id`, `source_document_id`, `pack_id`, `pack_version`, `pack_digest`, `prompt_digest`, `prompt_template_version`, `partition_id`, `page_start`, `page_end`, `model_alias`, `provider_model`, `input_tokens`, `cached_input_tokens`, `cache_write_tokens`, `cache_status`, `output_tokens`, `latency_ms`, `finish_reason`, `disposition`, `facts_accepted`, `facts_rejected`, rejection reason-code counts, `error_code`, `retryable`, `duration_ms`.

LiteLLM `metadata`: `correlation_id`, `study_run_id`, `extraction_batch_id`, `task: "extract_pack_document"`, `prompt_digest` — IDs and digests only.

## 13. Illustrative gateway request (not an implemented contract)

```json
{
  "model": "<WORKER_P2_EXTRACTION_LITELLM_ALIAS>",
  "response_format": { "type": "json_object" },
  "max_tokens": "<output_reserve_tokens>",
  "metadata": {
    "correlation_id": "…", "study_run_id": "…", "extraction_batch_id": "…",
    "task": "extract_pack_document", "prompt_digest": "sha256:…"
  },
  "messages": [
    { "role": "system", "content": [ { "type": "text", "text": "<compiled system prompt>" } ] },
    { "role": "user", "content": "<pack-extraction-input@1 JSON>" }
  ]
}
```

`cache_control` is shown absent because placement is preferred at the gateway; if the gateway cannot inject it, the Worker may attach `{"cache_control":{"type":"ephemeral"}}` to the **system** content block only, gated by alias configuration. Structured-output mode (`json_schema` strict vs `json_object`) depends on provider support **[UNVERIFIED]**; validation (§8) is authoritative either way.

## 14. Proposed implementation sequence (future P2.2-PX.I; each step separately approved)

1. `packages/contracts`: `pack-extraction-input@1`, `pack-extraction-output@1`, `pack-extraction-validation@1`, `pack-extraction-ref@1` types + validators.
2. `packages/core`: JCS canonicalization, `pack_canonical_digest`, `catalog_digest`, deterministic ordering, partition plan + completeness proof (domain-neutral).
3. `apps/worker`: prompt compiler (`pack-extraction-system@1`, `hive-extraction-rules@1`), budget estimator, mode selection.
4. `apps/worker` LiteLLM client: content-block system message, `usage` parsing (cached/write tokens, `cache_status`), new alias `WORKER_P2_EXTRACTION_LITELLM_ALIAS` (fail closed).
5. `apps/worker` extract stage on the selected-Pack branch: call, fact-level validator, disposition. The generic P2.2 branch (`generate_schema` / `supplement_schema`, Reader extract route) is **left unchanged**.
6. SQL (separate authorization): Gate 2b `pack_extraction_prompts` + `extraction_batches` columns + service-role RPCs + readonly qualification.
7. `apps/worker` persistence: prompt insert-if-absent, batch idempotent insert, same-Hive reuse, `pack-extraction-ref@1` artifact.
8. Gateway (operator, P5.3): alias, cache injection, response-cache disabled, content-log redaction — **verify and record actual capabilities**.
9. Mocked tests per acceptance doc; then live L001 with explicit paid-call authorization; then record measured cache telemetry.

## 15. Risks and unresolved items

| Item | State |
|---|---|
| Deployed LiteLLM version, provider/model behind the alias, `cache_control_injection_points` support, response-cache and content-logging settings | **[UNVERIFIED]** — operator to confirm (P5.3) |
| Real context limit, output limit, tokenizer per model | **[UNVERIFIED]** — determines Mode A/B/C thresholds |
| Provider data handling for automatically cached user content | Requires OD-02 approval |
| `PAYLOAD_TOO_LARGE` error code | **[PROPOSED CODE]** — ADR required; interim mapping `EXTRACTION_FAILED` / `payload_too_large` |
| `pack_extraction_prompts` + amended `extraction_batches` | Proposed Gate 2b SQL; not applied |
| Strict JSON-schema output mode availability | **[UNVERIFIED]**; validator remains authoritative |
| Real L001 PDFs not in repo (text snippets only in `apps/worker/src/plan/l001-corpus.fixture.ts`) | Live tier needs the external synthetic files |
| Selected-Pack runs that also have intent needs outside the catalog | By design not extracted; surfaced by planning/coverage, not by schema generation |
| Generic / no-Pack path | **DEFERRED**; existing implementation unchanged; pack-free grocery gate mandatory |
