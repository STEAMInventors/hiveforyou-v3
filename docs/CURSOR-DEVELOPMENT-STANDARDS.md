# HiveForYou V3 — Cursor Development Standards

## Purpose
Use Cursor as a disciplined engineering agent. Deliver measured, user-facing capabilities with minimal complexity and strong production supportability. These standards govern prompting and implementation; product and architectural decisions remain revisable with approval.

## 1. Authoritative Context
Before proposing or implementing a ticket, consult the current `PRODUCT-REQUIREMENTS.md`, `ARCHITECTURE.md`, `REPOSITORY-STRUCTURE.md`, `DEVELOPMENT-PLAN.md`, `NEXT.md`, and relevant `.cursor/rules/*.mdc`. Respect the Brand Guide for UI. Historical V2 documents are reference material only. Inspect actual source before naming exact files/functions or claiming an implementation exists.

## 2. Standard Cursor Prompt
Every substantial implementation prompt includes:
- **Ticket:** Exact phase and ticket identifier.
- **Objective:** One measurable outcome.
- **Context:** Current behavior, relevant requirements, contracts, known evidence.
- **Scope:** Approved components/files; identify files rather than inventing paths.
- **Constraints:** Invariants and explicit exclusions.
- **Implementation:** Required behavior without speculative framework expansion.
- **Error Handling:** Failure modes, codes, logging, timeouts, retries and recovery.
- **Observability:** Correlation IDs and service-level diagnostics.
- **Verification:** Positive and negative tests, integration and acceptance checks.
- **Done When:** Objective evidence of user-facing completion.
- **Report:** Diff/changed files, tests, evidence, risks, unresolved items.

Avoid ambiguous prompts such as “fix everything,” “refactor as needed,” and “make enterprise grade.” Use verified path/line references; when unknown, ask Cursor to locate them before implementation.

## 3. Two-Step Workflow for Complex Work
**Prompt A — Investigate, read-only.** Inspect current behavior and affected contracts, diagnose actual errors, propose minimal changes, alternatives, risks, and focused verification. Stop for review.

**Prompt B — Implement approved plan.** Limit changes to approved scope. Run relevant verification. Explain anything unexpected; do not expand scope silently. User approval is required before implementation.

## 4. Scope and Ticket Discipline
Only work on the active ticket in `NEXT.md`. Place unrelated improvements and discovered defects in its parking lot. Do not advance a ticket on passing unit tests alone. Stop and seek approval if an unexpected issue requires changes outside scope.

## 5. Simplicity and Configuration Discipline
Prefer one execution path for UI and integrated testing; one authoritative configuration setting per decision; no competing model gateways, silent provider fallbacks, duplicate environment variables, shadow pipelines or bespoke orchestrators. All model calls use the approved LiteLLM gateway unless a new direction is approved. New packages, adapters, services, config variables, flags, and retry systems require a demonstrated need and explicit review. Do not weaken a validator or reconfigure infrastructure merely to make a failing test pass.

## 6. Production Error Handling and Operational Support
Error handling is part of feature completion. At relevant service boundaries:
1. Classify failures (input, authorization, dependency, model, persistence, transient, unexpected) and expose stable, useful error codes.
2. Write structured, sanitized logs with timestamp, severity, component, operation, stage, error code, and correlation ID.
3. Propagate available identifiers (`hiveId`, `studyRunId`, `jobId`, request/correlation IDs) across Vercel, Inngest, Oracle Worker, Python Reader, and LiteLLM.
4. Bound external calls with timeouts; retry only transient failures, with safe limits and idempotency where needed. Prefer native Inngest capabilities to custom retry infrastructure.
5. Keep validated Canonical Study state intact on failure. Never promote unchecked model output as trusted facts.
6. Surface understandable failure status and recovery options to users without exposing infrastructure internals.
7. Provide health/status signals but never confuse healthy processes with successful end-to-end processing.
8. Protect secrets, tokens, document contents, personal data and model payloads from logs. Capture enough sanitized context to diagnose incidents.
9. Test malformed inputs, inaccessible documents, denied access, upstream rejection/timeouts, invalid model output, database failures, retries/duplicates, and interrupted runs as relevant.
10. Ensure support teams can answer: what failed, at what stage, why (as far as known), whether an operation was committed, and what is safe to retry.

Avoid blanket try/catch statements that swallow errors, multiple logging frameworks, or premature recovery machinery.

## 7. Verification and Acceptance
Distinguish compilation, unit tests, integration tests, UI-to-Oracle end-to-end success, and deployed release success. Run targeted tests first. Do not present a workflow as qualified until it was executed through the actual path with the intended input and inspected output. Initial scenarios include eight-document synthetic IEP L001 and intent-driven grocery receipts. Verify evidence/provenance, partial failures, correct current state, and result usability.

## 8. Repository and Deployment Safety
Check branch, status, and existing changes before editing. Preserve unrelated work. Do not commit/push, deploy, migrate, touch production data, or initiate paid calls without authorization. Independently deployable web, worker, and reader must observe explicit contracts. Develop/qualify in one integrated environment, then promote a verified immutable release; reproduce lower environments from infrastructure definitions, not copied private credentials or real customer data.

## 9. Documentation and Decision Synchronization
All product and architecture decisions can evolve. When the user approves a deviation:
1. Identify and revise only affected authoritative documents.
2. Update impacted `.cursor/rules/*.mdc`, `NEXT.md`, phase gates, and decision records.
3. Eliminate contradictory current instructions while preserving history.
4. Verify consistency of ChatGPT project files and actual repository documents; report any locations that remain unsynchronized.
5. Do not claim updates, commits or deployment were performed unless verified.

Make document synchronization an explicit task and Done-when criterion where relevant.

## 10. Reporting Format
For each ticket, provide a short summary of findings, exact changed files, passing/failing checks, error-handling coverage, remaining blockers, and whether Done-when is met. Keep prompts executable and concise. For complex tickets, use the read-only plan and separately approved implementation prompts.

**Governing workflow: Understand → Plan → Approve → Implement → Verify → Synchronize → Close.**
