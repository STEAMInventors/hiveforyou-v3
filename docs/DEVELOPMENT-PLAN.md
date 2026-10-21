# HiveForYou V3 — Development plan (status index)

**Governing plan:** [`HIVEFORYOU-V3-DEVELOPMENT-PLAN-database-first-PROPOSED.md`](./HIVEFORYOU-V3-DEVELOPMENT-PLAN-database-first-PROPOSED.md) (version 0.1, **approved** 2026-10-20). The filename still contains `PROPOSED` so history and links stay stable. Ticket gates live in that document. Superseded connectivity-first P1 IDs are in its §4.1 only.

**Active ticket:** [`docs/NEXT.md`](./NEXT.md) — **P1.4** Hive persistence via Edge Function + RPC (implemented; blocked on migration apply + function deploy).

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
| P1.4 | **IMPLEMENTED** (blocked on `hive3` REST exposure) | `apps/web` first user journey; see acceptance doc |
| P1.5 | NOT_STARTED | UI → Inngest → Oracle integration |

P2 and later remain NOT_STARTED. Their definitions are in the governing plan.
