# IEP pack qualification — test matrix

**Ticket:** P2.2-DP.D  
**Status:** **CLOSED (design, 2026-10-22)** — acceptance criteria for future **P2.2-DP.I**; no test executed for this design ticket.  
**Candidate:** `docs/design/p2.2-dp.d/iep-manifest@2.CANDIDATE.json`  
**Spec:** `docs/design/p2.2-dp.d/IEP-DOMAIN-INTELLIGENCE-PACK-SPEC.md`  
**Unified question planning:** `docs/design/p2.2-dp.d/UNIFIED-QUESTION-PLANNING.md`

Passing these gates is required before `review_status` can become `reviewed` and before a study may pin `iep@3.0.0-candidate`. Unit tests of the parser are not product acceptance. L001 must use the eight PDFs, not the snippet corpus alone.

## 1. Fixtures located

V3 snippets (classification only): `experiments/pack-driven-reader-l001/src/corpus.ts`.

V2 synthetic PDFs, marked synthetic in the L001 README. Do not copy real student records into this repo.

| Corpus | Path | Files |
|---|---|---|
| L001 | `C:\Users\abhattacharyya\hiveforyou-v2\engine\intake\fixtures\l001` | 8 PDFs listed below. SHA-256 values are from that README |
| L002 | `...\fixtures\l002` | 9 PDFs. Reevaluation lifecycle |
| L003 | `...\fixtures\l003` | 5 PDFs. Amendment and meeting notes |
| L004 | `...\fixtures\l004` | 5 PDFs. Three progress reports |
| L005 | `...\fixtures\l005` | 6 PDFs. Reevaluation without a separate academic file |
| L006 | `...\fixtures\l006` | 9 PDFs. FBA, BIP, notice, amendment, behavior tracking |

V2 `artifacts/arch05-l001-qualification/` and `artifacts/intake-qualification/qualification-report.json` exist. Their JSON was not readable in the design session. Do not cite them as passed.

Historical checks in `engine/domain-packs/iep/qualification/arch05-l001.ts` (`L001_QUALIFICATION_AS_OF_DATE` `2026-10-21`) are **expected behaviors to re-evaluate**, not results:

- One student entity and eight document versions, not eight merged students.
- At least one resolved reading goal.
- One reading-fluency measure series.
- A corroborated 42 WCPM observation.
- A planned target of 75 WCPM.
- Foundation service `minutes_per_week` 150 when the derivation operands verify.
- An 86 percent comparison labeled as a match, not as unchanged narrative.
- No comparisons on narrative statement fields.
- Classroom testing accommodation does not fire the state-assessment gap.
- Service row present with `end_date` missing, not invented.
- Referral ordering date `2024-08-20` sorts first when that date is the verified referral date.
- No absence finding that treats a blank optional field as proof.
- No orphan records.

V2's 168 accepted facts are a diagnostic count, not a pass threshold.

## 2. L001 document expectations

| File | SHA-256 | Expected type | Subtype | Concepts that must be sought |
|---|---|---|---|---|
| `01_initial_referral.pdf` | `8ae4ac0ce3009151dea07f9751e65fab11d9147a67f2eec2f5f1ecd09be4629d` | `iep.referral` | — | `document_header`, `student`, `referral` |
| `02_evaluation_plan.pdf` | `ffd4ebe21c06d6e365d9d581b996e17a79a7f81207722e83b1c1005dc70935c6` | `iep.evaluation.plan` | — | header, student, `evaluation_plan_item` per line |
| `03_parent_evaluation_consent.pdf` | `864013b7e57a576ce6587589c67baa03003cf56c7cf0fb4fc01c2f6b43aded9c` | `iep.consent` | — | header, student, `consent` |
| `04_psychoeducational_evaluation.pdf` | `7496e950f951b666a7d532ad8c8d782946b60688650084c84b5ebebf9b17ef7d` | `iep.evaluation.psychoeducational` | — | header, student, `measurement` per score, `evaluation_finding` |
| `05_academic_evaluation.pdf` | `5fde3e11eaeb224daa7df5a61e72dd9d351dc6c02ee634e5ee51ee478449ec3f` | `iep.evaluation.academic` | — | same pattern as academic scores |
| `06_speech_language_evaluation.pdf` | `8adc5107634a1be4ab7d9b4f0817b0f254331ce1598de4ac5a859d1257e810fd` | `iep.evaluation.speech_language` | — | same pattern |
| `07_eligibility_determination.pdf` | `35b0594bbbbc68239a3dad3a657290b1ea08093e2290a0d093ef716ca1c72ba2` | `iep.eligibility` | — | header, student, meeting if present, `eligibility` |
| `08_initial_iep.pdf` | `1e6b380e4a348029a97d1648228530b8cb060609c1ec30404cc43545d9833e2c` | `iep.plan` | `initial` | checklist on `iep.plan`, including one record per goal row and per service row |

Cross-document expectations on the same study:

- Referral, consent, plan items, evaluations, eligibility, and the initial plan form a `referral_to_plan_flow`. Hops without a verified link stay unknown.
- Academic or present-level fluency measurements and the goal baseline/target share one `measure` when task and score type match. WCPM is not compared with percent accuracy.
- Service rows keep minutes, location, and dates together. "150 minutes weekly" is not split into a session length.
- Goal target value and accuracy criterion stay separate fields.
- Student name or birth date disagreements across the eight files do not merge.

## 3. L002–L006 expectations

| File | Expected type | What the study must show |
|---|---|---|
| L002 `01_prior_eligibility_determination.pdf` | `iep.eligibility` | Earlier eligibility version |
| L002 `02_prior_iep.pdf` | `iep.plan` | Earlier plan. Subtype may be `annual` or `other` if the form does not say |
| L002 `03_annual_progress_report.pdf` | `iep.progress` | Progress rows linked to prior goals only through the measure construct |
| L002 `04_reevaluation_plan.pdf` | `iep.evaluation.plan` | Subtype `reevaluation`. Not a plan IEP |
| L002 `05_psychoeducational_reevaluation.pdf` | `iep.evaluation.psychoeducational` | Subtype `reevaluation`. Findings stay independent of any other evaluator |
| L002 `06_academic_reevaluation.pdf` | `iep.evaluation.academic` | Subtype `reevaluation` |
| L002 `07_speech_language_review.pdf` | `iep.evaluation.speech_language` or partial | Must not exact-match `iep.plan` |
| L002 `08_reevaluation_eligibility_determination.pdf` | `iep.eligibility` | Later version if same party and later date. Category text is not overwritten in history |
| L002 `09_reevaluation_iep.pdf` | `iep.plan` | Subtype `reevaluation`. `succeeds_plan` only if identity and dates support it |
| L003 `01_prior_annual_iep.pdf` | `iep.plan` | Subtype `annual` |
| L003 `02_progress_report.pdf` | `iep.progress` | Period on the progress record, not the plan effective date |
| L003 `03_iep_team_meeting_notes.pdf` | `iep.meeting.notes` | Meeting and participants. Not an IEP plan |
| L003 `04_iep_amendment_summary.pdf` | `iep.amendment` | One `amendment_change` per affected section. Unmentioned plan sections remain |
| L003 `05_final_amended_iep.pdf` | `iep.plan` | Subtype `revised` when the title is an IEP. Body word "amended" does not reclassify it as only an amendment |
| L004 `01_annual_iep.pdf` | `iep.plan` | Subtype `annual` |
| L004 `02`–`04` progress Q1–Q3 | `iep.progress` | Three periods. `progress_period_coverage` counts only supplied reports |
| L004 `05_academic_evaluation.pdf` | `iep.evaluation.academic` | Scores are measurements, not goals |
| L005 `01_prior_iep.pdf` | `iep.plan` | Prior plan retained after the later reevaluation plan |
| L005 `02_reevaluation_plan.pdf` | `iep.evaluation.plan` | Subtype `reevaluation` |
| L005 `03_psychoeducational_reevaluation.pdf` | `iep.evaluation.psychoeducational` | Independent findings if the author party differs |
| L005 `04_speech_language_review.pdf` | `iep.evaluation.speech_language` or partial | Same constraint as L002 |
| L005 `05_reevaluation_eligibility_determination.pdf` | `iep.eligibility` | Version or disagreement, not a silent overwrite |
| L005 `06_reevaluation_iep.pdf` | `iep.plan` | Later plan does not delete the prior plan's snapshot |
| L006 `01_prior_annual_iep.pdf` | `iep.plan` | Base plan for later amendment scope |
| L006 `02_classroom_behavior_tracking.pdf` | `iep.behavior.observation` | Subtype `tracking`. Not an FBA |
| L006 `03_behavior_incident_summary.pdf` | `iep.behavior.observation` | Subtype `incident`. `behavior_incident` rows. Similar incidents are not merged |
| L006 `04_functional_behavior_assessment.pdf` | `iep.behavior.fba` | `behavior_target` and measurements |
| L006 `05_behavior_intervention_plan.pdf` | `iep.behavior.bip` | Targets link to the FBA only when behavior text matches or is `possibly_same` |
| L006 `06_prior_written_notice.pdf` | `iep.notice` | `school_action` with proposed or refused. Not a legal conclusion |
| L006 `07_iep_amendment.pdf` | `iep.amendment` | Scope limited to `affected_record_type` |
| L006 `08_behavior_progress_report.pdf` | `iep.progress` | Title progress wins over behavior words in the body |
| L006 `09_current_annual_iep.pdf` | `iep.plan` | Subtype `annual`. Compared with the prior annual plan by content key |

## 4. Arbitrary questions

Run at least these intents on a pinned L001 study, then repeat one after adding an L004 progress report to the same Hive. The second run creates a new study revision. It does not create a second study. Prior answers remain inspectable.

| Intent | Acceptable use of the pack | Reject |
|---|---|---|
| "What does the current plan give my child?" | Verified services, goals, placement, with page anchors | A service that was not quoted |
| "Is reading fluency moving toward the target?" | `goal_progress_alignment` or `measurement_series_toward_target` when units match | Arithmetic across WCPM and percent accuracy |
| "Did the school skip the evaluation?" | `referral_to_plan_flow` with unknown hops named as unknown | "The school failed to evaluate" |
| "What should I ask about behavior?" (no behavior documents) | Say those documents are not in the upload | An FBA extracted from an unrelated IEP sentence |
| A question the pack does not list, such as "Who signed the consent?" | Dynamic field on the consent document, verified quote | A new pack concept invented at runtime |

## 5. Two audiences, one study

On one pinned snapshot, produce a customer explanation and a professional explanation.

Pass: every factual sentence in both views maps to the same assertion ids or the same finding id. The professional view may add chronology, relationship state, and unresolved items. The customer view may use the plain explainers. Neither view may add a fact, drop a conflict, or change a number.

Fail: the professional view states a violation the customer view does not have as a finding, or the customer view hides an unresolved identity.

Access control is not part of the pack. An unauthorized professional request is `ACCESS_DENIED` before any wording is chosen.

## 6. Synthetic Medicaid pack

A second pack, not shipped here, must validate against the same `@3` rules. Suggested id `medicaid-financial-review`, version `0.1.0-candidate`, `review_status: draft`.

Minimum contents:

- Document types: bank statement, gift letter, application declaration.
- Concepts: account, transfer, declaration. No IEP concept ids.
- Relationship: transfer may `possibly_conflict_with` a declaration. Unresolved unless amount, date, and account attributes support it.
- Investigations: `trace_flow` along transfer hops; `find_disagreement` between a transfer and a declaration. Disposition is a possible discrepancy.
- Communication: applicant plain language and attorney evidence list, same assertions.
- Public projection: one pill, no account numbers.

Pass criteria:

- Adding the pack files and public metadata requires zero domain branches in Web, Worker, Reader, and Core.
- The finding text does not say the applicant is ineligible.
- IEP investigations do not run on these documents.
- The IEP pack is not required for this Hive.

## 7. Pack-free grocery receipts

No pack selected. Twenty receipts, then ten more, one study.

Pass:

- The engine proposes line items, merchants, and amounts from the documents.
- A later intent about organic products returns unknown where the receipt has no organic label.
- Unit-price comparison uses `compare_measurements` or `aggregate` only when units match.
- Purchase is not treated as consumption.
- IEP concepts are not applied because a filename contains a number.

Fail: a grocery total that mixes incompatible units, or a study that resets at receipt 21.

## 8. Negative tests

| Case | Expected |
|---|---|
| Quote that does not contain the field value | `EVIDENCE_NOT_VERIFIED`. Record not promoted |
| WCPM progress compared with percent-accuracy target | Investigation `UNRESOLVED`, reason `MEASUREMENT_INCOMPATIBLE` |
| Two goals with the same task and different `condition` in one plan | Not merged |
| Two students with different birth dates | `possibly_same` or separate. Not one student |
| Amendment that names only accommodations | Services and goals from the base plan remain |
| Service commitment and no delivery log | `service_commitment_versus_delivery` is `UNRESOLVED`, not "not delivered" |
| Progress report title containing the word IEP in the body | Type `iep.progress` |
| IEP title containing the word progress in a goal sentence | Type `iep.plan` |
| Classroom testing accommodation | `assessment_accommodation_gap` does not fire |
| Empty age-of-majority table | Transfer-of-rights regulatory question does not run |
| Unknown operator id in a mutated pack | Pack rejected, `INVALID_REQUEST` |
| Dangling concept id in a checklist | Pack rejected |
| Draft candidate pinned by a production run | Rejected, `PACK_NOT_REVIEWED` |
| Corrupt reviewed pack required by the run | Fail closed. No silent skip |
| Optional pack missing | Generic extraction. Not an error |
| Regulatory citation copied into a candidate fact | Verifier rejects it as non-source |
| Audience switch | No new assertions |

## 9. Contract and catalog gates

| Gate | Pass | Fail |
|---|---|---|
| `@1` IEP `1.0.0` still loads | Existing P2.2 tests stay green | A `@3` parser change breaks `@1` |
| Implemented `@2` IEP `2.0.0` still loads | Current catalog tests stay green | Candidate file is copied into `domain-packs/` before the parser exists |
| `@3` candidate | Validator accepts the candidate and rejects the negative mutations in §8 | Draft pack is selectable |
| Public projection | Only the allowlisted keys reach Web | A title signal or citation appears in pill metadata |
| Digest | Canonical digest is stable across key order | Raw pretty-print changes the `@3` pin |
| Operators | Each of the seven ids is referenced at least once, and no other operator id appears | A pack-defined primitive runs |

## 10. Done when

1. The candidate validates with zero dangling references and zero unknown operators.
2. L001's eight PDFs classify to the types in §2, with partial tier only where this document allows it.
3. Goal and service rows survive as records, with page quotes, across L001 and at least one of L003 or L006.
4. One supported measurement comparison and one unresolved incompatible comparison are both visible.
5. One amendment changes only its declared scope.
6. Customer and professional views share assertion ids.
7. A synthetic Medicaid `@3` pack and a pack-free grocery revision run on the same engine.
8. Open items in the spec §13 are either closed or still labeled unresolved in the output.
9. Unified question planning gates in §12 pass on the same engine path as L001 and grocery qualification.

Until those are demonstrated, the pack stays `CANDIDATE_NOT_IMPLEMENTED`.

## 11. Canonical question catalog (views_and_outcomes)

| Check | Pass | Fail |
|---|---|---|
| View count | Exactly `customer` and `professional`; neither grants access | Extra view or access coupling |
| Question count | Exactly four ids `Q01`–`Q04`; `Q01` on both views | Duplicate ids or missing shared Q01 |
| Reference integrity | Every `required_concepts`, `required_relationships`, and `investigation_ids` entry resolves in the candidate | Dangling id |
| Operators | Every bound investigation uses the pack allowlist | Unknown operator |
| Planning | Frozen `study-question-set@1`; uploader atomics, catalog questions, and prior unresolved merge with origins preserved per `UNIFIED-QUESTION-PLANNING.md` | Unmatched uploader text dropped; question set changes after classification |
| Q03 negative | Missing progress reports → meeting prep UNRESOLVED, not “no progress” | Violation or non-delivery claim |
| Q04 selection | Q04 included only when relevance/trigger satisfied, not solely because IEP pack is pinned | Q04 auto-selected on every IEP Hive |

Question-to-investigation mapping is declared on each question in `views_and_outcomes.canonical_questions` inside `iep-manifest@2.CANDIDATE.json`.

## 12. Unified question planning acceptance (P2.2-DP.D)

Design-only gates until P2.2-DP.I implements the planner. Each row is a required qualification scenario.

| # | Scenario | Pass | Fail |
|---|---|---|---|
| 12.1 | Multi-part uploader intent | ≥2 atomics; every span maps to an atomic; all appear in merged set with origins | Lost wording or dropped atomic |
| 12.2 | Narrow vs broad progress | “Reading fluency on track?” and “How is my child progressing overall?” remain **two** `study_question_id`s; may share `goal_progress_alignment` finding when scopes overlap | Merged into one question because of similarity |
| 12.3 | Shared investigation | Q01 + Q02 + narrow reading question → one `run_key` per compatible parameter scope; coverage links all question ids | Three separate executions with identical inputs |
| 12.4 | Finding reuse | Second run reuses accepted finding when `run_key` and revision inputs match; `execute: false` with reuse reason | Duplicate operator run with no new evidence |
| 12.5 | Ambiguous catalog match | Uploader atomic kept; `match_status: ambiguous`; no merge | Uploader question removed or folded without equivalence proof |
| 12.6 | Missing service-delivery records | `service_commitment_versus_delivery` not scheduled or UNRESOLVED; gap language only | “Service was not delivered” or equivalent |
| 12.7 | Budget exhaustion | `deferred_investigations[]` populated; `answer_status` not `SUPPORTED` for questions needing deferred CORE work; run does not claim completeness for them | Silent skip or “complete” answer |
| 12.8 | Pack-free grocery | No catalog; dynamic questions; same planner contracts; aggregate/compare only with compatible units | IEP catalog or concepts applied |
| 12.9 | New intent, same study | New question set and run; `based_on_revision_id` set; prior answers inspectable | Second Canonical Study |
| 12.10 | Planning failure | `FAILED`; `current_revision_id` unchanged; prior coverage valid | Pointer advanced or prior revision lost |
| 12.11 | Private intent | Verbatim intent in authorized private store only; logs contain hash/id, not raw text | Intent or excerpts in logs or public JSON |
| 12.12 | Evidence vs answer | `evidence_coverage: IN_SCOPE_PARTIAL` with `answer_status: PARTIAL` or `UNRESOLVED`; never `SUPPORTED` with missing CORE investigation | Complete answer with partial evidence |
| 12.13 | Classification boundary | After classify, prerequisite flags update; merged question count unchanged | Questions added/removed post-classify |
| 12.14 | Structured equivalence | Merge only when subject, time, population, scope, qualifiers align | Merge justified by similarity score alone |

**Verification (this ticket):** Documentation updated; no runtime tests executed.
