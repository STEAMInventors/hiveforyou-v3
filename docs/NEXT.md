# Active ticket

**Phase / Ticket:** P1.5 â€” Complete reusable document upload
**Status:** **IMPLEMENTED (repo)** â€” blocked on Supabase apply of upload migrations + deploy Edge Function `v1-documents`; live browser acceptance pending (2026-10-21)

**Objective:** End-to-end bulk upload into new and existing Hives: private storage, `source_documents`, atomic Free-tier quota (`upload_quota_events`), Web API, Edge Function + RPC boundary, signed uploads, document list, quota indicator, landing-to-Hive file handoff.

**Evidence:** `supabase/migrations/20261021150000_hive3_m1_upload_baseline.sql`, `supabase/migrations/20261021150100_hive3_m1_public_document_rpc.sql`, `supabase/functions/v1-documents/`, `packages/contracts/src/documents/v1/`, `apps/web/src/lib/documents/`, `apps/web/src/app/api/v1/hives/[hiveId]/documents/`, `docs/acceptance/P1.5-document-upload.md`.

**Done when:** User selects multiple documents, creates a Hive, uploads successfully, refreshes, and sees persisted documents; existing-Hive uploads and quota enforcement work in live app.

**Blocked on:** Operator applies upload SQL (after P1.4 hive RPC if needed); deploy `v1-documents` with service role secret; optional `UPLOAD_MAX_FILE_BYTES` on Vercel.

**Deferred (unchanged):** UI â†’ Inngest â†’ Oracle Worker processing path; Canonical Study; Reader extraction.

---

## P1.4 â€” Hive persistence + unified Supabase authentication (V3)

**Status:** **IMPLEMENTED** â€” app code in repo; Hive path **BLOCKED** on Supabase apply + Edge Function deploy `v1-hives` where not yet applied; auth **ready for live email-code verification** after deploy (2026-10-21)

**Evidence:** `apps/web/src/lib/auth/`, `supabase/functions/v1-hives/`, `supabase/migrations/20261021130000_hive3_m1_public_hive_rpc.sql`, `docs/acceptance/P1.4-first-user-flow.md`.

---

## P1.3 â€” Database Qualification (deferred execution)

**Status:** PROCEDURE_READY (2026-10-20); **execution deferred** while application slices land

**Evidence:** `docs/HIVEFORYOU-V3-DATABASE-QUALIFICATION-P1.3.md`, `supabase/qualification/p1.3_q*.sql`.

**Re-run when:** After upload migrations apply and operator authorization for non-production qualification.

---

## P1.2 â€” Database Schema and RLS Design (awaiting acceptance)

**Status:** READY_FOR_REVIEW (2026-10-20)

**Evidence:** `docs/HIVEFORYOU-V3-DATABASE-MIGRATION-P1.2.md`, `supabase/migrations/20261020120000_hive3_m1_hives_baseline.sql`.

---

## Closed / historical sections

Prior P0.1â€“P0.3, P1.1, database-first plan approval, and Milestone 1 decision tables remain in git history and governing plan documents. **P1.5 (processing integration)** in the old development-plan row meant Inngest/Oracle; that work stays **NOT_STARTED** under a future ticket ID after upload acceptance.

**Processing integration (future):** UI â†’ Inngest â†’ Oracle Worker â†’ Reader â†’ `hive3` write/read â€” not part of this P1.5 upload ticket.

---

## Authority documents

| Document | Role |
|----------|------|
| `docs/PRODUCT-REQUIREMENTS.md` | OD-01 upload types/quota |
| `docs/DEVELOPMENT-PLAN.md` | Status index |
| `docs/HIVEFORYOU-V3-DEVELOPMENT-PLAN-database-first-PROPOSED.md` | Governing sequence |
