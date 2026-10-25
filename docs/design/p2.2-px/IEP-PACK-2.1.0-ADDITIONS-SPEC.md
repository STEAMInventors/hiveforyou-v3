# IEP Domain Pack 2.1.0 — additions specification

**Ticket:** P2.2-PX.I (qualification sub-step — pack authoring input)  
**Status:** **FINAL SPEC (2026-10-24)** — documentation only. Does not create `domain-packs/iep/2.1.0/`, change `domain-packs/iep/2.0.0/`, or alter Worker, Reader, contracts, or database.  
**Contract:** `domain-pack-manifest@2` only (`packages/contracts/src/domain-packs/v2/types.ts`, `packages/core/src/pack-validation.ts`).  
**Baseline pack:** `domain-packs/iep/2.0.0/manifest.json` (`pack_version` `2.0.0`, 15 document types, 25 record types).  
**Target release:** `pack_id` `iep`, `pack_version` `2.1.0`, `supersedes` `2.0.0`, `review_status` `draft` until L001 + qualification gates pass.  
**Authority:** `docs/design/p2.2-dp.d/IEP-DOMAIN-INTELLIGENCE-PACK-SPEC.md`, `docs/design/p2.2-dp.d/IEP-PACK-QUALIFICATION.md`, `C:\Users\abhattacharyya\hiveforyou-v2\brain\domain-packs\iep\iep-pack.v0.3.proposed.json`, `interpretation/iep-interp-v0.3.1.overlay.json`, `docs/design/p2.2-px/PACK-EXTRACTION-PROMPT-ARCHITECTURE.md` §4–§5.

## 1. Purpose

This document is the **approved addition list** for drafting **`iep/2.1.0`** on the **existing `@2` manifest shape**. It closes semantic gaps between the reviewed **`2.0.0`** port and the L001–L006 qualification expectations in `IEP-PACK-QUALIFICATION.md`, without migrating to `domain-pack-manifest@3` or changing runtime code.

**Totals (verified):** **26** priority-0 (P0) additions, **15** priority-1 (P1) additions, **41** unique addition IDs.  
**ID scheme:** `IEP210-P0-NN` / `IEP210-P1-NN` (stable for traceability and authoring tickets).

## 2. `@2` contract conformance

Attributes below are the **only** manifest attributes assumed by the implemented `@2` type and validator. Anything else belongs in **§6 Deferred engine requirements** or in fixed Worker prompt text (`hive-extraction-rules@1`), not in the JSON manifest.

| Manifest path | Supported in `@2` | Used by P2.2-PX prompt compile (§4 PACK-EXTRACTION) |
|---|---|---|
| `contract_version`, `pack_id`, `pack_version`, `review_status`, `supersedes`, `jurisdictions` | yes | domain/pack pins in system prefix |
| `public_surfaces[]` | yes | not in extraction system prompt (public metadata only) |
| `domains[]` | yes | domain label / vocabulary hints if referenced |
| `document_types[]` | yes | `[DOCUMENT TYPES]`, classification rules |
| `document_types[].document_type_id`, `domain_id`, `label` | yes | yes |
| `document_types[].author_role`, `ordering_date_field` | yes | yes |
| `document_types[].match` (`DomainPackMatchSignalsV2`) | yes | yes |
| `document_types[].checklist`, `checklist_policy`, `document_links`, `classification_policy` | yes | checklist → expected record types |
| `document_types[].structure.fields` **or** checklist-only types | yes | fact catalog via `record_types` |
| `record_types[]` | yes | `[FACT CATALOG]` |
| `record_types[].record_type_id`, `label`, `group`, `repeatable`, `description` | yes | yes |
| `record_types[].identity` (`scope`, `key_fields`, `key_fields_if_present`, `disambiguators`, `version_axis`, `case_singleton_merge`, `cross_document_merge`) | yes | identity hints in catalog (resolution deferred P3) |
| `record_types[].fields[]` | yes | fact definitions |
| `fields[].field_id`, `value_kind`, `description`, `sensitive`, `enum` | yes | yes |
| `fields[].source`, `modality`, `derivation`, `comparison`, `aliases` | **no** | **§6** — express via rules text and engine |
| `constructs` | yes (opaque JSON) | measure construct in catalog |
| `relationship_rules` | yes (opaque JSON) | relationship **declarations as data** only |
| `reading_notes`, `plain_explainers`, `vocabulary` | yes | per-type reading notes in `[DOCUMENT TYPES]` |
| `investigations`, `views_and_outcomes`, `regulatory_overlay`, `communication` (five-section `@3`) | **no** | **§6** / P2.2-DP.I / P3.I |

**Progress ordering (preserve):** document-type `ordering_date_field` values and `relationship_rules.temporalSuccessionFieldIds` ordering in `2.0.0` remain authoritative; `2.1.0` **appends** `service_delivery_observation.period_start`, `service_delivery_observation.period_end`, and `behavior_incident.incident_date` to the succession field list only (P1-12). Do not remove or rename existing succession fields.

**Enum wording:** use **exact** string tokens below; order in `enum` arrays is meaningful for extraction output validation.

## 3. P0 additions (26) — required in `2.1.0` manifest

| ID | Addition | `@2` location | Source evidence |
|---|---|---|---|
| IEP210-P0-01 | Document type **`iep.behavior.observation`** (label *Behavior tracking or incident summary*, author `school_evaluator`, ordering `document_header.document_date`, subtypes via `document_header.subtype`: `tracking`, `incident`) | `document_types[]` | `IEP-DOMAIN-INTELLIGENCE-PACK-SPEC.md` §5.2; `IEP-PACK-QUALIFICATION.md` L006 `02`/`03`; candidate `discovery.document_types` |
| IEP210-P0-02 | Document type **`iep.meeting.notes`** (*IEP meeting notes or minutes*, author `education_agency`, ordering `meeting.meeting_date`) | `document_types[]` | Spec §5.2; qualification L003 `03` |
| IEP210-P0-03 | Document type **`iep.meeting.notice`** (*Notice of an IEP meeting*, author `education_agency`, ordering `meeting.meeting_date`) | `document_types[]` | Spec §5.2; v0.2.1 `meeting_notice` |
| IEP210-P0-04 | Document type **`iep.service.implementation`** (*Service delivery or implementation log*, author `education_agency`, ordering `service_delivery_observation.period_end`) | `document_types[]` | Spec §5.2; v0.2.1 `service_implementation_record` |
| IEP210-P0-05 | Record type **`service_delivery_observation`** (repeatable; identity keys `service_type`, `period_start`, `period_end`; if present `provider_role`, `location`; scope `case`; modality **`delivered`** described in `description` / reading notes, not as a field attribute) | `record_types[]` | Spec §6.3; candidate concept fields |
| IEP210-P0-06 | Record type **`behavior_incident`** (repeatable; scope **`document`**; keys `incident_date`, `description`; disambiguator `setting` if needed within document) | `record_types[]` | Spec §6.3; qualification L006 `03` |
| IEP210-P0-07 | Fields on **`service_delivery_observation`:** `service_type`, `category`, `period_start`, `period_end`, `minutes_documented`, `sessions_documented`, `provider_role`, `location`, `note` (kinds per candidate: dates → `date`, counts → `quantity`, else `text`) | `record_types[].fields` | Candidate `concepts.items` |
| IEP210-P0-08 | Fields on **`behavior_incident`:** `incident_date` (`date`), `description` (`text`), `setting` (`text`), `count` (`quantity`) | `record_types[].fields` | Candidate `concepts.items` |
| IEP210-P0-09 | Field **`goal.designation`** (`text`, optional quoted label e.g. “Goal 1”; never inferred) | `goal.fields` | Overlay `goal.fieldsAppend`; spec §6.3 |
| IEP210-P0-10 | **`goal.identity`:** keep keys `measure.task`, `measure.score_type`; set **`key_fields_if_present`** to `["area", "designation"]` (overlay 0.3.1) | `goal.identity` | Overlay `goal.identity`; spec §6.3 |
| IEP210-P0-11 | Fields **`evaluation_plan_item.list_section`** (`code`), **`line_text`** (`text`), **`selected`** (`code`) | `evaluation_plan_item.fields` | Overlay `fieldsAppend` |
| IEP210-P0-12 | **`evaluation_plan_item.list_section` enum:** `existing_information_available`, `proposed_areas_for_evaluation`, `information_to_be_gathered` | field `enum` | Overlay |
| IEP210-P0-13 | **`evaluation_plan_item.selected` enum:** `selected`, `not_selected` | field `enum` | Overlay |
| IEP210-P0-14 | **`evaluation_plan_item.identity`:** `scope` **`document`**; **`key_fields`** `["list_section", "line_text"]`; retain legacy fields `area`, `assessment` for extraction compatibility but **do not** use them in `key_fields` | `evaluation_plan_item.identity` | Overlay; spec §6.3 |
| IEP210-P0-15 | Field **`accommodation.kind`** (`code` enum: **`accommodation`**, **`modification`**, **`unspecified`**) | `accommodation.fields` | Spec §6.3 |
| IEP210-P0-16 | Extend **`accommodation.context` enum** with **`state_district_assessment`** (keep `instruction`, `testing`, `both`, `unspecified`) | `accommodation.fields` | Spec §8 `assessment_accommodation_gap`; overlay insight replacement |
| IEP210-P0-17 | Field **`student.student_id`** (`text`, **`sensitive`: true**) | `student.fields` | Spec §6.3 |
| IEP210-P0-18 | **`meeting_participant.identity`:** add **`key_fields_if_present`: `["name"]`** (keep `role_code` in `key_fields`) | `meeting_participant.identity` | Spec §6.3 transform |
| IEP210-P0-19 | **`iep.plan` match signals:** title-zone negatives for progress report, amendment, prior written notice, FBA, BIP, meeting notes/minutes (spec §5.3) | `document_types[].match.negative_keywords` / `title_only_patterns` | Spec §5.3 |
| IEP210-P0-20 | **`iep.progress` match:** reject title that is only “Individualized Education Program” | `match` | Spec §5.3 |
| IEP210-P0-21 | **Evaluation types** (`iep.evaluation.*`): shared negatives vs plan, progress, eligibility titles | `match` | Spec §5.3; extend `2.0.0` partial set |
| IEP210-P0-22 | **`iep.behavior.fba` / `iep.behavior.bip`:** mutual title negatives | `match` | Spec §5.3 |
| IEP210-P0-23 | **`iep.behavior.observation`:** negatives vs FBA, BIP, IEP plan titles | `match` | Spec §5.3 |
| IEP210-P0-24 | **`iep.service.implementation`:** reject IEP plan title; service grid inside plan stays `iep.plan` + `service` rows | `match` + reading note | Spec §5.3 |
| IEP210-P0-25 | **`iep.consent`:** require permission/signature signal in match or `classification_policy`; body word “consent” alone insufficient | `match` / `classification_policy` | Spec §5.3 |
| IEP210-P0-26 | Checklists for new types: **`iep.behavior.observation`** → `document_header`, `student`, `behavior_incident`, `measurement`; **`iep.meeting.notes`** → `document_header`, `student`, `meeting`, `meeting_participant`; **`iep.meeting.notice`** → `document_header`, `student`, `meeting`; **`iep.service.implementation`** → `document_header`, `student`, `service_delivery_observation` | `document_types[].checklist` | Candidate discovery |

## 4. P1 additions (15) — should ship in `2.1.0` draft; non-blocking for first compile against L001 eight-doc set

| ID | Addition | `@2` location | Source evidence |
|---|---|---|---|
| IEP210-P1-01 | **`reading_notes.by_document_type`** entries for **`iep.behavior.observation`**, **`iep.meeting.notes`**, **`iep.meeting.notice`**, **`iep.service.implementation`** (subtype and delivery-vs-plan distinctions) | `reading_notes` | Spec §5.3–§5.4; `2.0.0` pattern |
| IEP210-P1-02 | **`plain_explainers.byRecordType`** entries for **`service_delivery_observation`**, **`behavior_incident`** | `plain_explainers` | Spec §9 |
| IEP210-P1-03 | **`document_links`** on new document types (e.g. observation → plan; implementation → `service`; notes → plan) | `document_types[].document_links` | Spec §7 lineage |
| IEP210-P1-04 | **`disambiguation_priority`** for new types vs `iep.plan` / `iep.progress` (observation and implementation **more specific** than plan) | `document_types[].match` | Spec §5.3 ties |
| IEP210-P1-05 | **`vocabulary.fieldSynonyms`** merge: oral reading fluency / ORF → `measure.task` value **reading fluency** (overlay) | `vocabulary` | Overlay `vocabulary.fieldSynonyms` |
| IEP210-P1-06 | **`relationship_rules` typed link catalog** as JSON data (ids matching spec §7: `observes_commitment`, `informed_by_fba`, etc.) — **declarations only** | `relationship_rules` | Spec §7; P3 resolution deferred |
| IEP210-P1-07 | **`relationship_rules.changeRequiresTemporalSuccession`** and **`conflictWhenDifferentParties`** unchanged; document **`unchangedRequiresLogicalSuccession`** intent captured in reading notes until engine supports overlay flag | `relationship_rules` / notes | Overlay vs `2.0.0` |
| IEP210-P1-08 | **`iep.evaluation.*` `document_header.subtype` enum** includes **`reevaluation`** where absent on `2.0.0` evaluation types | `document_header` enum via checklist docs | Qualification L002/L005 filenames |
| IEP210-P1-09 | **`iep.plan` `document_header.subtype` enum:** `initial`, `annual`, `review`, `revised`, `reevaluation`, `interim`, **`other`** (preserve existing tokens; add missing) | `document_header` | Spec §5.2 |
| IEP210-P1-10 | **`public_surfaces[0].starter_suggestions`** align wording with spec §9 customer questions (no new IDs) | `public_surfaces` | Spec §9 |
| IEP210-P1-11 | Global **`reading_notes.global`** sentence on **compound PDFs**: uncertain span → partial tier, no invented split | `reading_notes.global` | Spec §5.3; open §13.12 |
| IEP210-P1-12 | Append **`period_start`**, **`period_end`**, **`incident_date`** to **`relationship_rules.temporalSuccessionFieldIds`** | `relationship_rules` | Overlay + new concepts |
| IEP210-P1-13 | **`iep.meeting.notice` match** deprioritized vs minutes/PWN until fixture exists (lower `disambiguation_priority`) | `match` | Spec §13.10 |
| IEP210-P1-14 | **`parent.correspondence`:** weak “Dear” body keywords; **`negative_keywords`** never override strong foreign title | `match` | Spec §5.3 |
| IEP210-P1-15 | **`constructs.measure`:** confirm **`onPartialMatch`: `possiblySame`** and normalization list matches `2.0.0` (no semantic change); document in pack changelog only | `constructs` | `2.0.0` + spec §6.2 |

## 5. Traceability matrix (additions → qualification → baseline delta)

| Addition ID | Qualification / acceptance touchpoint | `2.0.0` delta |
|---|---|---|
| P0-01–04 | `IEP-PACK-QUALIFICATION.md` §3 L003, L006; §2 L001 unchanged (15 types) | +4 document types |
| P0-05–08 | L006 service delivery / incidents; §12.6 missing delivery doc | +2 record types, +13 fields |
| P0-09–10 | L001 goal series; arch05 goal key / fluency | +1 field; identity tweak |
| P0-11–14 | L001 `02_evaluation_plan.pdf` line items | +3 fields; identity scope change |
| P0-15–16 | L001 classroom testing vs state assessment gap (§2 arch05) | +1 field; +1 enum value |
| P0-17–18 | L003 meeting participants; student merge rules | +1 field; identity tweak |
| P0-19–26 | §2 classification expectations; L002 `07` partial speech review | match + checklist only |
| P1-01–15 | §3–§6 corpora polish; `P2.2-PX-pack-extraction-L001.md` P6 (types in pack) | metadata / hints |

**L001 eight-document path:** P0 set **does not** require new types for the initial eight fixtures (still classifies with existing 15 types). P0-01–08 and P0-19–26 enable **L003/L006** and reduce misclassification before integrated qualification. Tier-1 acceptance may continue to pin **`2.0.0`** until **`2.1.0`** is reviewed; this spec does not retarget acceptance automatically.

## 6. Deferred engine requirements (not manifest `@2` attributes)

The following are **explicitly out of scope** for `2.1.0` JSON and remain engine / later-ticket responsibilities. Do not smuggle them into the manifest as unsupported keys.

| Topic | Why deferred | Owning phase |
|---|---|---|
| Per-field **`source`**, **`modality`**, **`derivation`**, **`comparison`** on all 131 v0.3 fields | Not in `DomainPackRecordFieldV2` | P2.2-PX.I validator + `hive-extraction-rules@1`; derivations P3 |
| **`investigations`** bindings (e.g. `goal_progress_alignment`, `service_commitment_versus_delivery`) | No `@2` section | P3.I operators |
| **`regulatory_overlay`** and 11 federal **content rules** as executable checks | Spec §13.5; not evidence | Legal review + P3.I |
| **`views_and_outcomes`** / Q01–Q04 catalog | `@3` candidate only | P2.2-DP.I |
| **Compound PDF** page-span split | Spec §13.12 | Reader + classify stage |
| **`parseFrequency` / `ratePerWeek` / `shareOfTotal`** derivations | Overlay primitives | Engine Core P3 |
| **Relationship resolution** (`supported` / `possibly_same` / `unresolved`) | Spec §7 | P3 merge |
| **`assessment_accommodation_gap` execution** | Uses `state_district_assessment` enum (P0-16) but operator **`identify_gap`** | P3.I |
| **Image-region evidence** for scanned tables | Spec §13.13 | Reader P2.1+ |
| **Area / accommodation text similarity thresholds** | Spec §13.3 | Engine policy |
| **Multi-student Hive** product rule | Spec §13.7 | Product + P3 merge |
| **`services_down_progress_insufficient`** as operator | Spec §13.4 | Question text only |

## 7. Authoring rules for draft `domain-packs/iep/2.1.0/manifest.json`

1. **Copy-forward** from `2.0.0`; apply P0 then P1; bump **`pack_version`** to **`2.1.0`**, set **`supersedes`** **`2.0.0`**, set **`review_status`** **`draft`** until qualification passes.
2. **Do not rename or remove** existing `document_type_id`, `record_type_id`, or `field_id` values present in `2.0.0`.
3. **Do not change** `measure.score_type` enum tokens or order (progress ordering for comparisons).
4. **New IDs only** as listed in §3–§4.
5. Run `node scripts/generate-domain-pack-public-metadata.mjs` only after **`review_status: reviewed`** authorization (not part of this spec ticket).
6. Qualification gate before **`reviewed`:** `IEP-PACK-QUALIFICATION.md` (including §12 when orchestration exists) on real L001 PDFs; **`iep.meeting.notice`** remains **missing exemplar** (documented gap — P1-13).

## 8. Consistency verification (this ticket)

| Check | Result |
|---|---|
| P0 count = 26 | PASS (`IEP210-P0-01` … `IEP210-P0-26`) |
| P1 count = 15 | PASS (`IEP210-P1-01` … `IEP210-P1-15`) |
| Addition ID uniqueness | PASS (41 unique IDs) |
| Every P0/P1 maps to `@2` path or §6 deferred | PASS |
| Checklist references match candidate closures | PASS (P0-26, P1-01) |
| Source evidence cited (spec, qualification, overlay, candidate) | PASS |
| Enum wording matches overlay/spec | PASS (§3 P0-12, P0-13, P0-16) |
| Missing exemplar documented | PASS (`iep.meeting.notice`, §7.6) |
| `domain-packs/iep/2.0.0/` unchanged | PASS (no repo edits under that path) |
| Unsupported manifest attributes moved to §6 | PASS |

## 9. Remaining gaps (post-spec)

1. **Draft manifest bytes** — `domain-packs/iep/2.1.0/manifest.json` not authored (separate approval).
2. **Acceptance pin** — `P2.2-PX-pack-extraction-L001.md` still references **`2.0.0`** until tier-1 tests intentionally adopt **`2.1.0`**.
3. **`@3` candidate** — `docs/design/p2.2-dp.d/iep-manifest@2.CANDIDATE.json` remains **`CANDIDATE_NOT_IMPLEMENTED`**; not superseded by this `@2` release.
4. **Legal review** of cited federal rules — still pending (spec §13.5).
5. **Meeting notice fixture** — no L001–L006 PDF exemplar (spec §13.10).

No migration, Worker, Reader, or database change is authorized by this document.
