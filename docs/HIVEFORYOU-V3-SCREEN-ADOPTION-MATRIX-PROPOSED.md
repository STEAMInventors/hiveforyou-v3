# HiveForYou V3 — Screen adoption matrix (proposed)

**Version:** 0.1 (proposed)  
**Status:** APPROVED with P0.3 closure (2026-10-20); Milestone 1 UX decisions in `PRODUCT-REQUIREMENTS.md` §3.1 (2026-10-20)  
**Authority:** Informs P0.3 / P1.4 UI scope; subordinate to `docs/PRODUCT-REQUIREMENTS.md` once present

Legend: **Adopt** (M1) · **Defer** (later phase) · **Drop** (not in V3) · **New** (no V2 screen)

| # | User-facing screen / state | V2 route or entry | V3 route / component | Adoption | Notes |
|---|---------------------------|-------------------|----------------------|----------|-------|
| 1 | Public landing | `/` → `StartLanding` | `/` → `StartLanding` | **Adopt** | Preserve V2 marketing layout and composer |
| 2 | Landing — auth required (inline) | `UploadExperience` → `auth-required` | Same state machine | **Adopt** | Staged files retained in memory |
| 3 | Log in (standalone) | Placeholder only | `/login` → `AuthCard` | **Adopt** | Supabase password auth |
| 4 | Create account (standalone) | Placeholder only | `/register` → `AuthCard` | **Adopt** | Handle email-confirmation-pending UX if enabled |
| 5 | Auth callback | V2 partial | `/auth/callback` | **New** | PKCE `exchangeCodeForSession` when confirmation on |
| 6 | Post-auth create handoff | `LandingHiveHandoff` | Same on `/` | **Adopt** | Opens create modal |
| 7 | Create Hive modal | `CreateYourHiveModal` | Shared component | **Adopt** | Also from My Hives header |
| 8 | My Hives list | `/case` → `CaseExperience` | `/hives` → `MyHivesExperience` | **Adopt** | Rename route; optional `/case` → `/hives` redirect |
| 9 | Hive workspace shell | V2 case detail (heavy) | `/hives/[hiveId]` | **Adopt (shell only)** | Empty workspace + staged-doc summary until P1.5 upload |
| 10 | Customer app chrome | `HiveCustomerShell` | Same pattern | **Adopt** | Nav, logout, create Hive CTA |
| 11 | Case/study processing UI | V2 case workspace | — | **Defer** | P1.5+ end-to-end path |
| 12 | Professional portal | V2 pro routes | — | **Defer** | P4.2+ |
| 13 | Domain picker as requirement | Composer domain pills | Optional examples only | **Drop as requirement** | Pack-free intents; no locked domain_id on create |
| 14 | Intake run / understanding UI | V2 intake machinery | — | **Drop** | Replaced by V3 study/run model later |
| 15 | Forgot password | — | `/forgot-password` | **New** | Neutral reset request; same `/auth/callback` allow-list |
| 16 | Set password from recovery link | — | `/reset-password` | **New** | PKCE recovery session only; no custom reset tokens |
| 17 | Change password | — | `/account/password` | **New** | Signed-in; current password required |

---

## Visual reference sources (non-runtime)

| Asset | Location | Use |
|---|---|---|
| Brand guide (PDF) | `reference/HiveForYou brand guide.pdf` | Authoritative palette, type, voice |
| Brand summary | `reference/HiveForYou-brand-guide.md` | Developer quick reference |
| Claude prototype export | `reference/prototype/` | Historical layout reference; live UI follows V2 `app/` |

---

## Milestone 1 matrix decisions (approved P0.1 — 2026-10-20)

1. Post-create navigation → **`/hives/[hiveId]`** (MD-03).
2. Email confirmation: **`/auth/callback`** required; confirmation enabled per environment (MD-04).
3. **`/case` → `/hives`** permanent redirect for V2 bookmark compatibility.
