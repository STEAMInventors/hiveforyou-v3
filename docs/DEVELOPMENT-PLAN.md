# HiveForYou V3 — Development plan (status index)

**Governing plan:** [`HIVEFORYOU-V3-DEVELOPMENT-PLAN-database-first-PROPOSED.md`](./HIVEFORYOU-V3-DEVELOPMENT-PLAN-database-first-PROPOSED.md) (version 0.1, **approved** 2026-10-20). The filename still contains `PROPOSED` so history and links stay stable. Ticket gates live in that document. Superseded connectivity-first P1 IDs are in its §4.1 only.

**Active ticket:** [`docs/NEXT.md`](./NEXT.md) — **P1.7-A** My Hives card summary + Delete Hive from cards (implemented in repo; blocked on P1.7-A SQL apply + web deploy).

## P0 — Design freeze (status)

| Ticket | Status | Notes |
|--------|--------|--------|
| P0.1 | **VERIFIED** (2026-10-20) | MD-01–05 + OD-01–02, OD-04–07 in `PRODUCT-REQUIREMENTS.md`; see `docs/NEXT.md` Closed: P0.1 |
| P0.2 | **VERIFIED** (2026-10-20) | Error handling, ADR-001, `packages/contracts`; integration details deferred (see NEXT.md) |
| P0.3 | **VERIFIED** (2026-10-20) | `docs/HIVEFORYOU-V3-V2-REUSE-INVENTORY.md`, screen matrix, `reference/prototype/` |

Implementation-time decisions from P0.2 (LiteLLM aliases, Worker–Reader HTTP, service auth, numeric timeouts/retries, concurrent runs per Hive) are **not** open P0 design blockers; they are owned by P1.3–P1.5 and P2.1/P5.3 as listed in `docs/NEXT.md`.

## Plan approval

| Item | Status | Notes |
|------|--------|--------|
| Database-first plan v0.1 | **APPROVED** (2026-10-20) | Governing sequencing. Does not authorize migrations or application code |

## P1 — Database first, then foundation (status)

| Ticket | Status | Notes |
|--------|--------|--------|
| P1.1 | **ACCEPTED** (2026-10-20) | `docs/HIVEFORYOU-V3-DATABASE-INVENTORY-P1.1.md` |
| P1.2 | **READY_FOR_REVIEW** (2026-10-20) | `docs/HIVEFORYOU-V3-DATABASE-MIGRATION-P1.2.md`, `supabase/migrations/20261020120000_hive3_m1_hives_baseline.sql`; not applied. OD-12 keeps `ON DELETE CASCADE`; deletion processing is deferred |
| P1.3 | PROCEDURE_READY (execution deferred) | Formal SQL qualification; parallel to feature-first P1.4 |
| P1.4 | **IMPLEMENTED** (blocked on migration apply + `v1-hives` deploy) | Hive list/create; see `docs/acceptance/P1.4-first-user-flow.md` |
| P1.5 | **IMPLEMENTED (repo)** (blocked on upload SQL + `v1-documents`) | Document upload slice; see `docs/acceptance/P1.5-document-upload.md` |
| P1.6 | **IMPLEMENTED (repo)** (blocked on policy SQL + `v1-documents`) | Upload product policy; see `docs/acceptance/P1.6-upload-product-policy.md` |
| P1.7 | **IMPLEMENTED (repo)** (P1.7 SQL applied; Edge at `52cb061`; web acceptance pending) | Document workspace + owner Hive delete; see `docs/acceptance/P1.7-document-workspace-hive-delete.md` |
| P1.7-A | **IMPLEMENTED (repo)** (blocked on `20261021180000` SQL + web deploy) | My Hives cards: document count/filename preview, card delete menu; no document replace/delete |
| P1.5-processing | NOT_STARTED | UI → Inngest → Oracle integration (deferred; not upload ticket) |

P2 and later remain NOT_STARTED. Their definitions are in the governing plan.
