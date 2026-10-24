# HiveForYou V3 — Product requirements

**Status:** INTERIM WORKING DRAFT (promoted 2026-10-20)  
**Authority note:** The standalone user-confirmed requirements export was **not found on disk** (v3 repo, v2 repo, or local Downloads search). Per explicit user direction in the P0.1 session, this document **waives** that missing file and establishes interim product authority from approved in-repo sources until a fuller requirements pass replaces it.

**Interim authority stack (binding until superseded):**

1. This document (confirmed behavior + **open decisions**)
2. `docs/ARCHITECTURE.md` (how, subordinate to requirements)
3. `reference/HiveForYou brand guide.pdf` (brand/UI voice)
4. `docs/ERROR-HANDLING-RECOVERY.md` + ADR-001 (processing failure behavior)
5. `docs/HIVEFORYOU-V3-DATABASE-DESIGN-v0.1.md` (data model proposal)
6. `docs/NEXT.md` (active ticket and decision log)

**Historical only (not binding V3 plan):** V2 `brain/product/*`, `reference/V3-REQUIREMENTS-v0.1.md` (not present in v3 repo).

Do **not** treat §6.1 ambiguities or deferred sharing policy as decided requirements.

---

## 1. Product intent (confirmed)

HiveForYou helps people understand complicated paperwork: users bring documents and intent; the product produces clear, provenance-backed reads where **every factual claim ties to source evidence** or is explicitly marked unknown or derived.

- **Product name:** HiveForYou — slogan *“The complicated, made simple.”*
- **Core is domain-neutral.** IEP, Medicaid, bankruptcy, grocery receipts, and general paperwork are in scope; optional **domain packs** add guidance but **pack-free** journeys must work.
- **Selected-Domain-Pack extraction (PX-01, 2026-10-24):** when a reviewed Domain Pack is selected, the Pack owns the document-type taxonomy and complete fact catalog; the model identifies document types and extracts **only** catalog-defined facts, with mandatory source evidence; user intent does not create fact definitions and there is **no model-driven schema-generation stage** on that path. **Generic / no-Pack extraction design is DEFERRED** (existing implementation unchanged); the pack-free grocery acceptance bar below **remains mandatory** for release. Design: `docs/design/p2.2-px/PACK-EXTRACTION-PROMPT-ARCHITECTURE.md` (proposed).
- **One Hive → one evolving Canonical Study.** Intents and outputs reuse that study; prior revisions remain inspectable.
- **Trust:** No source, no supported factual claim. Missing information is named clearly.
- **Acceptance bar (product):** L001 eight-document synthetic path with verified evidence; pack-free grocery receipts with reuse across 20→30 documents (see development plan P5 gates).

---

## 2. Roles and surfaces (confirmed)

| Role | Surface | Runtime |
|------|---------|---------|
| Customer | `apps/web` on Vercel | Auth, Hive UI, upload, job status, customer outputs |
| Professional | `apps/web` on Vercel | Authorized views/reports (later phases) |
| Processing | Oracle (`apps/worker`, `apps/reader`) | Extraction, verification, merge — **not** in browser |

Browser **must not** call Worker, Reader, or model providers directly.

---

## 3. Milestone 1 — Auth, Hive list, Create Hive (confirmed slice)

**In scope for first customer journey:**

1. V2-derived public landing (brand-compliant).
2. Register / log in via Supabase Auth (`auth.users`); session in web app only.
3. **My Hives** — list Hives owned by the signed-in user.
4. **Create Hive** — name (required, max 100 characters), optional description (max 500 characters); owner-bound row in `hive3.hives` with optional `description`, required `client_request_id`, and RLS owner isolation. Create is idempotent per owner on `client_request_id` (see §3.1).

**Explicitly out of scope for Milestone 1:**

- Document upload to private storage and processing jobs (P1.5+).
- `canonical_studies` row — **not** created at Hive create; first row appears on first successful study run (P1.5+).
- Professional sharing, `hive_members`, cross-user access — **owner-only** (approved for M1; see §3.1 MD-05).
- Enqueue/status APIs for study runs.
- Account-deletion processing (OD-12). Milestone 1 keeps the live `ON DELETE CASCADE` foreign key and does not add deletion tables, notification, or a cleanup job.

**UX reference:** `docs/HIVEFORYOU-V3-SCREEN-ADOPTION-MATRIX-PROPOSED.md`, `docs/HIVEFORYOU-V3-V2-REUSE-INVENTORY.md`.

### 3.1 Approved Milestone 1 decisions (P0.1 — 2026-10-20)

User-directed closure of Milestone 1–blocking open items. Recorded in `docs/NEXT.md`; synchronized to database design v0.1.

| ID | Decision | Requirement |
|----|----------|-------------|
| **MD-01** (OD-08) | Hive create columns and idempotency | `hive3.hives` includes optional `description text` and required `client_request_id text`. Enforce **`UNIQUE (owner_user_id, client_request_id)`**. API replays with the same pair return the existing Hive (no duplicate row). Client generates a new UUID per submit attempt. Validation limits match V2 port: name ≤ 100, description ≤ 500. |
| **MD-02** (OD-09) | Canonical Study initialization | Do **not** insert `canonical_studies` when a Hive is created. First study row is created when the first study run **succeeds** (P1.5+). M1 workspace shell may show empty study state. |
| **MD-03** (OD-10) | Post-create navigation | After successful create (landing handoff or My Hives modal), navigate to **`/hives/[hiveId]`** workspace shell. |
| **MD-04** (OD-11) | Supabase Auth / email confirmation | Implement **`/auth/callback`** with PKCE `exchangeCodeForSession` when email confirmation is enabled. Non-production may disable confirmation for frictionless dev; production confirmation policy is an environment/deploy choice, not an M1 schema blocker. |
| **MD-05** (OD-03) | Access for M1 | **Owner-only.** Do not create `hive_members` in Milestone 1 migrations. RLS on `hives` via `owner_user_id` only. |

**Route compatibility (M1, with screen matrix):** permanent **`/case` → `/hives`** redirect for V2 bookmarks (see screen adoption matrix).

### 3.2 Approved MVP-wide decisions (P0.1 — 2026-10-20)

User-directed closure of MVP-blocking §6 items. Synchronized to `docs/ARCHITECTURE.md`, database design v0.1, and `docs/NEXT.md`.

| ID | Decision | Requirement |
|----|----------|-------------|
| **OD-01** | Supported upload types and Free-tier quota | **Initial MIME/types:** PDF, PNG, JPG, DOCX. **Per-file size limits:** configurable (no fixed product default in requirements). **Free plan:** **10 successful uploads per UTC calendar month** counted **across all Hives** owned by the user. “Successful upload” means the intake path completed registration of the file in private storage and `source_documents` (or equivalent) — not study-run success. Enforcement is product/billing + API; exact metering table/columns at P1.2+. |
| **OD-02** | Tenancy, storage, and external processing | **One shared `hive3` schema** and **private buckets** for all tenants. Isolation via **ownership**, **RLS**, and **server-side authorization** — not separate schemas/databases per user. **No** sending customer content to external model providers unless **explicit approval** exists for that data-handling path; production path is Oracle **LiteLLM** only. |
| **OD-04** | Customer vs professional outputs | **Customer reports** and **professional reports** (`reports.audience` or equivalent) present **evidence-backed findings** with **provenance** (links to verified facts/evidence or explicit unknown/derived labeling). Unsupported claims must not appear as verified fact. |
| **OD-05** | Operational limits | Processing and resource limits (upload size caps, concurrent runs, model spend guards, etc.) are **configurable**; **specific numbers** (other than OD-01 Free upload quota) are **deferred to implementation** tickets with environment/plan configuration — not invented in requirements. |
| **OD-06** | Failed-run merge and artifact retention | **No unverified fact from a failed run** is merged into the Canonical Study (`current_revision_id` unchanged per P0.2). **Failed-run artifacts** (batches, raw/validated paths, diagnostics) may be **retained privately** for support and retry **only under an approved retention policy** — policy duration and user-delete behavior remain **database design §6.5** (not numerically fixed at P0.1). |
| **OD-07** | Coverage per action type | **Full Study** (and equivalent full-coverage actions): run plan must account for **all eligible documents** in the Hive for that action. **Targeted reprocess:** run plan must **explicitly record scope** (which documents/intents/batches) and **coverage outcome**; required coverage not met → terminal `FAILED` / `COVERAGE_INCOMPLETE` per `docs/ERROR-HANDLING-RECOVERY.md`. |

**Upload path (post–Milestone 1):** OD-01 types and limits apply when document upload is implemented (P1.5+).

**Outputs (phased delivery):** OD-04 defines report quality bar; UI surfaces may ship in later phases (P4+) but must not violate the evidence/provenance rule when reports are shown.

---

## 4. Data and security (confirmed)

- **Shared PostgreSQL schema `hive3`** and **private object storage** for all users and Hives — **no per-user schemas or databases** (OD-02).
- Logical isolation by **ownership**, **RLS** on browser-accessible tables, and **server-side authorization** on Worker/service-role paths (OD-02).
- Hive rows owned by `auth.users` via `owner_user_id`; users cannot read or write another user's Hives or storage objects.
- **External model processing:** document or derived content sent to models outside the approved Oracle LiteLLM gateway requires **explicit product/security approval before** that processing is enabled in an environment (OD-02). All application model calls use Oracle LiteLLM with role-specific aliases (architecture constraint; alias wiring at P2.1/P5.3).
- API routes on Vercel enforce auth and return `error-envelope@1` on failures (P0.2).
- Secrets never in Git; no raw document content in logs or orchestration events.

### 4.1 Account deletion (OD-12 — approved 2026-10-20; implementation deferred)

The account owner can request deletion. The product then:

1. **Notifies** the owner that deletion was requested and that the account can be recovered for 30 days.
2. **Retains** the auth user, owned Hive rows, and private storage objects for **30 days**. During that window the owner can **recover** the account. `auth.users` stays in place, so `hive3.hives.owner_user_id` does not cascade.
3. After 30 days without recovery, **permanently deletes** the auth user, owned `hive3` rows, and private storage objects, and writes a **deletion audit**.

`hive3.hives.owner_user_id` references `auth.users` with **`ON DELETE CASCADE`**, matching the reported live foreign key. Cascade is the database result of removing the auth user at the end of the recovery window. Hive **archive** (`archived_at`) remains a separate action from **owner-initiated permanent Hive deletion** (approved P1.7): the owner confirms in UI, the system marks `deleting_at`, removes private storage under service credentials, then finalizes via restricted RPC — **`authenticated` still has no direct `DELETE` on `hive3.hives`.**

**Future ticket (required before any deletion job ships):**

- Notify, retain for 30 days, support recovery, then permanently clean storage and database rows, and record a deletion audit.
- Cleanup supports **partial failure** (storage and database steps can finish apart), **idempotent retries**, and **explicit terminal states** for recovered, permanently deleted, and retries exhausted.
- Deletion operations are traceable by correlation id, account id, step, and state. Logs omit document contents, object bodies, credentials, and tokens.
- Milestone 1 does not add the tables or jobs for this lifecycle.

---

## 5. Non-functional (confirmed)

- **Observability:** Correlation IDs at web/API boundaries; sanitized structured logs; no passwords, tokens, or document contents in logs. Future account-deletion operations follow the same rule (OD-12): trace correlation id, account id, step, and terminal state; omit document contents, object bodies, credentials, and tokens.
- **Idempotency:** Client-supplied `client_request_id` on create-Hive; unique per owner (MD-01).
- **Orchestration retries:** Inngest only — per `docs/ERROR-HANDLING-RECOVERY.md`.
- **Processing and resource limits:** product-facing caps (concurrency, cost guards, run timeouts where user-visible) are **configurable per environment/plan**; **numeric defaults are implementation-time** except OD-01 Free upload quota (see §3.2).

---

## 6. Decision log

Record matches `docs/NEXT.md`. **Do not implement conflicting defaults.**

| ID | Topic | Status | Notes |
|----|--------|--------|-------|
| OD-01 | File types and upload limits | **APPROVED** (2026-10-20) | PDF, PNG, JPG, DOCX; configurable size; Free 10 successful uploads/month UTC (all Hives) |
| OD-02 | Privacy / tenancy / external model policy | **APPROVED** (2026-10-20) | Shared `hive3` + private storage; RLS/ownership/server auth; external processing requires approval |
| OD-03 | Access model (owner-only vs `hive_members` / professional sharing) | **APPROVED for M1** (MD-05) | Owner-only through M1; `hive_members` deferred until sharing policy approved |
| OD-04 | Output expectations (customer vs professional) | **APPROVED** (2026-10-20) | Evidence-backed findings + provenance for customer and pro reports |
| OD-05 | Minimum operational limits (cost, concurrency caps) | **APPROVED** (2026-10-20) | Configurable; numeric defaults deferred (except OD-01 quota) |
| OD-06 | Failed-run fact retention | **APPROVED** (2026-10-20) | No failed-run unverified merge; private artifact retention under approved policy (duration TBD §6.5 DB design) |
| OD-07 | Required coverage per action (Reprocess vs full Study) | **APPROVED** (2026-10-20) | Full Study = all eligible docs; targeted reprocess = explicit scope + coverage |
| OD-08 | `hive3.hives.description` and `client_request_id` columns | **APPROVED** (MD-01) | DB design v0.1 `hives` + `UNIQUE (owner_user_id, client_request_id)` |
| OD-09 | Initialize `canonical_studies` on Hive create vs first run | **APPROVED** (MD-02) | First row on first **successful** study run; not at Hive create |
| OD-10 | Post-create navigation (`/hives/[id]` vs `/hives`) after landing handoff | **APPROVED** (MD-03) | Navigate to `/hives/[hiveId]` |
| OD-11 | Supabase email confirmation vs frictionless signup | **APPROVED** (MD-04) | Callback route required; confirmation toggled per environment |
| OD-12 | Account deletion | **APPROVED** (2026-10-20); implementation deferred | Notify, 30-day retention, recovery, then permanent storage and database cleanup plus deletion audit. `hives.owner_user_id` stays `ON DELETE CASCADE`. No deletion tables in Milestone 1 |
| PX-01 | Selected-Domain-Pack extraction | **APPROVED direction** (2026-10-24); design P2.2-PX.D **proposed**, not implemented | Pack owns taxonomy + complete fact catalog; extract only defined facts with evidence; no schema generation on that path; intent excluded from extraction prompt. Generic/no-Pack design **DEFERRED**; pack-free grocery release gate **retained** |

### 6.1 Remaining ambiguity (not P0.1 blockers)

| Topic | State | Owner |
|-------|--------|--------|
| Failed-run artifact retention **duration** (OD-06) beyond pre-study delete/replace | Partially closed P1.7-B | Pre-study registered delete/replace + `study_locked_at`; post-study retention still open |
| Numeric file-size caps, concurrency caps, spend guards | Open (implementation config) | P1.3, P1.5, P5.3 |
| Professional sharing / `hive_members` beyond M1 owner-only | Deferred | Post-MVP requirements |
| Exact “eligible document” rules for full Study (e.g. soft-deleted, archived) | Refine at schema/API design | P1.2, P1.5 |

---

## 7. Parking lot (explicit non-blockers)

Proactive intent suggestions; domain knowledge learning; cross-Hive intelligence; expanded pack governance; additional processing modes — defer unless promoted via ticket.

---

## 8. Change control

Replacing this interim draft with a user-signed requirements export **supersedes** §1–§5 where they conflict. Decision log (§6) must stay synchronized with `docs/NEXT.md` on material changes.
