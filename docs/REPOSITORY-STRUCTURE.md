# HiveForYou V3 — Repository structure and deployment boundaries

**Status:** Approved for repository foundation (V3-F01).  
**Purpose:** Define where code runs, who owns each directory, and non-negotiable integration rules for V3.

This document describes **deployment ownership** and **architecture boundaries**. Product requirements and detailed system design live in separate docs under `docs/` once copied and approved.

## Directory responsibilities

| Directory | Runtime | Responsibility |
|---|---|---|
| `apps/web` | Vercel | All customer and professional UIs; browser-facing APIs that enqueue work and read authorized data |
| `apps/worker` | Oracle Cloud | TypeScript orchestration, agents, validation, Canonical Study merge, Writer, persistence coordination |
| `apps/reader` | Oracle Cloud | Python/FastAPI document extraction and candidate fact generation |
| `packages/core` | Oracle Worker | Domain-neutral study logic (no IEP-specific rules) |
| `packages/contracts` | Shared | Versioned HTTP and data contracts; no cross-app source imports |
| `domain-packs` | Oracle processing | Optional declarative domain guidance (IEP first) |
| `supabase` | Supabase | Database schema (`hive3`), RLS, migrations, private storage buckets |
| `infra/oracle` | Oracle Cloud | Docker/deployment definitions for Worker, Reader, and gateway-adjacent processing services |
| `docs/` | — | Requirements, architecture, plans, ADRs, acceptance evidence, active ticket (`NEXT.md`) |
| `reference/` | — | Read-only brand and historical reference material (not runtime code) |

## Mandatory architecture rules

1. **Oracle runs all processing intelligence.** Readers, processing agents, model-driven analysis, verification, and study merge logic execute on Oracle Cloud—not on Vercel and not in the browser.
2. **Vercel runs all UIs.** Every customer and professional interface deploys to Vercel (`apps/web`).
3. **LiteLLM gateway is the only LLM path.** All LLM requests from Worker and Reader route through the existing Oracle LiteLLM gateway. No direct provider APIs, silent fallback providers, or environment-specific bypasses.
4. **Inngest owns orchestration.** Workflow scheduling, retries, and durable execution boundaries are Inngest’s responsibility. The browser does not drive multi-step processing directly.
5. **Supabase owns durable state.** PostgreSQL (schema `hive3`), RLS, and private document storage live in Supabase. Application code does not treat local disks or Vercel as the system of record for customer documents or studies.
6. **One product execution path.** Real user journeys and acceptance tests use the same entry point: Web → Inngest → Oracle Worker → (internal contract) → Reader → LiteLLM → back through Worker for persistence and status. Unit tests may mock externals; they must not introduce a parallel pipeline.
7. **No direct browser-to-Oracle processing.** The browser must not call Worker, Reader, or LiteLLM endpoints directly. Web APIs on Vercel mediate authentication, authorization, and job enqueue/status only.
8. **Contracts, not cross-imports.** `apps/web` does not import implementation code from `apps/worker` or `apps/reader`. Shared shapes live in `packages/contracts` with explicit versioning.
9. **Core stays domain-neutral.** IEP or other domain rules appear only in optional `domain-packs/` material consumed during Oracle-side processing.
10. **Secrets stay out of Git.** Credentials and environment-specific secrets are never committed. Service-to-service auth patterns are chosen at repository bootstrap and integration (P1.4/P1.5); P0.2 defines error and retry boundaries only.

## Import and build boundaries (target)

- **`apps/web`:** May depend on `packages/contracts`. Must not depend on `packages/core`, Worker, or Reader source trees.
- **`apps/worker`:** May depend on `packages/core` and `packages/contracts`. Invokes Reader via the versioned HTTP contract only.
- **`apps/reader`:** May depend on `packages/contracts` (generated or shared types as agreed). No imports from `apps/web`.
- **`packages/core`:** Pure logic; no framework-specific UI or FastAPI/Next.js coupling.

## Related documents

| Document | Location | Notes |
|---|---|---|
| Development plan | `docs/DEVELOPMENT-PLAN.md`, `docs/HIVEFORYOU-V3-DEVELOPMENT-PLAN-database-first-PROPOSED.md` | Status index + governing plan (approved 2026-10-20; filename retains PROPOSED) |
| Database design (proposed) | `docs/HIVEFORYOU-V3-DATABASE-DESIGN-v0.1.md` | **PROPOSED** — review before SQL |
| Database inventory (P1.1) | `docs/HIVEFORYOU-V3-DATABASE-INVENTORY-P1.1.md` | ERD, entity inventory, drift, qualification checklist |
| Product requirements | `docs/PRODUCT-REQUIREMENTS.md` | Interim working draft; P0.1 VERIFIED — §3.1–§3.2, §6 decision log |
| Architecture | `docs/ARCHITECTURE.md` | P0.2 error handling; full doc pending requirements |
| Error handling & recovery | `docs/ERROR-HANDLING-RECOVERY.md` | Approved P0.2 |
| ADR-001 | `docs/adr/ADR-001-error-handling-recovery.md` | Approved (P0.2 verified) |
| Cursor standards | `docs/CURSOR-DEVELOPMENT-STANDARDS.md` | In repo (copied 2026-10-20) |
| Active ticket | `docs/NEXT.md` | **P1.4** first user flow in `apps/web`; blocked on Supabase `hive3` API exposure |
| Source inventory | `docs/PROJECT-SOURCES.md` | In repo (copied 2026-10-20) |
| Brand (authoritative PDF) | `reference/HiveForYou brand guide.pdf` | In repo (copied from Downloads 2026-10-20) |
| Brand (short reference) | `reference/HiveForYou-brand-guide.md` | Markdown summary for developers |
| V2 reuse inventory (P0.3) | `docs/HIVEFORYOU-V3-V2-REUSE-INVENTORY.md` | Milestone 1 tags; READY_FOR_REVIEW |
| Screen adoption matrix (proposed) | `docs/HIVEFORYOU-V3-SCREEN-ADOPTION-MATRIX-PROPOSED.md` | UI scope for M1 |
| Prototype reference | `reference/prototype/` | HTML exports; full assets remain in V2 `design-reference` |

## V2 relationship

HiveForYou V2 repositories and production data remain **read-only references** for port/reuse decisions. V3 does not inherit V2 runtime dependencies by default, and this repo’s Git history is **isolated** from any parent home-directory repository.
