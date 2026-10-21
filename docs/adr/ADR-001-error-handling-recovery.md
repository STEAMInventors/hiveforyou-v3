# ADR-001: Error handling and recovery

**Status:** Approved / Accepted (P0.2 verified 2026-10-20)  
**Date:** 2026-10-20

## Context

HiveForYou V3 spans Vercel, Inngest, Oracle Worker/Reader, LiteLLM, and Supabase. Processing must survive duplicate delivery, transient outages, and partial document failure without corrupting the Canonical Study or duplicating verified evidence.

## Decision

1. **Run identity:** Each intentional processing action gets a unique `study_run_id`. Idempotency keys dedupe **delivery** only, not new user attempts after failure.
2. **Retries:** Inngest owns orchestration retries. Worker/Reader do not nest HTTP or model retry loops. Allow at most three immediate `DB_TRANSIENT` retries inside one Worker invocation.
3. **Study merge:** Single transaction for new `study_revisions` row and `current_revision_id` update. Reconcile ambiguous commits by querying `based_on_run_id`; no abandoned-revision lifecycle.
4. **Partial runs:** Persist batch-level outcomes and verifier-passed facts where applicable; required coverage failure → terminal `FAILED` without pointer advance.
5. **Contract:** Minimal `error-envelope@1` with stable codes; separate internal logs from browser-safe responses; Inngest steps fail invocation on business error.

## Consequences

- `packages/contracts` publishes envelope types and codes for Web, Worker, and Reader.
- Database design clarifies `study_runs.idempotency_key` as delivery-scoped (see database design v0.1 amendment).
- P1.5 integration tests must cover duplicate delivery, unknown merge, and L001 coverage failure paths.

## Alternatives rejected

- Intent-scoped idempotency preventing new runs after failure.
- Worker-internal retry queues or second state machine in Redis/events.
- Abandoned-revision status and sweeper jobs.
- HTTP 200 responses carrying step failure for Inngest.

## References

- `docs/ERROR-HANDLING-RECOVERY.md`
- `docs/ARCHITECTURE.md`
