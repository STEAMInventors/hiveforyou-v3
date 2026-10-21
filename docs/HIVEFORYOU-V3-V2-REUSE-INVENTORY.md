# HiveForYou V3 — V2 reuse inventory (P0.3)

**Ticket:** P0.3 — V2 reuse inventory  
**Status:** VERIFIED (2026-10-20) — user-approved P0.3 closure  
**Scope:** Milestone 1 journey only — Landing → Register/Login → My Hives → Create Hive  
**V2 repository (read-only):** `c:\Users\abhattacharyya\hiveforyou-v2`  
**Tags:** `reuse as-is` · `port+trim` · `reference only` · `discard` · `create new (adapted from V2)`

No V2 runtime code is imported by this document. Implementation waits on P0.1 closure and P1 approvals per `docs/NEXT.md`.

---

## Milestone 1 — tagged inventory

| V2 source (verified path) | V3 target path | Tag | Dependencies / notes | Rationale |
|---|---|---|---|---|
| `app/public/brand/*`, favicons | `apps/web/public/brand/*`, `apps/web/public/favicon.*` | **reuse as-is** | Static assets only | Brand SVGs and icons are unchanged for V3 |
| `app/src/lib/brand/paths.ts`, `sizes.ts` | `apps/web/src/lib/brand/*` | **reuse as-is** | None | Path/size constants for responsive brand |
| `app/src/components/HiveWordmark.tsx` | `apps/web/src/components/brand/HiveWordmark.tsx` | **reuse as-is** | `next/image`, brand assets | Logo, wordmark, hero mark components |
| `app/src/styles/hiveforyou.css` | `apps/web/src/styles/hiveforyou.css` | **reuse as-is** | Tailwind, layout fonts | `--hfy-*` design tokens |
| `app/src/styles/legacy/marketing-start.css` | `apps/web/src/styles/marketing-start.css` | **reuse as-is** | Imported from global CSS | `.start-*` composer animations |
| `app/tailwind.config.ts`, `app/src/app/layout.tsx` (fonts) | `apps/web/tailwind.config.ts`, `apps/web/src/app/layout.tsx` | **port+trim** | Google Fonts: Outfit, Source Serif 4, DM Sans, JetBrains Mono | Preserve V2 landing typography; drop V2-only theme keys not needed in M1 |
| `app/src/components/landing/StartLanding.tsx` | `apps/web/src/components/landing/StartLanding.tsx` | **port+trim** | Composer, brand, optional session | Keep V2 layout; wire Sign in / My Hives from session; domain-neutral example copy |
| `app/src/components/intake/HiveHomeComposer.tsx` | `apps/web/src/components/landing/HiveHomeComposer.tsx` | **port+trim** | Staged docs context | **Remove** `@hiveforyou/domain-packs` and IEP/Medicaid/Bankruptcy conditionals; optional declarative starter prompts only |
| `app/src/lib/intake/staged-documents-context.tsx`, `app/src/lib/staged-documents.ts` | `apps/web/src/lib/staged-documents/*` | **port+trim** | React context | In-memory staged files + intent for inline landing handoff |
| `app/src/components/UploadExperience.tsx` | `apps/web/src/components/landing/UploadExperience.tsx` | **port+trim** | Auth, handoff, composer | State machine: composer → session check → auth → create hive handoff |
| `app/src/components/landing/LoginRegisterPlaceholder.tsx` | `apps/web/src/components/auth/AuthCard.tsx`; routes `app/login`, `app/register` | **port+trim** | Supabase Auth, `/api/auth/session` | Replace disabled inputs with `signInWithPassword` / `signUp`; inline + standalone pages |
| `app/src/middleware.ts`, `app/src/lib/supabase/server.ts`, `browser.ts`, `app/src/lib/auth/client-session.ts` | `apps/web/src/middleware.ts`, `apps/web/src/lib/supabase/*`, `apps/web/src/lib/auth/*` | **port+trim** | `@supabase/ssr`, env secrets | Cookie session SSR; add `/auth/callback` if email confirmation enabled |
| `app/src/app/api/auth/session/route.ts` | `apps/web/src/app/api/auth/session/route.ts` | **create new (adapted from V2)** | `@hiveforyou/contracts` auth-session@1 (to add) | Return versioned session DTO; errors via `error-envelope@1` |
| `app/src/components/landing/LandingHiveHandoff.tsx` | `apps/web/src/components/hives/LandingHiveHandoff.tsx` | **port+trim** | Create modal, staged docs | Post-auth handoff before Hive exists |
| `app/src/components/landing/CreateYourHiveModal.tsx`, `create-hive-validation.ts` | `apps/web/src/components/hives/CreateYourHiveModal.tsx`, `create-hive-validation.ts` | **port+trim** | `POST /api/hives` | No domain requirement; idempotent `clientRequestId` |
| `app/src/components/hive-customer/HiveCustomerShell.tsx`, `HiveCustomerNav.tsx`, `HiveCustomerWordmark.tsx` | `apps/web/src/components/shell/HiveCustomerShell.tsx`, `HiveCustomerNav.tsx` | **port+trim** | Session, logout, create CTA | Add log out and "+ New Hive" on My Hives |
| `app/src/app/case/page.tsx` | `apps/web/src/app/hives/page.tsx` (+ optional redirect from `/case`) | **port+trim** | Hive list API | V3 route name `hives` not `case` |
| `app/src/components/case/CaseExperience.tsx`, `CaseHiveList.tsx` | `apps/web/src/components/hives/MyHivesExperience.tsx`, `HiveCardGrid.tsx` | **port+trim** | `GET /api/hives` | Persisted `hive3.hives` rows, empty/error states |
| — | `apps/web/src/app/hives/[hiveId]/page.tsx` | **create new** | `GET /api/hives/[hiveId]` | M1 workspace shell (upload out of scope until P1.5) |
| `app/src/app/api/cases/route.ts`, `app/src/app/api/cases/[caseId]/route.ts` | `apps/web/src/app/api/hives/route.ts`, `apps/web/src/app/api/hives/[hiveId]/route.ts` | **create new (adapted from V2)** | `hive3.hives`, RLS, contracts | V2 `hive.cases` + domain_id **not** ported |
| V2 `hive.cases`, intake runs, domain-locked schema | — | **discard** | — | V3 uses `hive3` schema per database design v0.1 |
| V2 Worker, Reader, engine, domain-packs runtime in web | — | **reference only** | Oracle path | No browser/oracle processing in M1 |
| `design-reference/claude-prototype/` (V2) | `reference/prototype/` (pointer + primary HTML) | **reference only** | Offline HTML bundle | Visual reference; implemented UI follows V2 `app/` + brand guide |
| `app/src/lib/log-route-unexpected-error.ts` | `apps/web/src/lib/log-route-unexpected-error.ts` | **port+trim** | Structured logging | Sanitized boundary logs; no PII |

---

## Explicitly out of scope for Milestone 1 (reference or later tickets)

| V2 area | Tag | Notes |
|---|---|---|
| Case workspace, study UI, reports, professional flows | **reference only** | P4+ / later milestones |
| Document upload/storage pipelines | **discard for M1** | P1.5+ |
| Inngest jobs, Worker, Reader | **reference only** | Oracle-only processing |
| `@hiveforyou/domain-packs` in customer UI | **discard** | Pack-free M1; packs optional on Oracle later |
| V2 Supabase `hive.*` migrations | **discard** | Fresh `hive3` migrations |

---

## Verification (inventory completeness)

- [x] Each Milestone 1 UI/API touchpoint has a V2 source or explicit **create new**
- [x] File paths verified under `hiveforyou-v2/app/` on 2026-10-20
- [x] Domain-neutral constraint recorded for composer and create-hive flows
- [x] User approval of inventory (P0.3 closure, 2026-10-20)

**Related:** `docs/HIVEFORYOU-V3-SCREEN-ADOPTION-MATRIX-PROPOSED.md`, `docs/NEXT.md` (Milestone 1 discovery).
