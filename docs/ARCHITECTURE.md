# HiveForYou V3 — Architecture

**Status:** Partial (P0.1 MVP decisions and P0.2 error handling approved; implementation topology pending P1+).  
**See also:** `docs/PRODUCT-REQUIREMENTS.md` §3–§4, `docs/REPOSITORY-STRUCTURE.md`, `docs/ERROR-HANDLING-RECOVERY.md`, `docs/HIVEFORYOU-V3-DATABASE-DESIGN-v0.1.md` (proposed schema), `docs/HIVEFORYOU-V3-DATABASE-INVENTORY-P1.1.md` (P1.1 inventory).

## Runtime topology

| Component | Host | Role |
|-----------|------|------|
| `apps/web` | Vercel | UI, auth, enqueue, status read |
| Inngest | Managed | Orchestration and **only** workflow retries |
| `apps/worker` | Oracle | Validation, merge, persistence, agents, Writer |
| `apps/reader` | Oracle | Document extraction candidates via LiteLLM |
| LiteLLM | Oracle | Exclusive model gateway |
| Supabase | Managed | Shared **`hive3`** schema, RLS, private storage (OD-02) |

**Product path:** Web → Inngest → Worker → Reader → LiteLLM → Worker → Supabase. No browser-to-Oracle processing. No direct provider APIs.

## Tenancy and isolation (OD-02)

- **One PostgreSQL schema (`hive3`)** and **private object storage** for all users — **no per-user schemas or databases**.
- **User/Hive isolation:** table **ownership** (`hives.owner_user_id`, hive-scoped FKs), **RLS** on browser-accessible tables, **storage policies** scoped by owner/hive, and **server-side authorization** on Worker paths that use service-role Supabase access.
- **External models:** customer content must not be sent to providers outside the approved Oracle **LiteLLM** gateway unless an explicit data-handling approval exists for that path (OD-02).
- **Account deletion (OD-12, approved 2026-10-20):** a future ticket notifies the owner, retains the account and owned data for 30 days, allows recovery in that window, then permanently removes the auth user, owned `hive3` rows, and private storage, and writes a deletion audit. `hives.owner_user_id` stays **`ON DELETE CASCADE`** so removal of `auth.users` does not leave orphan Hives. Cascade runs at the end of the recovery window, when the auth user row is removed. Milestone 1 does not add deletion tables or a cleanup job. Future cleanup must survive partial failure with idempotent retries and explicit terminal states (recovered, permanently deleted, retries exhausted). Traces carry a correlation id, account id, step, and state, and omit document contents, object bodies, credentials, and tokens.

## Intake and outputs (OD-01, OD-04)

- **Uploads (P1.5+):** initial types PDF, PNG, JPG, DOCX; per-file size limits configurable; Free tier **10 successful uploads per UTC calendar month** across all user Hives (OD-01).
- **Reports:** customer and professional outputs must tie supported factual claims to evidence/provenance or explicit unknown/derived labeling (OD-04); `reports` + `report_claim_evidence` in database design.

## Data invariants

- One Hive → one evolving Canonical Study (`canonical_studies` + immutable `study_revisions`). **Milestone 1:** Hive rows exist without a study row until the first successful study run (P0.1 MD-02).
- Failed processing must not corrupt the last validated study pointer or prior reports.
- No source, no supported factual claim; Reader output is untrusted until Worker verification.
- Domain-neutral `packages/core`; optional `domain-packs`.

## Error handling and recovery (normative)

Full specification: **`docs/ERROR-HANDLING-RECOVERY.md`**.

Summary:

- Every Generate / Reprocess / Study action → new **`study_run_id`**; delivery dedupe via **`delivery_idempotency_key`** only.
- **Inngest** retries failed steps; no nested retry queues or model retry loops in Worker/Reader.
- **Atomic merge:** insert revision + advance pointer in one transaction; reconcile unknown commits by **`study_run_id`**.
- **Partial failure:** keep verified batch artifacts per OD-06; **no unverified failed-run fact** merged into Canonical Study; required coverage missing → **`FAILED`**; no silent full study promotion.
- **Coverage (OD-07):** full Study actions cover **all eligible documents**; targeted reprocess records explicit scope and coverage on the run plan.
- **Contract:** `error-envelope@1` in `packages/contracts`; Inngest steps must not succeed HTTP while failing business logic.

Decision record: `docs/adr/ADR-001-error-handling-recovery.md`.

## Contracts

Versioned cross-service shapes live in **`packages/contracts`**. Services communicate via HTTP/events using these types, not cross-app source imports.

## Requirements authority

Requirements and planning authorities in repo: `docs/PRODUCT-REQUIREMENTS.md` (interim draft), `docs/DEVELOPMENT-PLAN.md`, `docs/CURSOR-DEVELOPMENT-STANDARDS.md`, `docs/NEXT.md`. **P0.1 VERIFIED (2026-10-20):** Milestone 1 decisions in §3.1; MVP-wide decisions OD-01–02, OD-04–07 in §3.2; decision log §6.

**Milestone 1 create-Hive (web → Supabase):** authenticated `POST` supplies `name`, optional `description`, and `client_request_id`; persistence enforces **`UNIQUE (owner_user_id, client_request_id)`** and returns the existing Hive on idempotent replay (MD-01). **M1 access:** owner-only RLS on `hives`; no `hive_members` (MD-05).

**Operational limits (OD-05):** processing/resource caps are configurable; numeric defaults (except OD-01 Free upload quota) are implementation-time at P1.3/P1.5/P5.3.
