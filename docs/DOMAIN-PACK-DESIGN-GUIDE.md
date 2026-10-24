# HiveForYou — Universal Domain Intelligence Pack Design Guide

**Version:** 1.3 — selected-Domain-Pack extraction amendment §14 (2026-10-24); 1.2 question-driven study planning amendment (design only)  
**Date:** 2026-10-22  
**Status:** Proposed update; not an implemented parser contract  
**Unified planner (normative detail):** `docs/design/p2.2-dp.d/UNIFIED-QUESTION-PLANNING.md`  
**Aligned with:** Approved `ARCHITECTURE.md` and `DEVELOPMENT-PLAN.md` dated 2026-10-22  
**Governing principle:** A reviewed pack makes Hive knowledgeable about a domain; Hive remains intelligent without a pack.

## 1. Purpose and product acceptance

HiveForYou converts an authorized set of documents and a user's changing intent into **one evolving Canonical Study**, then produces evidence-grounded answers and discovers meaningful relationships, disagreements, changes, trends and gaps. A Domain Intelligence Pack (DIP) is a **versioned, declarative knowledge package**. It does not contain case-specific facts, run executable code, create a separate workflow or own a Canonical Study.

**The acid test:** An engineer or domain specialist adds a reviewed pack and public domain metadata; the same Web, Worker, Reader and Core code can recognize and reason about the new domain. Another Hive with no pack still processes unfamiliar documents and builds a useful study. Adding a new domain must not require a new processor, database ontology, provider route, UI enum, or custom investigation implementation.

**User outcomes:** Answer arbitrary relevant queries; preserve earlier facts and revisions across new documents and intents; surface defensible *non-obvious* findings; produce consistent customer and authorized professional answers from one pinned study; show the source or derivation for every factual statement; distinguish unobserved, unknown, contradictory and unverified information.

## 2. Responsibility boundaries

| Responsibility | Universal engine | Pack declaration |
|---|---|---|
| Read/OCR, page/source hashing | Reader P2.1 | Nothing executable |
| Classification / matching | Worker + generic matcher | Document taxonomy, positive/negative/title signals |
| Schema planning, candidate extraction (generic path) | Worker + Reader P2.2 | — (no pack) |
| Selected-Pack extraction (P2.2-PX, proposed) | Worker compiles prompt from validated pack and calls Oracle LiteLLM; Reader prepares source text only | Complete fact catalog (record types, fact IDs, types, enums, relationships), document taxonomy and classification signals, reading notes |
| Evidence verification | Worker P2.3 | Additional evidence expectations; never overrides verification |
| Entity identity, temporal reconciliation, study revisions | Worker/Core P3 | Domain semantic keys, relationship types, modality and time guidance |
| Investigate and derive findings | Allowlisted generic operators P3.I | Operator bindings, preconditions, expected coverage, caveats |
| Answers / reports / access control | Generic Writer P4 + auth | Terminology, audience explanation guidance (not access grants) |
| Regulatory analysis | Separately approved capability | Optional dated/jurisdiction-scoped references and guidance |

**Trust ladder:** source bytes → page artifact → **unverified** candidate → verified observation → reconciled assertion/relationship in study → **derived** finding → narrative claim with linked support. Pack metadata and statutory references are never evidence that a fact occurred in a customer's documents.

## 3. Authoring principles (non-negotiable)

1. **Optional**: no pack → dynamic intent/content schema, generic identity/investigation capabilities. The generic/no-Pack extraction design is **deferred** (existing implementation unchanged; pack-free grocery release gate retained). When a pack **is** selected, it is the complete extraction catalog (§14).
2. **Declarative**: JSON, typed data, no callbacks, SQL, arbitrary code, executable expressions or prompts that override system policy.
3. **Concept-centered, document-aware**: document types locate evidence; concepts represent reusable real-world meaning, not one document's flat fields.
4. **Record-oriented**: keep associated row/item attributes together, including row-level evidence (one goal, service row, transaction or receipt line item).
5. **Evidence-first**: absent documentation is not proof an action did not occur; concepts and examples never manufacture a customer fact.
6. **Identity is tentative**: record-local references and model IDs are not cross-document identity proof. Capture match attributes, disambiguation and uncertainty.
7. **Time and modality matter**: distinguish planned, proposed, reported, delivered, observed, amended and derived; distinguish document/event/effective/as-of dates.
8. **Investigations are proposals**: a pack binds concepts to **allowlisted** operators; only the universal engine validates inputs and emits derived findings.
9. **Personas share truth**: different customer/pro wording is allowed; no separate extracted facts or weaker claim checks for professionals.
10. **Immutable releases**: review status, semantic pack version, content digest and contract version are separate; never silently upgrade a pinned run.

## 4. Pack anatomy: five sections

### A. Discovery — what document is this?

**Author:** `pack_id`, version, reviewed status, domain label/description, public domain-level pill and starter intents, document taxonomy, document types, likely author roles, title/heading/body signals, negative signals, ambiguous/compound-document handling, expected document *guidance* (not rigid completeness claims).

**Rules:** Prefer title/first-page identity to incidental body mentions. Preserve cross-domain and within-domain ties. User-selected pill is a hint, not proof of classification. Multi-document PDFs may contain different logical document types. Public pill metadata is a safe, sanitized projection; document-type labels are separate from front-page **domain** pills.

### B. Concepts — what does a datum mean?

Define **first-class semantic record types**, not just extraction fields. Each concept describes purpose, attributes/types, enums/units, repeated nested records, optionality, reading hints, value source modality, temporal axes, evidence granularity, reusable vs intent-focused relevance, and identity candidate keys with disambiguators. Support generic scalar, object, array-of-record, date, quantity and measurement shapes; compile to an explicitly bounded extraction JSON-schema subset.

**Fact catalog completeness (selected-Pack extraction, §14):** every extractable datum must be declared with a stable, pack-scoped fact ID (`<record_type_id>.<field_id>`), a value kind, declared enum order where applicable, and evidence granularity. Anything not declared is not extracted when the pack is selected — the model cannot add fields and intent cannot generate them. Keep IDs stable across pack versions where meaning is unchanged.

**Measurement contract:** value, unit, denominator, method/instrument, conditions/population, observed date and source are distinct; a comparison is invalid until compatible or explicitly transformed under a validated rule. **Document reference** and **subject identity** are distinct attributes. Do not make a generated `goal_id` or `transaction_id` the sole cross-source join key.

### C. Relationships — how do documents form a story?

Declare typed links between concepts, supported direction/cardinality, candidate join attributes and contextual compatibility rules (same person/account/goal, period, author/party, effective date). Capture link provenance and confidence; uncertain links stay unresolved. Include change/scoped amendment semantics and source-attributed disagreements without `latest document wins` logic.

### D. Investigations — what can Hive discover?

Declare **bindings** to the universal operator registry, not ad hoc scripts. Each investigation contains operator ID/version, input concept/field mappings, required evidence and scope, preconditions, successful and unresolved outcomes, and safe suggested questions. Candidate core operators: `compare_measurements`, `compare_commitment_observation`, `detect_change`, `find_disagreement`, `trace_flow`, `aggregate`, `identify_gap`.

All derived findings must record: pinned snapshot, input verified assertion IDs, operator/version, parameters, compatibility/coverage checks, result, caveats and disposition (`SUPPORTED_DERIVATION`, `UNRESOLVED`, `REJECTED`). Model may propose an operator but cannot invent operator code or upgrade a candidate directly to an established finding.

### E. Communication — what does each audience need?

Provide domain vocabulary, harmless explanations, plain-language replacements for jargon, typical user questions, reviewer-oriented evidence organization and domain-specific *cautionary language*. The pack must **not** grant access, dictate a finding, suppress contradictory evidence or authorize advice outside validated scope. Customer and professional outputs use the **same underlying pinned facts and findings**.

### Optional regulatory overlay

Separate from extraction knowledge. Version authoritative sources with jurisdiction, effective dates, last reviewed date, citations and supersession. Regulatory content can inform conditional professional-review questions but not masquerade as source facts or declare legal eligibility/violations. Regulatory evaluation and maintenance are separately ticketed and reviewed.

## 5. Logical file layout and pack release rules

```text
domain-packs/
  <pack_id>/
    <semver>/
      manifest.json             # five-section declaration, no case data
      public-metadata.json      # generated sanitized domain pill index
      references/              # optional separately governed material
      tests/                   # synthetic fixture and expected behavior specs
```

Keep the base authoring experience to **one main manifest**. Additional files are optional, not mandatory new service boundaries. `domain-pack-manifest@2` is the **proposed contract version**; `iep/2.0.0` is only a **candidate pack release number**; these are not interchangeable. Preserve existing `@1` loads and `iep/1.0.0` as historical assets. The implementation must define deterministic JSON canonicalization and digest behavior, explicit pins and a safe public projection.

**Pack lifecycle:** draft → schema checked → expert-reviewed → fixture-qualified → published as immutable reviewed version → pinned by study run. Runtime should not load draft packs for production decisions, silently skip a corrupt reviewed catalog entry, pick “highest semver” without deployment/pin policy, or automatically change existing studies to newer pack versions. Missing optional pack permits generic extraction; explicitly required unavailable pack fails with actionable configuration diagnostics.

## 6. Illustrative JSON specification — NOT currently executable

The following is intentionally a **compact schema specimen**, not the actual contract accepted by the current V3 parser. `@2` contract finalization must reconcile existing `@1` fields and V2 v0.3 before writing production JSON.

```json
{
  "contract_version": "domain-pack-manifest@2",
  "pack_id": "iep",
  "pack_version": "2.0.0",
  "review_status": "draft",
  "discovery": {
    "domain": {"id": "iep", "label": "Special Education / IEP"},
    "intake_ui": {"pill_enabled": true, "pill_label": "IEP", "starter_intents": ["Help me understand the educational plan", "What changed over time?"]},
    "document_types": [
      {"id": "iep_plan", "title_signals": ["Individualized Education Program"], "negative_title_signals": ["Progress Report"], "concepts": ["goal", "service_commitment", "educational_need"]},
      {"id": "iep_progress_report", "title_signals": ["Progress Toward Annual Goals"], "concepts": ["progress_measurement"]}
    ]
  },
  "concepts": {
    "goal": {
      "fields": {"domain_area": "string", "description": "string", "baseline": "measurement", "target": "measurement", "effective_period": "date_range"},
      "identity": {"candidate_keys": ["student_ref", "domain_area", "description"], "disambiguators": ["effective_period", "measurement_method"]},
      "evidence": "per_observed_field"
    },
    "progress_measurement": {
      "fields": {"value": "measurement", "observed_at": "date", "goal_reference": "string"},
      "evidence": "per_observed_item"
    }
  },
  "relationships": [
    {"type": "reports_progress_on", "from": "progress_measurement", "to": "goal", "match_guidance": ["same_student", "goal_text_and_area", "effective_period_overlap"], "ambiguous": "unresolved"}
  ],
  "investigations": [
    {"id": "goal_progress_alignment", "operator": "compare_measurements", "inputs": {"target": "goal.target", "observed": "progress_measurement.value"}, "preconditions": ["verified_inputs", "linked_goal", "compatible_measure", "compatible_period"], "on_insufficient_evidence": "UNRESOLVED"}
  ],
  "communication": {
    "customer": {"reading_level": "plain_language", "concerns": "neutral_questions"},
    "professional": {"detail": "evidence_dense"}
  }
}
```

**Reminder:** draft specimen intentionally omits actual L001/V2 field catalog, full grammar, operator registry definition, normative validator schema, identity evidence policy and runtime compatibility adapters. Those must be designed/validated against real repository sources, not guessed from this example.

## 7. Domain design workflow — repeatable authoring recipe

**Phase 1 — Outcome and evidence:** Define 3–5 real customer intents, professional intents where appropriate, source types, disclosure/privacy boundaries, and unacceptable false conclusions. Include one *unknown* question the pack should handle via dynamic schema (generic path, deferred). When the pack is selected, an uncatalogued question is not extracted — it surfaces through planning/coverage, and the remedy is a reviewed catalog addition (§14).

**Phase 2 — Document corpus:** Acquire permitted synthetic/sanitized representative files; list logical document types, title zones, cross-document references, date formats, compound PDF boundaries, author roles. Do not infer document taxonomy solely from frontend chips.

**Phase 3 — Concept inventory:** Identify domain entities, events, claims, commitments, measurements, decisions; group repeated rows into coherent record types; define field semantics, measurement compatibility, identity and time axes. For IEP, reconcile V2 v0.3 authoritative record types/keys/fields rather than fabricating equivalents.

**Phase 4 — Graph and investigations:** Define evidence-safe links; select generic operators; write preconditions, missing-evidence behavior and a question answered by each investigation. Limit pack to high-value patterns; do not encode every conceivable user question.

**Phase 5 — Personas and release:** Define domain-level public pill metadata, reader-friendly vocabulary and professional guidance. Validate schema, privacy, operator allowlist, source provenance and backward compatibility. Publish reviewed pack plus tests, digest and explicit pin.

**Phase 6 — Qualify:** Run on complete fixture corpus and arbitrary intent variations. Inspect actual candidate records, verified page quotes, entity joins, temporal conclusions, unresolved cases, derived findings and customer/pro outputs. Compare with a no-pack generic baseline to demonstrate added value rather than only fixture matching.

## 8. Domain examples and the pack-free invariant

| Five sections | IEP pack | Medicaid financial-review pack | No-pack groceries |
|---|---|---|---|
| Discovery | Evaluation, IEP, amendment, progress, notice | Financial statements, deed, application, gift correspondence | Model discovers receipts/line items |
| Concepts | Need, goal, measurement, service, decision | Account, transfer, asset, declaration | Dynamically proposed purchase/item/merchant |
| Relationships | Progress → goal; goal → need | Transaction → account; transfer ↔ declaration | Item → purchase; repeated-item candidates |
| Investigations | Compatible progress; changes; service evidence gaps | Transfer trace; possible disclosure discrepancy | Aggregation, repeat purchases, comparable prices |
| Communication | Family/advocate language | Applicant/elder-law attorney language | Shopper language |

**Pack-free grocery is a first-class qualification, not an afterthought:** discover an effective concept schema for an unknown receipt, extract and verify line items, form one evolving study over 20→30 receipts, answer changing intents (spending, organic labels, comparable unit prices) without claiming purchased = consumed or unlabeled = non-organic.

**Synthetic Medicaid probe:** The attorney and elderly applicant share one pinned study. A transfer on a bank statement, a gift letter and an application declaration may support a **possible discrepancy**, not a legal or eligibility verdict. Rights/access remain independent of communication guidance.

## 9. Qualification gates for every pack

| Gate | Positive proof | Negative/failure proof |
|---|---|---|
| Contract | Typed schema, unique keys, nested references, limits, @1 migration | Unknown operator, unresolved reference, duplicate key, illegal nesting rejected |
| Catalog | Reviewed explicit version/digest selected deterministically; domain pill auto-discovered | Corrupt reviewed/required pack fails, unreviewed rejected, no silent version upgrade |
| Classification | Title-first, compound docs, multi-source roles, ambiguity retained | Body-title collisions and same-domain ties cannot force wrong exact match |
| Extraction | Nested records with per-item anchors; intent + reusable fields | Missing field ≠ fabricated, poor OCR remains uncertain |
| Identity/time | Goal or transaction record stays intact; linked history when corroborated | Similar but different records not forced together; later ≠ automatically supersedes |
| Evidence | Source/Hive/hash/page/quote and value support verified by P2.3 | Fabricated quote, wrong page, cross-Hive reference fails |
| Investigation | Supported derived finding with operator version/inputs/coverage | Incompatible metrics, missing delivery logs, incomplete periods produce UNRESOLVED |
| Persona | Same assertions to two authorized audiences | No expanded access or facts changed by audience style |
| Extension | Synthetic second pack added via files and metadata only | Zero domain branches in Web/Worker/Reader/Core; generic fallback unaffected |
| End-to-end | Real source → Oracle → same Canonical Study → findings → reports | Storage, timeout, retries, broken alias, corrupt source diagnosable |

**IEP-specific reference fixture:** L001 *eight actual files* — referral, evaluation plan, parent consent, psychoeducational evaluation, academic evaluation, speech-language evaluation, eligibility determination, initial IEP. Add L002/L003/L006 reevaluation, amendments, progress, PWN, FBA/BIP. Evaluate document identity, nested service/goal records, compatibility of measurements, amendments and unresolved linkages—not a flat fact-count threshold. V2 artifacts are historical sources; only verified reviewed definitions may be ported.

## 10. Production supportability and security

- Validate packs at build/release and again at trusted load boundary; error-envelope@1 and deterministic reason codes for corrupt/required packs. Never log private page text, prompts, quotes, model completions or credentials.
- Record correlation ID, study run, pack ID/version/digest, match tier, schema hash, classification ambiguity, operator ID/version, bounded duration and coverage. Reader/Worker internal auth is fail closed; model calls only via Oracle LiteLLM with provider/privacy approval.
- Inngest owns orchestration retries; pack loading and operator dispatch are bounded and idempotent where durable effects occur. Maintain explicit terminal errors vs recoverable transient failures; never advance study current pointer on partial failure.
- Pack authoring/test fixtures must not expose real student, patient, family or financial data. Separate sensitive runtime packs/records from safe public pill metadata.

## 11. Authoring submission checklist

- [ ] 3–5 customer intents and at least one unexpected/new intent listed
- [ ] Domain-level public metadata, no browser-facing private pack rules
- [ ] Document taxonomy grounded in actual fixtures; ambiguity and negative title signals
- [ ] Typed record-oriented concept schemas with identity, time, modality, item-level evidence
- [ ] Relationship bindings, uncertain matching policy and amendment/change scope
- [ ] High-value investigations use allowlisted operators and explicit preconditions
- [ ] Communication guidance for customer and professional, same evidence requirements
- [ ] No executable pack code, duplicate processor or mandatory registry
- [ ] Schema/references/version/review/digest/pin/compatibility validated
- [ ] Positive/negative qualification evidence including **pack-free** and synthetic-second-pack proofs
- [ ] No sensitive fixtures, unsupported claims or undocumented migration assumptions

## 12. Implementation sequencing and decision log

**This guide is design only.** Existing V3 locally accepted P2.2 uses `domain-pack-manifest@1`; the proposed `@2` contract, richer study graph and operator execution are **not yet proven integrated**. A guide alone does not authorize code changes. In the approved Development Plan, final pack specification belongs to **P2.2-DP.D**, generic contracts/loader/IEP reference implementation to **P2.2-DP.I**, verification to **P2.3**, Canonical Study to **P3**, operator execution to **P3.I**, and audience output to **P4**. `NEXT.md` controls the one active ticket.

**Before implementation approval:** inspect actual local V3 manifest/types, V2 `brain/domain-packs/iep/iep-pack.v0.3.proposed.json`, and V2 L001 source mapping; reconcile exact record keys and dates; determine final @2 validator and manifest format, pack version/pin policy, canonical object contracts, stable operator IDs, validation failure taxonomy and public projection mechanics. Synchronize approved documents and scoped Cursor rules without overwriting unrelated work. No database migrations, commits, pushes, production changes or paid model runs without separate authorization.


## 13. Question-driven Canonical Study planning (v1.1 amendment)

**Approved product behavior:** The Hive creator uploads documents and may express any outcome or question in free text. The creator controls sharing. A Domain Pack does **not** set permissions, require persona selection at Hive creation, or create separate persona-specific Canonical Studies. Its **Views & Outcomes** configuration provides domain-specific question catalogs and output guidance for customer/professional views. This section refines the earlier *Communication* section; existing communication hints remain a subpart of Views & Outcomes.

### Question catalog: one question at a time

Author each question as a small, independently testable declaration. Prefer the **minimum high-value catalog** proven by real user outcomes; do not manufacture a long checklist merely because a field exists. Each declaration includes:

- `question_id`, `canonical_question`, `view_ids` (display defaults only), `outcome_ids`, `priority` and `trigger_policy` (`baseline` / `conditional` / `suggested`).
- `required_concepts`, optional `required_relationships`, `investigation_ids` referencing declared allowlisted bindings, and `coverage_requirements` describing evidence needed for a reliable answer.
- `on_insufficient_evidence` (usually `UNRESOLVED`), `suggested_follow_ups`, and a safe output section ID if the universal Writer supports it.
- `source_basis`: authoritative standards or validated user research informing *why the question matters*, distinctly **not evidence about a particular Hive**.

`view_ids` are not security roles. View question catalogs are **not** permission filters. Any authorized participant may ask any question. A pack-free Hive has no catalog but still decomposes and plans uploader questions.

### From free text to one unified question set

1. Capture original uploader text verbatim and its associated `intent_id`; never replace or lose it.
2. Decompose compound requests into **atomic questions** with traceable input spans and ambiguity flags. Do not overinterpret subjective terms such as "appropriate" as a proven legal standard.
3. Match atomic questions semantically to the reviewed, pinned Domain Pack catalog; retain unmatched questions for dynamic planning.
4. Select **relevant** catalog questions across views, according to evidence/document scope and bounded baseline policies. Do not blindly include the full question catalog or require persona selection.
5. Compute a **union** of uploader questions, applicable catalog questions and previously unresolved questions. Merge only on **structured equivalence** (subject, time period, population, document scope, qualifiers). **Similarity does not prove equivalence.** Narrow and broad questions stay distinct but may share investigation results. Ambiguous catalog matches never discard uploader atomics.
6. Produce a **frozen**, immutable, versioned `study-question-set@1` per `study_run_id` (intent stored in authorized private storage; artifacts carry `intent_id` and hash only). Updating intent creates a new set/revision, not a competing Canonical Study. Document classification **re-evaluates investigation prerequisites** only; it does not change merged question membership.
7. Compile the question set into a **Study Plan**: reuse verified Canonical Study facts and accepted findings first; schedule only missing, justified investigations; deduplicate by investigation, parameters, evidence scope and pinned revision; apply a **configurable bounded budget** with explicit deferral — never silent truncation or false completeness. Questions prioritize extraction, not limit the universe of observations.
8. Extract candidates → independently verify → reconcile into the **one** Canonical Study → evaluate investigations/answers. Never feed model-composed answers directly into accepted source-derived facts.
9. Track `study-question-coverage@1` with **evidence coverage** (reviewed scope, missing evidence types) separate from **answer status** (`NOT_EVALUATED`, `SUPPORTED`, `PARTIAL`, `UNRESOLVED`, `NOT_FOUND_IN_REVIEWED_SCOPE` with scope proof, `BLOCKED`). Partial evidence or unexecuted required CORE work cannot produce a complete answer. Missing records never imply a service or event did not occur.

**Hard constraints:** One bounded structured LiteLLM call may propose decomposition and catalog links; code validates equivalence, references, budgets, lineage and support. **CORE** investigation bindings are required for a question, not automatically executable. Professional-view catalog questions enter by **relevance**, not merely because a pack is pinned. Planning failure leaves the prior accepted Canonical Study revision intact. Do not log raw intent or document content.

### Minimum viable catalog authoring method

For each persona/view, first document the single most valuable real-world *outcome*. Research one atomic question at a time from authoritative, dated sources and/or direct customer evidence; map to the **existing** concepts/investigation IDs; identify minimum evidence and safe unresolved answer; create one positive and one negative fixture. Approve it before adding the next. Do not change the processing engine to accommodate a question that can be expressed with the universal operator vocabulary.

### Initial example — IEP customer view, question 001

- **Outcome:** Parent preparation for an upcoming IEP meeting.
- **Question:** `What should I discuss at the next IEP meeting?`
- **Evidence targets:** Current IEP goals, progress reports, services/supports, relevant changes, and any meeting notice the Hive actually contains. Do not assume an earlier IEP or service logs exist.
- **Investigation behavior:** Examine supported goal/progress links, current plans, and documented gaps or conflicts; prioritize unresolved but important issues as *questions to ask*, never verdicts.
- **Source basis:** IDEA 34 CFR §§300.320 (IEP contents and goal-progress reporting) and 300.322 (parent participation/meeting notice). Official sources: https://sites.ed.gov/idea/regs/b/d/300.320 and https://sites.ed.gov/idea/regs/b/d/300.322 . These explain the question's relevance, not any child's facts.
- **If insufficient records:** say what the supplied records establish and which additional records or clarifications would make preparation more complete.

### Acceptance tests added by v1.1–v1.2

See `docs/design/p2.2-dp.d/IEP-PACK-QUALIFICATION.md` §12 for the full matrix. Summary:

- Multi-part intent → atomics with spans; no uploader text dropped.
- Structured equivalence merge only; narrow vs broad progress questions stay distinct; shared investigations reused.
- Ambiguous match → distinct questions; uploader atomics preserved.
- Reuse prior verified findings without duplicate investigation execution when `run_key` matches.
- Missing service-delivery records → gaps / UNRESOLVED, not non-delivery.
- Budget exhaustion → deferred investigations and explicit incomplete coverage.
- Pack-free grocery uses the same planner without a catalog.
- New intent enriches the same Canonical Study; planning failure preserves prior accepted revision.
- Private intent excluded from logs; correlation IDs and question-set hashes in diagnostics.

**Implementation status:** `study-question-set@1`, `study-question-coverage@1`, generic question matching and question-driven planning are **proposed**. This guide does not imply they already exist in Worker, Reader, database or writer. Synchronize architecture, development plan, NEXT and applicable rules when authorizing implementation.

## 14. Selected-Domain-Pack extraction (P2.2-PX.D amendment, 2026-10-24)

**Status:** proposed design; not implemented. Normative detail: `docs/design/p2.2-px/PACK-EXTRACTION-PROMPT-ARCHITECTURE.md`; acceptance: `docs/acceptance/P2.2-PX-pack-extraction-L001.md`.

When a reviewed pack is selected and pinned for a run:

1. **The pack is the catalog.** Its document types are the only classification targets; its record types and fields are the only extractable facts. There is no `generate_schema` / `supplement_schema` step and intent never adds fields.
2. **One compiled prompt per pack version.** The Worker compiles a deterministic, canonical (JCS) system prompt from the validated pack: universal Hive extraction rules, domain and document types, classification and ambiguity rules, the complete nested fact catalog, evidence and missing/uncertain rules, and the output contract. It is identified by `prompt_digest` and stored once per digest; runs reference the digest.
3. **Untrusted text stays out of the system prompt.** Pack strings are JSON-encoded data inside fixed sections; document pages and source metadata are only in the user message.
4. **Authoring implications:** declare every fact you need (stable fact IDs, value kinds, enums, constructs); write classification signals and negative signals precisely enough for title-first identification; keep the catalog size proportionate. Oversized catalogs are handled by compile-time, completeness-proven partitions by document-type group — never by runtime truncation. A pack whose single document-type closure cannot fit the configured context fails qualification.
5. **Evidence and validation:** every observed value needs a page + verbatim quote; missing is `NOT_FOUND`, not inferred. Invalid individual facts are rejected without discarding the rest of the document.
6. **Qualification gate addition (§9):** selected-Pack extraction must pass the L001 acceptance file, including identical `prompt_digest` across all eight documents and zero schema-generation calls.

The generic/no-Pack extraction design is deferred; the pack-free grocery qualification in §8 remains a required release gate.
