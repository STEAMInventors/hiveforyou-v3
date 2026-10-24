# IEP Domain Intelligence Pack — semantic specification

**Ticket:** P2.2-DP.D  
**Status:** **CLOSED (design, 2026-10-22).** Candidate not implemented. Not a catalog entry. Not legally reviewed.  
**Date:** 2026-10-22  
**Contract proposed here:** `domain-pack-manifest@3` (five-section profile)  
**Pack release proposed here:** `iep` `3.0.0-candidate`, `review_status: draft`  
**Normative instance:** `docs/design/p2.2-dp.d/iep-manifest@2.CANDIDATE.json`  
**Qualification:** `docs/design/p2.2-dp.d/IEP-PACK-QUALIFICATION.md`  
**Unified question planning:** `docs/design/p2.2-dp.d/UNIFIED-QUESTION-PLANNING.md` (finalized P2.2-DP.D; does not alter pack domain content)
**Superseded in part (2026-10-24):** extraction with a selected pack follows P2.2-PX.D (`docs/design/p2.2-px/PACK-EXTRACTION-PROMPT-ARCHITECTURE.md`, proposed) — catalog-only extraction, no dynamic/generic schema for intent fields on that path. Statements here about generic/dynamic schema apply to the deferred no-Pack path. Domain content unchanged.

This specification does not change runtime code, `domain-packs/iep/1.0.0`, `domain-packs/iep/2.0.0`, `packages/contracts`, or `docs/NEXT.md`. The candidate JSON is stored under `docs/design/` so `loadDomainPacksFromRoot` cannot read it. `implementation_status` is `CANDIDATE_NOT_IMPLEMENTED`.

## 1. What this pack is for

A reviewed IEP pack makes one generic Hive able to recognize special-education documents, keep goal and service rows intact, and propose the same cross-document questions a careful reader would ask. It does not contain a student's facts, run code, create a second Canonical Study, or decide that a school violated a rule.

The pack is useful because documents in this domain refer to the same goals, needs, and services without sharing a database key. An evaluation score, a goal baseline, and a later progress number can be the same measure only when task, score type, unit, instrument, administration, and time are compatible. An amendment changes the sections it names. A missing service log is an incomplete record, not proof the service did not happen. Those rules are data. Web, Worker, Reader, and Core stay domain-neutral and apply the same operators to a Medicaid pack or to grocery receipts with no pack.

## 2. Sources actually inspected

| Source | What it contributed |
|---|---|
| `docs/DOMAIN-PACK-DESIGN-GUIDE.md` | Five sections, operator list, trust ladder, pack-free and Medicaid probes |
| `docs/ARCHITECTURE.md` §§7–9 | Identity, time, modality, measurement, personas, finding status |
| `docs/DEVELOPMENT-PLAN.md` Gate C | This ticket is design-only; implementation is P2.2-DP.I |
| `docs/ERROR-HANDLING-RECOVERY.md`, `packages/contracts/src/errors/v1/error-codes.ts` | `error-envelope@1` codes. No new code is added by this design |
| `packages/contracts/src/domain-packs/v1/types.ts` | `domain-pack-manifest@1` shape to preserve |
| `packages/contracts/src/domain-packs/v2/types.ts`, `packages/core/src/pack-validation.ts` | Implemented `@2` shape already bound to another manifest |
| `domain-packs/iep/2.0.0/manifest.json`, `scripts/convert-v2-iep-to-manifest-v2.mjs` | Interim port: 15 document types, 25 record types, modalities and derivations dropped |
| `domain-packs/iep/1.0.0/manifest.json` | Historical `@1` pack. Leave immutable |
| `experiments/pack-driven-reader-l001/src/corpus.ts` | V3 classification snippets for eight L001 filenames. These are not the PDFs |
| `C:\Users\abhattacharyya\hiveforyou-v2\brain\domain-packs\iep\iep-pack.v0.3.proposed.json` | Authoritative V2 proposal. Status `REVIEW_DRAFT_NOT_RUNTIME_COMPATIBLE`. Version `0.3.0-proposed` |
| Same directory, `IEP-DOMAIN-PACK-V0.3-PROPOSED.md`, `review-check.json` | 15 document types, 25 record types, 131 fields, 19 keyed types, 11 cited rules, 8 checks, 0 validator errors. Structural only |
| `interpretation/iep-interp-v0.3.1.overlay.json`, `interpretation/compatibility.json` | Record-oriented patches pinned to reader pack SHA-256 `c2baa043…a7775` |
| `snapshots/fbcec0b5912b3c4b5fdfe83ef2de551d44171f81ef818ab0a8a94ea472ccbdc7.json` | Declarative compiled pack. `schemaVersion` `hive.domain-pack.declarative-compiled/0.2.1`, pack version `0.2.1-draft`. 23 document types, 23 record types |
| `snapshots/manifest.json` | Pins two `0.3.0-proposed` hashes. The 0.2.1 snapshot is on disk and is not listed in that manifest |
| `C:\Users\abhattacharyya\hiveforyou-v2\engine\intake\fixtures\l001` through `l006` | Actual synthetic PDF filenames, source ids, and L001 SHA-256 values from the fixture README and manifests |
| `engine/domain-packs/iep/qualification/arch05-l001.ts` | V2 acceptance checks as of `2026-10-21`. Read as criteria, not re-executed |
| `engine/domain-packs/iep/pack.ts`, `manifest.ts` | Executable V2 pack is `0.0.0-scaffold` with callbacks, rulebook, and story code. Not a declarative source |
| `artifacts/arch05-l001-qualification/*.json`, `artifacts/intake-qualification/qualification-report.json` | Files exist. This session could not read them (permission denied). No pass/fail is claimed from those reports |

No separate file named `iep-pack.v0.2.1.json` exists under `brain/domain-packs`. The 0.2.1 declarative pack is the compiled snapshot named above.

## 3. Contract decision

The design guide and this ticket ask for a five-section `domain-pack-manifest@2`. Inspection shows that string is already the implemented contract in `packages/contracts/src/domain-packs/v2/types.ts`. IEP `2.0.0` is `review_status: "reviewed"` and the Worker catalog loads every `domain-packs/<id>/<version>/manifest.json`.

That implemented object is a flat extraction port: `document_types`, `record_types`, `public_surfaces`, optional `constructs`, `relationship_rules`, `reading_notes`, `plain_explainers`, and `vocabulary`. It has no investigation bindings, no typed relationship list, no audience section, and no separation of regulatory citations from document facts. The converter also dropped field `source`, `modality`, `derivation`, `comparison`, and `aliases`.

**Decision:** The five-section contract in this design is `domain-pack-manifest@3`. `domain-pack-manifest@1` and the implemented `@2` stay loadable and unchanged. A future loader that switches on `contract_version` will reject `@3` until P2.2-DP.I adds a parser. Rejection is the safe behavior. The candidate must not be renamed into `domain-packs/iep/3.0.0/manifest.json` until that parser exists and the pack is reviewed.

`iep/2.0.0` remains the interim extraction pack. It is not this specification. Its V2 source was explicitly not runtime-compatible and not legally reviewed; marking the port `reviewed` is a compatibility risk recorded in §12, not a change made here.

Pack release `3.0.0-candidate` is not the contract version. Digest, review status, and semver stay independent. Studies pin `pack_id` + `pack_version` + digest. Nothing auto-selects the highest semver.

## 4. Universal contract (`domain-pack-manifest@3`)

One JSON object. No callbacks, SQL, executable expressions, or prompts that override system policy. Named engine primitives may be referenced by id. The engine owns their code.

### 4.1 Required top-level keys

| Key | Role |
|---|---|
| `contract_version` | Must be `domain-pack-manifest@3` |
| `contract_profile` | Must be `five-section` |
| `implementation_status` | `CANDIDATE_NOT_IMPLEMENTED` until a reviewed release removes it |
| `pack_id`, `pack_version` | Stable id and semantic version. Draft versions use a `-candidate` or `-draft` suffix |
| `review_status` | `draft` or `reviewed`. Orthogonal to semver |
| `discovery` | Domain identity, public projection, document taxonomy |
| `concepts` | Record types, fields, identity, time, modality, evidence |
| `relationships` | Typed links and uncertainty policy |
| `investigations` | Bindings to the allowlisted operators only |
| `communication` | Customer and professional wording for the same facts |
| `constructs` | Shared comparison constructs. May be empty |
| `vocabulary` | Abbreviations, synonyms, unit aliases, definitions |

Optional keys: `derivations`, `regulatory_overlay`, `historical_references`, `enums`. Unknown top-level keys are rejected. Unknown keys inside a known object are rejected, so a pack cannot smuggle a callback.

### 4.2 Validation the loader must enforce

Reject the pack, fail closed, and do not continue with a partial pack when any of these fail:

- `contract_version` is not `@1`, implemented `@2`, or `@3`.
- `@3` is missing a required section, has a duplicate id, or references a concept, field, document type, relationship type, enum, construct, or operator that is not declared.
- An identity `key_fields` or `key_fields_if_present` entry is not a field on that concept.
- A version axis (`document.ordering_date` or any ordering-date field) appears inside `key_fields`.
- An investigation `operator_id` is not one of: `compare_measurements`, `compare_commitment_observation`, `detect_change`, `find_disagreement`, `trace_flow`, `aggregate`, `identify_gap`. Operator version must be `investigation-operator@1`.
- A string value is an executable marker: `function`, `=>`, `eval`, `sql`, `script`, `callback`, or a path to code.
- Nesting of record-valued fields exceeds depth 4, a concept exceeds 80 fields, reading notes exceed 6000 characters, or the canonical manifest exceeds 1 MiB.
- `regulatory_overlay` is referenced as an evidence source, a concept field, or a document fact.
- `review_status` is `draft` or `implementation_status` is present, and the caller asked for production selection.
- Two files claim the same `pack_id` and `pack_version`.
- A requested pin or required pack id is missing, or the pinned digest does not match the canonical digest.
- A supersession relationship omits `scope`.
- A measurement comparison input omits unit and score-type (or their construct fields).

`@1` and implemented `@2` continue to use their current validators. `@3` validation does not reinterpret those files.

Canonical digest: Unicode NFC, object keys sorted recursively, arrays left in declared order, no insignificant whitespace, UTF-8, SHA-256. This differs from today's `computePackDigest`, which hashes file bytes as stored. Do not recompute historical `@1` or `@2` digests with the new rule.

### 4.3 Public projection

`discovery.safe_public_projection` is the only object that may be copied to the browser. Contract of the projection: `domain-pack-public-metadata@1`.

Allowed keys: `contract_version`, `domain_id`, `label`, `short_label`, `pill_enabled`, `pill_tone`, `placeholder`, `starter_intents`.

Forbidden in the projection: document signals, checklists, concepts, relationships, investigations, regulatory citations, reading notes, field enums, and anything that names a student or a document quote. `pill_tone` is a CSS token suffix. Web must not branch on domain id. A selected pill is a hint, not a classification.

The IEP projection is restated in §10. It is not private pack content.

## 5. Discovery

### 5.1 Domain

`pack_id` `iep`. Label **Special Education / IEP**. Jurisdiction tag `US-federal-base` describes the vocabulary's federal baseline. It does not apply state law and it does not certify a document.

Author roles and parties, reused from V2 v0.3:

| Role | Party |
|---|---|
| `education_agency` | `school` |
| `school_evaluator` | `school` |
| `eligibility_team` | `school` |
| `independent_evaluator` | `independent` |
| `parent_guardian` | `parent` |
| `referrer` | `classified_per_document` |
| `other` | `classified_per_document` |

Change requires the same content key, the same party, and a later ordering date. Different parties on the same key are a disagreement. Roles marked `classified_per_document` do not assume a party.

### 5.2 Document taxonomy — 19 types

Fifteen types are the V2 v0.3 ids, so existing L001 classification fixtures keep their expected ids. Four types are added because v0.3 has no title for documents that actually exist in L003 and L006, and because v0.2.1 already separated them.

Initial, annual, review, revised, and reevaluation plans are **subtypes of `iep.plan`**, not separate document types. v0.2.1 split `iep_initial` and `iep_annual`. Their titles are the same phrase. Splitting them forces a filename guess. Subtype is a classified field on `document_header` and may stay `other` when the form does not say.

Reevaluations of a named discipline stay on that evaluation type with subtype `reevaluation`. A file named `speech_language_review` may match `iep.evaluation.speech_language` at partial tier if the title is weak. It must not be forced to `iep.plan`.

| Id | Label | Author role | Ordering date | V2 origin |
|---|---|---|---|---|
| `iep.referral` | Referral for special education evaluation | `referrer` | `referral.referral_date` | v0.3 |
| `iep.evaluation.plan` | Evaluation plan | `education_agency` | `document_header.document_date` | v0.3 |
| `iep.consent` | Parent consent | `parent_guardian` | `document_header.document_date` | v0.3 |
| `iep.evaluation.academic` | Academic evaluation | `school_evaluator` | `document_header.document_date` | v0.3 |
| `iep.evaluation.psychoeducational` | Psychoeducational evaluation | `school_evaluator` | `document_header.document_date` | v0.3 |
| `iep.evaluation.speech_language` | Speech-language evaluation | `school_evaluator` | `document_header.document_date` | v0.3 |
| `iep.evaluation.independent` | Independent educational evaluation | `independent_evaluator` | `document_header.document_date` | v0.3. v0.2.1 `specialist_evaluation` is not this type unless independent-evaluator signals are present |
| `iep.eligibility` | Eligibility determination | `eligibility_team` | `document_header.document_date` | v0.3 |
| `iep.plan` | Individualized Education Program | `education_agency` | `document_header.effective_start` | v0.3. Subtypes: `initial`, `annual`, `review`, `revised`, `reevaluation`, `interim`, `other` |
| `iep.amendment` | IEP amendment | `education_agency` | `amendment_change.effective_date` | v0.3. Amends a named plan; does not replace the whole plan |
| `iep.progress` | IEP progress report | `education_agency` | `progress_entry.reporting_period.end` | v0.3 |
| `iep.notice` | Prior written notice | `education_agency` | `school_action.action_date` | v0.3 |
| `iep.behavior.fba` | Functional behavioral assessment | `school_evaluator` | `document_header.document_date` | v0.3 |
| `iep.behavior.bip` | Behavior intervention plan | `education_agency` | `document_header.effective_start` | v0.3 |
| `iep.behavior.observation` | Behavior tracking or incident summary | `school_evaluator` | `document_header.document_date` | **New.** L006 tracking and incident files. Subtypes `tracking`, `incident` |
| `iep.meeting.notes` | IEP meeting notes or minutes | `education_agency` | `meeting.meeting_date` | **New.** L003 meeting notes. v0.2.1 `meeting_minutes` |
| `iep.meeting.notice` | Notice of an IEP meeting | `education_agency` | `meeting.meeting_date` | **New.** v0.2.1 `meeting_notice`. No L001–L006 file is only a meeting notice |
| `iep.service.implementation` | Service delivery or implementation log | `education_agency` | `service_delivery_observation.period_end` | **New.** v0.2.1 `service_implementation_record`. The service grid inside an IEP is not this type |
| `parent.correspondence` | Parent letter or email | `parent_guardian` | `document_header.document_date` | v0.3 |

v0.2.1 `iep_correction`, `transition_plan`, `placement_record`, `reevaluation_report`, and `other` are not document types here. Corrections and placement live inside plans or amendments. A standalone transition plan that is also titled as an IEP stays `iep.plan`. A document that is only a transition plan and carries no IEP title stays unclassified at exact tier and may partially match `iep.plan` concepts. That gap is explicit in §12.

### 5.3 Title, negatives, boundaries, ambiguity

Title zone is the filename plus the first-page heading block, not the whole body. Title hits outweigh body keywords. Body mentions of "IEP" inside an evaluation do not make the document a plan. Negative title signals are title-zone only.

Illustrative negatives, all normative in the candidate:

- `iep.plan` rejects title hits for progress report, amendment, prior written notice, functional behavioral assessment, behavior intervention plan, meeting notes, and meeting minutes.
- `iep.progress` rejects a title that is only "Individualized Education Program".
- Evaluation types reject plan, progress-report, and eligibility titles.
- `iep.behavior.fba` and `iep.behavior.bip` reject each other's titles.
- `iep.behavior.observation` rejects FBA, BIP, and IEP titles.
- `iep.service.implementation` rejects an IEP title. A service table inside a plan is extracted as `service` rows, modality `planned`.
- `iep.meeting.notice` rejects minutes and prior-written-notice titles.
- `parent.correspondence` signals such as "Dear" are weak. They never outrank a strong title of another type.
- `iep.consent` requires a permission or signature signal. The word "consent" alone inside an IEP does not win.

Compound PDFs: when headings change, propose one logical document per span and classify each span. If the span boundary is uncertain, keep one source document, record the candidate types, and set match tier `partial`. Do not invent a page split.

Within-domain ties stay ambiguous. The user-selected IEP pill may break a tie only inside this pack. It cannot override a negative title and it cannot classify a grocery receipt as an IEP. Unknown documents use the generic schema. They are not counted toward IEP checklists.

Checklist policy, reused from v0.3: look for every listed concept; never invent an absent row; if another pack concept is actually present, extract it too. A checklist is not a legal requirement.

### 5.4 Dates

These axes stay distinct. A later date does not grant authority by itself.

| Axis | Examples |
|---|---|
| Document date | Date printed on the letter or report |
| Event date | Meeting, referral, consent, action, incident |
| Effective interval | Plan `effective_start` / `effective_end`; service `start_date` / `end_date` |
| Observed date | `measurement.observed_on`; progress reporting period |
| Decision date | Eligibility determination; ESY decision |
| Recorded / as-of | Study processing time and the user's question date. Never a document fact |

Conflicting dates for the same content key are kept as separate assertions. The relationship stays `unresolved`. The study does not pick the later document.

L001's referral ordering example in V2 qualification code expects `2024-08-20` on `referral.referral_date` so the referral sorts first. That is a fixture expectation for a future run. This design did not re-read the PDF.

## 6. Concepts

### 6.1 Record model

There are **27 concepts**. Twenty-five reuse V2 v0.3 record ids. Two are new because delivery and incidents have no v0.3 record, and investigations that compare commitment with observation cannot be stated without a delivery concept.

A concept is one real-world row: one goal, one service line, one score, one consent decision. Evidence is one page-anchored quote per record. Every quoted field value must appear in that quote. Repeatable concepts use per-item evidence. `document_header` and case singletons use one record per document.

Field sources, reused from v0.3:

- `quoted` — the value is in the record quote. The model may propose it. Verification still has to accept it.
- `classified` — the model may choose only from the declared enum, and the choice is labeled as a classification.
- `derived` — the model must not emit the value. The engine may compute it from verified operands with a named primitive. If the document quotes the value, the quoted value is the observation and the derivation is not run.

Modalities on fields: `observed`, `planned`, `decided`. The architecture also names `proposed`, `reported`, `delivered`, `amended`, and `derived`. This pack uses the three V2 modalities on source fields and reserves `derived` for engine derivations, `amended` for the composition result of an amendment, and `delivered` for `service_delivery_observation` only. A goal target is `planned`. A progress number is `observed`. An eligibility category is `decided`. They are not interchangeable.

Missing is not a false value. Allowed missing states: `field_present_but_empty`, `not_found_in_supplied_documents`, `not_applicable`, `unresolved`.

Reusable facts are the concept records. An arbitrary new question may add intent-specific fields on the dynamic schema. Those fields are not new pack concepts and are not reused as identity keys. Narrative fields marked `comparison: none` (`statement`, `basis`, `finding`, `comment`, `change_description`) are stored and shown. They are not numeric comparison inputs.

### 6.2 Measurement construct

Construct `measure` is shared by `measurement`, `goal`, and `progress_entry`.

Required to call two measures the same: `measure.task` and `measure.score_type`. Compared when both sides have them: `measure.instrument` and `measure.administration`. A mismatch on an if-present field means they are different, not averaged. Partial overlap is `possibly_same` and is not merged.

`measure.score_type` enum: `words_correct_per_minute`, `percent_accuracy`, `percent_of_opportunities`, `standard_score`, `scaled_score`, `t_score`, `percentile`, `grade_equivalent`, `age_equivalent`, `raw_score`, `rubric_level`, `count`, `rate_per_period`, `duration`, `other`.

A measurement value stores `value`, `unit`, score type, instrument, task, administration, `observed_on`, and population/conditions (`measure.administration` plus `area`). Comparison is invalid until score type and unit are compatible. No silent conversion between WCPM and percent accuracy, standard score and percentile, or grade equivalent and raw score. `other` never compares.

Goal baseline and target stay **fields on the goal record**, grouped as measurement objects:

- Baseline group: `baseline_value`, `baseline_unit`, `baseline_source`. Modality `observed`. Shares `measure`.
- Target group: `target_value`, `target_unit`. Modality `planned`. Shares `measure`.
- `accuracy_criterion` is a separate percent. It is not the target value. V2 reading notes require this split.

The same numbers are not extracted a second time as standalone `measurement` rows unless the document states them as scores outside the goal sentence. Progress scores are `progress_entry` plus a `measurement` with `context: progress_report`.

### 6.3 Concept catalog

Identity rules below are the candidate's rules. "v0.3 key" is the source key when this design changes it.

| Concept | Repeat | Role | Identity |
|---|---|---|---|
| `document_header` | no | Lineage and ordering | Document scope. No content key. Version axis is the document ordering date |
| `student` | no | Subject | Case singleton. Differing `name` or `birth_date` is `possibly_same`, never merged. Optional `student_id` is an if-present key. No model person id |
| `meeting` | yes | Event | `meeting_date` |
| `meeting_participant` | yes | Person at a meeting | `role_code`, and `name` if both sides have it. v0.3 keyed only `role_code`, which would collapse two people in one role. This is a transform |
| `eligibility` | no | Decision | Case singleton with versions on the ordering date. Same party and a later date is a new version. Different party is a disagreement. Text is not merged |
| `present_level` | yes | Educational need on the plan | `area`. This is the need role. There is no second `educational_need` concept, so the same paragraph is not extracted twice |
| `measurement` | yes | Any score | `measure.task` + `measure.score_type`; instrument and administration if both present |
| `goal` | yes | Annual goal, with baseline and target | **Adopted from interpretation overlay 0.3.1, not the v0.3 key.** Key: `measure.task` + `measure.score_type`. If present: `area`, `designation`. Disambiguator inside one document: `condition`. v0.3 required `area` in the key. The overlay matches one reading-fluency goal across documents when area wording differs. `designation` is a new quoted field ("Goal 1") and is never inferred |
| `short_term_objective` | yes | Benchmark under a goal | `goal_area` + `statement` |
| `service` | yes | Commitment row | `category` + `service_type`. Within one document, `delivery`, `location`, and `provider_role` split rows. They do not split across documents. Duration is `start_date` to `end_date`, not session length |
| `accommodation` | yes | How access changes | `description` + `context`. New field `kind`: `accommodation`, `modification`, `unspecified`. v0.2.1 had a separate `modification` record; v0.3 folded it into accommodation and kept the definition. The discriminator keeps the distinction without a second row type. Near-duplicate text is `possibly_same`. No match threshold is declared |
| `placement` | no | Educational setting | Case singleton, versioned. Not the same attribute as service `location` |
| `assessment_participation` | yes | State or district test participation | `assessment_name` |
| `transition` | yes | Postsecondary plan row | `area` enum: education/training, employment, independent living |
| `transfer_of_rights` | no | Age-of-majority notice | Case singleton, versioned |
| `extended_school_year` | no | ESY decision | Case singleton, versioned |
| `progress_entry` | yes | Reported status for a goal and period | `goal_area` + `measure.task` + `measure.score_type`; instrument if both present. `goal_reference` is a quoted label, not a join key |
| `amendment_change` | yes | Scoped edit | `affected_record_type` plus disambiguator `change_description`. Composition: replace records of that type with the same content key on the plan named by `target_plan_date`. Unmentioned sections of the plan stay in effect |
| `school_action` | yes | Proposal or refusal on a notice | `action` + `action_date`. `decision` is `proposed` or `refused` |
| `parent_request` | yes | Request in a letter or plan | `topic` + `request_date` |
| `consent` | yes | Permission decision | `action` |
| `referral` | yes | Request to evaluate | `referral_date` |
| `evaluation_plan_item` | yes | One checklist line | **Adopted from overlay 0.3.1.** Document scope. Key: `list_section` + `line_text`. v0.3 keyed `area` + `assessment`, which collapsed distinct lines. New fields: `list_section`, `line_text`, `selected` |
| `evaluation_finding` | yes | Evaluator conclusion | `area`, disambiguator `finding`. `cross_document_merge: independent_assertions`. A school finding and an independent finding are not one assertion |
| `behavior_target` | yes | FBA/BIP behavior | `target_behavior` |
| `service_delivery_observation` | yes | Documented delivery | **New.** Key: `service_type` + `period_start` + `period_end`; provider and location if both present. Modality `observed`. Absence of this concept is not non-delivery |
| `behavior_incident` | yes | One incident row | **New.** Document scope. Key: `incident_date` + `description`. Similar incidents are not merged across documents |

`student.name`, `student.birth_date`, `student.student_id`, and `meeting_participant.name` are sensitive. Logs and public metadata must not contain them.

### 6.4 Derivations (declarations only)

| Field | Primitive | When |
|---|---|---|
| `service.sessions_per_period` | `parseFrequency` on `frequency_text` | Same record, all operands verified, parse unambiguous |
| `service.minutes_per_week` | `ratePerWeek` from session minutes, sessions, and period; alternate `explicitTotalPerWeek` when the quote states a weekly total | Do not split "150 minutes weekly" into a session length. L001 qualification code expects a derived 150 for the foundation service. Not re-run here |
| `placement.percent_time_general_education` | `shareOfTotal` | **Blocked** until a reviewed district `school_week_minutes` reference exists. Do not invent the week length |

These primitive names are engine-owned. The pack does not define their arithmetic.

### 6.5 What is intentionally not a concept

- A generated `goal_id`, `service_id`, or row number. Printed "Goal 1" may be stored as `designation` and is only an if-present key.
- A legal conclusion, a violation, or a statement that services were inadequate.
- Regulatory sentences. They live in the overlay.
- Intent-only answers such as "what should I say in the meeting." Communication may suggest the question. It does not store an answer as a fact.

## 7. Relationships

Links are hypotheses. A link is `supported` only when the declared match attributes agree on verified values. Otherwise it is `possibly_same` or `unresolved`. The pack does not store confidence numbers. The engine may record a confidence band later; this design requires the band's reason to be one of those three states plus `rejected` when a negative attribute mismatches (different score type, different birth date, different student id).

Model-generated ids are not match attributes.

| Type | From | To | Match guidance | If unclear |
|---|---|---|---|---|
| `initiates_evaluation` | `referral` | `evaluation_plan_item` | Same student, referral date on or before the plan date | unresolved |
| `authorizes_evaluation` | `consent` | `evaluation_plan_item` | Same student, consent action names the evaluation, consent date on or before assessments | unresolved |
| `proposes_assessment` | `evaluation_plan_item` | `measurement` | Area and instrument or task text, plan before `observed_on` | possibly_same |
| `supports_eligibility` | `evaluation_finding` or `measurement` | `eligibility` | Same student, finding date on or before determination | unresolved |
| `documents_need` | `evaluation_finding` | `present_level` | Normalized area. Area text threshold is undefined, so mismatch stays possibly_same | possibly_same |
| `grounds_goal` | `present_level` | `goal` | Area, and measure task when both exist | possibly_same |
| `has_objective` | `goal` | `short_term_objective` | Same goal area and same plan version | unresolved |
| `addressed_by_service` | `goal` | `service` | Only when the document states the link, or area words match the service type after vocabulary synonyms | unresolved. Do not infer speech therapy serves a reading goal |
| `reports_progress_on` | `progress_entry` | `goal` | Same measure construct. Quoted `goal_reference` is supporting text, not the key | unresolved |
| `same_measure_as` | `measurement` | `goal` or `progress_entry` | Measure construct, compatible unit | unresolved when units differ |
| `observes_commitment` | `service_delivery_observation` | `service` | Same service type, overlapping period, compatible provider/location when both present | unresolved |
| `scoped_amendment_of` | `amendment_change` | the concept named by `affected_record_type` | Content key of that concept, `target_plan_date` matches the plan's effective start or an explicit reference | unresolved. Scope is the affected type and key, never the whole plan |
| `succeeds_plan` | `iep.plan` document | earlier `iep.plan` document | Same student, later effective start, and the later document is a plan rather than an amendment. Does not delete the earlier plan | unresolved when dates overlap or the later file is an amendment |
| `references_action` | `school_action` | `consent`, `eligibility`, `service`, or `placement` | Action text and dates. No fuzzy legal match | unresolved |
| `responds_to_request` | `school_action` | `parent_request` | Topic overlap and action date on or after request date | unresolved |
| `informed_by_fba` | `behavior_target` on a BIP | `behavior_target` on an FBA | Same `target_behavior` text or possibly_same | possibly_same |
| `has_participant` | `meeting` | `meeting_participant` | Same document and meeting date | rejected across documents unless the date matches |
| `independent_of` | `evaluation_finding` | `evaluation_finding` | Same area, different author party | This is a disagreement candidate, not a merge |

Chronology uses each document type's ordering date. Amendment composition reads the base plan, then applies each supported `scoped_amendment_of` in effective-date order. Sections not named remain. A later full `iep.plan` may succeed an earlier plan only through `succeeds_plan`. "Latest file wins" is not a rule.

Conflicting assertions (two eligibility categories, two baselines for one measure, school versus independent findings) stay side by side with their authors and dates. `find_disagreement` may describe them. Neither side is deleted.

Uncertain cross-document identity stays on the record as `possibly_same` and is excluded from supported findings.

## 8. Investigations

Investigations are proposals. The universal engine validates inputs and emits a derived finding. This pack does not implement operators. A model may nominate an id from this list. It cannot add an operator or promote a candidate to a finding.

Every finding, when execution exists, records: pinned snapshot, input verified assertion ids, operator id and version, parameters, compatibility and coverage checks, result, caveats, and disposition `SUPPORTED_DERIVATION`, `UNRESOLVED`, or `REJECTED`.

Shared preconditions unless a row says otherwise: inputs verified, subject identity not `possibly_same`, period overlap explicit, and no use of regulatory text as an input.

| Id | Operator | Inputs | Supported result | Otherwise |
|---|---|---|---|---|
| `goal_progress_alignment` | `compare_measurements` | `goal.target_*` and linked `progress_entry` / `measurement` value | Direction and gap in one unit, with both dates | `UNRESOLVED` if link, unit, score type, method, or period fails |
| `baseline_versus_earlier_measurement` | `compare_measurements` | `goal.baseline_*` and the latest compatible `measurement` before the goal document, context evaluation or present levels | The two numbers and their documents. Question, not a verdict | `UNRESOLVED` if no earlier measure or units differ. V2 check `baseline_vs_cited_measure` |
| `measurement_series_toward_target` | `compare_measurements` | Baseline, ordered compatible measurements, target | Ordered series and whether observations moved toward the target | `UNRESOLVED` if the series mixes score types. V2 check `baseline_target_series` |
| `service_commitment_versus_delivery` | `compare_commitment_observation` | `service` commitment and linked `service_delivery_observation` | Compared minutes or sessions over the overlapping period, with both quotes | `UNRESOLVED` when no delivery document exists. Do not report non-delivery |
| `service_amount_change` | `detect_change` | Two versions of the same `service` key, including `minutes_per_week` when verified or validly derived | Before, after, dates, scope = that service row | `UNRESOLVED` if identity is weak. V2 `services_down_progress_insufficient` is not an operator. A suggested question may mention a linked progress status in `insufficient_progress` or `some_progress`. If that status is absent, the question is not asked |
| `accommodation_change` | `detect_change` | Same accommodation key across plan versions or a scoped amendment | Added, removed, or changed condition, with scope | `possibly_same` text does not count as change |
| `amendment_scoped_change` | `detect_change` | `amendment_change` plus the base and amended records of `affected_record_type` | Before/after for that key only | `UNRESOLVED` if the target plan date matches zero or many plans |
| `plan_succession` | `detect_change` | Two plans linked by `succeeds_plan` | Which plan is later, and which keys changed | `UNRESOLVED` if the later document is an amendment |
| `conflicting_evaluations` | `find_disagreement` | Two `evaluation_finding` rows linked `independent_of`, or two measurements of the same construct from different parties | Both statements, both authors, no winner | `UNRESOLVED` if party or area is unknown |
| `eligibility_decision_conflict` | `find_disagreement` | Eligibility versions whose parties differ, or whose categories differ without a later same-party version | Both categories and dates | Same-party later version is a change, not a conflict |
| `referral_to_plan_flow` | `trace_flow` | The relationship chain referral → consent → evaluation plan → measurements/findings → eligibility → present level → goal → service → progress | The hops that are supported, and the hops that are missing | Missing hops stay on the path as unknown. The flow is not evidence that an event failed to occur |
| `service_minutes_aggregate` | `aggregate` | Verified `minutes_per_week` on services whose periods overlap and whose units are already `min/week` | Sum and the list of rows included | `UNRESOLVED` if any row would need an unrun derivation or a unit conversion. The sum is not a judgment of adequacy |
| `need_without_goal` | `identify_gap` | `evaluation_finding.area` with no `grounds_goal` / goal area on the operative plan | A question naming the area and the evaluation | Not a violation. `UNRESOLVED` if area match is only possibly_same. V2 `need_without_goal` |
| `goal_without_present_level` | `identify_gap` | Goal area with no present level in the same plan | A question about where the baseline is stated | V2 `goal_without_present_level` |
| `progress_period_coverage` | `identify_gap` | Goal `reporting_frequency` versus supplied `progress_entry` periods | Periods present in the supplied documents versus periods named by the plan | Missing reports are absent from the upload, not proof they were never written. V2 `progress_report_coverage` |
| `assessment_accommodation_gap` | `identify_gap` | Accommodation whose context is state or district assessment, and `assessment_participation.accommodations` in the same document | Question asking whether the testing accommodation should also appear on the assessment line | **Uses the interpretation overlay, not raw v0.3.** v0.3 fired on context `testing` or `both`. L001 acceptance expects the classroom-testing check not to fire. Context `state_district_assessment` is the candidate rule. v0.3 did not define that context value; it is an overlay addition and must be an explicit accommodation context enum value: `instruction`, `testing`, `state_district_assessment`, `both`, `unspecified` |
| `reevaluation_date_question` | `identify_gap` | Latest evaluation `document_date` among academic, psychoeducational, and speech-language evaluations | A question when the supplied date is more than three years before the study as-of date | The three-year figure is a citation in the overlay (`34 CFR 300.303(b)(2)`), pending legal review. The finding is a question. It is `UNRESOLVED` when dates are missing. It is never a finding of noncompliance |
| `missing_measurement_for_goal` | `identify_gap` | A goal whose measure has no `measurement` or progress value inside the goal's start/target dates | States that no compatible number was found in the supplied documents | Not a statement that progress failed |

`trace_flow` is how referral, consent, evaluation, eligibility, plan, services, and progress become one story. `compare_measurements` is how a goal and a later report become a progress statement. Without those bindings, extraction would only produce isolated rows.

V2 primitives `compareValues`, `absenceOf`, `coChange`, `periodCoverage`, `series`, and `elapsedSince` are mapped onto the seven operators above or listed as unsupported in §11. They are not extra operators.

## 9. Communication

Both audiences read the same pinned assertions and the same derived findings. Wording changes. Facts, omissions, and conflicts do not. The pack does not grant professional access.

**Customer (parent or caregiver).** Plain language. Lead with the current plan, what changed, progress on each goal, what is missing in the uploaded documents, and questions for a meeting. Use the V2 explainers: a goal is what the plan says the child will learn and how it is measured; a service is the help the plan describes, with how often and how long; an amendment changes named parts and leaves the rest in effect; progress is the school's report on a goal, not a grade. Concerns are questions. Do not say the school broke a rule. Do not say a service was withheld because a log is absent.

**Professional (advocate or attorney).** Same findings, denser layout: source, page, quote, author party, modality, dates, relationship state, unresolved identity, and which investigation did not run. Chronology uses ordering dates. Discrepancies list both sides. Requirement citations, if shown, are labeled as cited references pending legal review, not as conclusions.

Suggested customer questions, also the public starters:

1. What does the current plan give my child?
2. What changed since the last plan?
3. Is my child making progress on each goal?
4. What is missing or unclear in these documents?
5. What should I ask at the next meeting?

Professional questions stay in the pack's communication section and off the public pill:

1. Which plan sections are present, blank, or not found in the upload?
2. What changed across plan versions and amendments, and what was the scope?
3. Where do evaluators or documents disagree?
4. What does each measure series show over time?

Vocabulary definitions that must not be collapsed: duration versus session length, location versus placement, baseline versus the latest score, accommodation versus modification, amendment versus a new IEP, progress versus a grade. Abbreviations in the candidate (`IEP`, `PWN`, `FBA`, `BIP`, `WCPM`, and the rest of the v0.3 list) expand only as reading aids. IDEA and FAPE definitions are glossary text, not facts about a child.

## 10. Safe public metadata

This object is safe to generate into web pill metadata. It contains no matching rules.

```json
{
  "contract_version": "domain-pack-public-metadata@1",
  "domain_id": "iep",
  "label": "Special Education / IEP",
  "short_label": "IEP",
  "pill_enabled": true,
  "pill_tone": "iep",
  "placeholder": "My child's IEP meeting is next week. What changed from last year, and what should I ask?",
  "starter_intents": [
    "What does the current plan give my child?",
    "What changed since the last plan?",
    "Is my child making progress on each goal?",
    "What is missing or unclear in these documents?",
    "What should I ask at the next meeting?"
  ]
}
```

Document-type labels are not pills. The interim `2.0.0` public surface is a different object (`public_surfaces`, three starters). This design does not regenerate `public-metadata.generated.json`.

## 11. Regulatory overlay

Eleven V2 rules citing 34 CFR 300.320 and 300.503(b), plus the reevaluation interval citation 34 CFR 300.303(b)(2), are copied into `regulatory_overlay` with their V2 status `CITED_PENDING_LEGAL_REVIEW`, jurisdiction `US-federal`, and source effective date `2006-10-13`. State tables `age_of_majority_by_state`, `transition_start_age_by_state`, and `school_week_minutes` are declared and **empty**.

Rules describe questions a reviewer might ask when a plan is present. They are `not_applicable` when no `iep.plan` is in the upload. They do not create document facts, do not set `identify_gap` to a violation, and do not execute. Transfer-of-rights and percent-time derivations that depend on empty tables do not run.

The executable V2 rulebook, story, narrative block, and intake callbacks in `engine/domain-packs/iep/pack.ts` are omitted.

## 12. Literal mapping

### 12.1 v0.3 record types — 25

| v0.3 id | Disposition |
|---|---|
| All 25 record ids | **Reused** as concept ids |
| All 131 field ids reported by `review-check.json` | **Reused.** This design does not drop a v0.3 field. The candidate repeats them |
| Field `source`, `modality`, `comparison`, `aliases`, `unit` | **Restored.** The interim `2.0.0` converter dropped them |
| `goal` identity | **Transformed** to overlay 0.3.1 (measure key; area and designation if present) |
| `evaluation_plan_item` identity and fields | **Transformed** to overlay 0.3.1 document-scoped line identity |
| `meeting_participant` identity | **Transformed** to include `name` when present |
| `accommodation` | **Transformed** with `kind` so v0.2.1 `modification` is not lost |
| Derivations on service and placement | **Reused as declarations.** Placement percent derivation **blocked** on an empty reference |
| `requirements` (11 rules) | **Moved** to `regulatory_overlay`. Not concepts |
| `insightChecks` (8) | **Transformed** onto the seven generic operators. `coChange` is not an operator |
| `plainExplainers`, audiences, vocabulary, reading notes | **Reused** inside communication, vocabulary, and discovery notes |
| `authorRoles`, `relationshipRules`, `constructs.measure`, missing states, evidence policy | **Reused** |
| Executable pack, prompts, rulebook code | **Omitted** |

### 12.2 v0.2.1 document types — 23

| v0.2.1 id | Disposition |
|---|---|
| `referral`, `evaluation_plan`, `parent_consent`, `academic_evaluation`, `psychoeducational_evaluation`, `speech_language_evaluation`, `eligibility`, `progress_report`, `prior_written_notice` | **Reused** under the v0.3 dotted ids |
| `iep_initial`, `iep_annual` | **Transformed** to `iep.plan` subtypes |
| `iep_amendment` | **Reused** as `iep.amendment` |
| `specialist_evaluation` | **Omitted as a type.** Independent signals map to `iep.evaluation.independent`. Other specialists stay partial or generic |
| `iep_correction` | **Omitted.** No L001–L006 file. Amendments cover scoped edits |
| `service_implementation_record` | **Transformed** to new document type `iep.service.implementation` and concept `service_delivery_observation` |
| `meeting_notice`, `meeting_minutes` | **Transformed** to `iep.meeting.notice` and `iep.meeting.notes` |
| `behavior_assessment`, `behavior_plan` | **Reused** as FBA and BIP |
| `transition_plan`, `placement_record` | **Omitted as document types.** Concepts `transition` and `placement` remain |
| `reevaluation_report` | **Omitted as a type.** Discipline-specific evaluation types plus subtype `reevaluation` |
| `other` | **Omitted.** Unknown documents use the generic engine |

### 12.3 v0.2.1 record types — 23

| v0.2.1 id | Disposition |
|---|---|
| `document` | **Transformed** to `document_header` |
| `student`, `goal`, `service`, `measurement`, `eligibility`, `consent`, `referral`, `placement`, `present_level`, `transition`, `extended_school_year` | **Reused**, with v0.3 field ids rather than the 0.2.1 prefixed ids |
| `objective` | **Transformed** to `short_term_objective` |
| `progress` | **Transformed** to `progress_entry` |
| `notice` | **Transformed** to `school_action` |
| `assessment` | **Split** across `measurement` and `evaluation_finding` |
| `participation` | **Transformed** to `assessment_participation` |
| `behavior` | **Transformed** to `behavior_target` |
| `modification` | **Transformed** into `accommodation.kind` |
| `implementation` | **Transformed** to `service_delivery_observation` |
| `meeting` | **Reused**, and `meeting_participant` from v0.3 is kept as its own concept |
| `evaluation_plan` | **Transformed** to `evaluation_plan_item` |

v0.2.1 eligibility used `crossDocumentMerge: version`. v0.3 used a case singleton. This candidate follows v0.3 plus party-aware versions, so two eligibility documents become versions or a disagreement, not a single overwritten sentence.

### 12.4 Newly proposed

Document types: `iep.behavior.observation`, `iep.meeting.notes`, `iep.meeting.notice`, `iep.service.implementation`.

Concepts: `service_delivery_observation`, `behavior_incident`.

Fields: `goal.designation`, `student.student_id`, `accommodation.kind`, `evaluation_plan_item.list_section`, `evaluation_plan_item.line_text`, `evaluation_plan_item.selected`, accommodation context value `state_district_assessment`, and the fields on the two new concepts.

Investigations in §8 that have no v0.3 check id: service delivery comparison, accommodation change, amendment scope, plan succession, conflicting evaluations, eligibility conflict, referral-to-plan flow, service-minute aggregate, missing measurement.

### 12.5 Interim V3 `iep/2.0.0`

Reused as the current extractor's taxonomy of 15 types and 25 records. Not superseded on disk. Semantic metadata this candidate restores (modality, derivation, investigations, overlay, four document types, two concepts) is absent there. Do not point new studies at `2.0.0` and claim they implement this specification.

## 13. Ambiguities and open decisions

1. **Contract string.** Five-section content is `@3` because `@2` is occupied. If a later approval insists on the string `@2`, the implemented type and the reviewed `2.0.0` pack must be migrated in the same change. This design does not do that.
2. **Goal key.** Overlay 0.3.1 is adopted over v0.3 so one fluency goal can match when area wording differs. If area is required in the key, L001-style series split. Risk: two different goals with the same task and score type and blank area could merge. Mitigation: blank area yields `possibly_same`, not a merge, when `condition` or `statement` diverges inside one plan; across plans, blank area does not support a link.
3. **Area and accommodation text thresholds** are undefined in v0.3 (`knownReviewGaps`). This pack does not invent a similarity cutoff. Unclear text stays `possibly_same`.
4. **`services_down_progress_insufficient`** has no approved operator. It is a suggested question on `service_amount_change`, not a finding by itself.
5. **Three-year reevaluation and the eleven content rules** are cited and not legally reviewed. They cannot become violation findings in this pack.
6. **Empty state tables.** Age of majority, state transition age, and school-week minutes are empty. Dependent checks and derivations do not run.
7. **One student per Hive** is the v0.3 assumption. Differing birth date or student id blocks a merge. A Hive that intentionally holds two children is an unresolved product question. The pack must not merge them.
8. **Final amended IEP** (L003 file 05) is an `iep.plan` when the title is an IEP, subtype `revised`, even if the body says amended. An amendment title wins only when the title zone says amendment and does not say Individualized Education Program.
9. **Speech-language review** filenames may lack the word evaluation. Partial match is acceptable. Exact match requires the evaluation title signals.
10. **Meeting notice** has no L001–L006 exemplar. Signals are from v0.2.1 labels only and should stay at a lower priority until a fixture exists.
11. **Service-to-goal links** are often unstated. The relationship defaults to unresolved.
12. **Multi-document PDF boundaries** are declared and not implemented.
13. **Image-region evidence** is still pending engine support in v0.3. Scanned tables stay `unreadable` rather than guessed.
14. **Qualification report JSON** under V2 `artifacts/` was not readable here. `arch05-l001.ts` criteria are included in the qualification doc as historical expectations, not as a result of this session.
15. **`2.0.0` review status** is stronger than its V2 source status. Left unchanged on purpose.

## 14. Error handling and uncertainty

Align to `error-envelope@1`. Do not add error codes in this ticket. Internal reason codes below are log fields, not new `error_code` values.

| Situation | Run behavior | Envelope | Internal reason |
|---|---|---|---|
| `@3` pack fails validation, or a reviewed required pack is corrupt | Do not load that pack. Do not fall through to a half-parsed pack. Generic extraction may continue only when the pack was optional and the failure is "not selected" | `INVALID_REQUEST`, category `validation`, not retryable | `PACK_SCHEMA_INVALID`, `PACK_DANGLING_REF`, `PACK_UNKNOWN_OPERATOR`, `PACK_CORRUPT` |
| Draft or candidate pack selected for a production run | Refuse the pin | `INVALID_REQUEST` | `PACK_NOT_REVIEWED` |
| Pinned version or digest missing | Refuse | `NOT_FOUND` or `INVALID_REQUEST` if the pin mismatches a loaded file | `PACK_PIN_MISSING`, `PACK_PIN_MISMATCH` |
| Optional pack absent | Generic schema. Not an error | none | `PACK_NOT_SELECTED` |
| Concept missing on a document | Candidate status `missing` or `not_found_in_supplied_documents`. Do not fabricate | none for the field. `COVERAGE_INCOMPLETE` only when the run's required coverage, not the checklist, is unmet | `CONCEPT_NOT_IN_SOURCE` |
| Unknown document type | Match tier `generic`. Extract with the dynamic schema | none | `DOCUMENT_TYPE_UNKNOWN` |
| Identity ambiguity or conflicting dates | Keep both assertions. Relationship `unresolved`. Do not fail the study | none. `MERGE_FAILED` only if persistence of the unresolved state fails | `IDENTITY_UNRESOLVED`, `DATE_CONFLICT` |
| Incompatible units or score types | Investigation disposition `UNRESOLVED`. No arithmetic | none | `MEASUREMENT_INCOMPATIBLE` |
| Incomplete evidence or unverified quote | Do not promote the candidate. Investigation inputs that lack verification are `UNRESOLVED` | `EVIDENCE_NOT_VERIFIED` when verification is the stage outcome | `EVIDENCE_INCOMPLETE` |
| Unresolved relationship | Omit it from supported findings. Trace still shows the hop as unknown | none | `RELATIONSHIP_UNRESOLVED` |
| Model output breaks the schema | Reject that output | `MODEL_OUTPUT_INVALID`, not retryable | existing stage |
| Empty regulatory table blocks a derivation | Skip the derivation. Leave the field unknown | none | `REFERENCE_TABLE_EMPTY` |

Pack load is terminal for that pack. Per-document uncertainty is not terminal. A failed study run does not move the accepted study pointer. Inngest owns retries. Pack validation is not retryable.

Safe user text: "This file could not be used" or "Some items in the upload could not be tied together." No student names, quotes, or rule citations in `message_safe`.

## 15. Observability

Structured logs may include: `correlation_id`, `study_run_id`, `hive_id`, `pack_id`, `pack_version`, canonical digest, `contract_version`, document id, classification `document_type_id` or null, match tier, ambiguity flag, extraction schema version `extraction-schema@1`, schema hash, relationship type, relationship state, investigation id, operator id and version, investigation disposition, and a bounded duration. They must not include page text, quotes, prompts, completions, filenames that contain a student name, or field values.

## 16. How the pack produces cross-document discoveries

Extraction alone lists rows inside each file. The pack adds three declarative joins.

1. **Content identity.** A goal is the same goal in an annual plan and a progress report when the measure construct matches. No shared id is required. Uncertain matches stay open, so the study does not glue two different reading goals into one trend.
2. **Typed relationships.** Evaluation findings can ground present levels, present levels can ground goals, goals can be reported by progress rows, and services can be observed by delivery logs. `trace_flow` walks only the supported hops and shows the gaps.
3. **Operator bindings.** `compare_measurements` states whether a compatible progress number moved relative to a target. `detect_change` states what an amendment changed and what it left alone. `compare_commitment_observation` states a delivery comparison only when a delivery document exists. `find_disagreement` keeps two evaluators visible. `identify_gap` names what the upload does not contain.

A new parent question that the pack did not enumerate still uses these records. The intent planner may add a field or nominate an allowlisted operator. It does not create a second IEP study.

## 17. Future implementation (not in this ticket)

P2.2-DP.I, only after this design is approved:

1. Add a `@3` parser and validator beside `@1` and `@2`. Do not change the `@2` type or `iep/2.0.0`.
2. Teach the catalog to ignore `implementation_status` and `review_status: draft`, and to pin digest with the canonical rule for `@3` only.
3. Compile concept fields to `extraction-schema@1` and `field_guidance`, including nested goal measurement groups and per-item evidence. Reader stays generic.
4. Extend title scoring to title-zone negatives and compound-document spans without IEP branches.
5. Project `safe_public_projection` with the existing public-metadata generator. Do not import the private manifest into Web.
6. Leave relationship resolution, derivations, and investigations unimplemented until P3 and P3.I. The loader may validate their references earlier.
7. Qualify with a synthetic Medicaid `@3` pack and a pack-free grocery run before calling the contract generic.
8. Do not mark the IEP pack `reviewed` until the qualification doc's gates pass on the real L001 PDFs, **including IEP-PACK-QUALIFICATION §12**, and a reviewer accepts the open items in §13.

No migration, model call, commit, or catalog install is authorized by this file.
