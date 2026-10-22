# Active ticket

**Phase / Ticket:** P1.7-B — Pre-study document delete and replace
**Status:** **IMPLEMENTED (repo)** — blocked on Supabase apply of `20261021200000_hive3_m1_document_delete_replace_study_lock.sql` + redeploy Edge `v1-documents` + web deploy; live acceptance rows 26–36 in `docs/acceptance/P1.7-document-workspace-hive-delete.md` (2026-10-21)

**Objective:** Owner delete/replace for registered sources before study lock; begin/finalize deletion with `deleting_at`; replacement via new row/path without extra quota; `study_locked_at` + study enqueue contract RPCs (no study-run tables in M1).

**Evidence:** `supabase/migrations/20261021200000_hive3_m1_document_delete_replace_study_lock.sql`, `supabase/qualification/p1.7_b_document_delete_replace_assertions_readonly.sql`, `supabase/functions/v1-documents/index.ts`, `apps/web/src/components/workspace/HiveDocumentsPanel.tsx`, `DeleteDocumentModal.tsx`, `POST .../documents/delete`.

**Done when:** After SQL + Edge + web deploy, acceptance rows 26–36 pass; P1.7 upload recovery (rows 19–25) and card summary (13–18) unchanged.

**Blocked on:** Operator applies P1.7-B SQL after `20261021190000`; redeploy `v1-documents`; deploy web app.

---

## P1.7 — Upload count and failed attempt recovery

**Status:** **IMPLEMENTED (repo)** — blocked on Supabase apply of `20261021190000_hive3_m1_upload_prepare_quota_dismiss.sql` + redeploy Edge `v1-documents` + web deploy; live acceptance rows 19–25 in `docs/acceptance/P1.7-document-workspace-hive-delete.md` (2026-10-21)

**Objective:** Document workspace counts only registered uploads; failed attempts listed separately with dismiss (storage cleanup first); new upload prepare blocked when monthly quota is exhausted (registration-time check unchanged).

**Evidence:** `supabase/migrations/20261021190000_hive3_m1_upload_prepare_quota_dismiss.sql`, `supabase/qualification/p1.7_upload_count_recovery_assertions_readonly.sql`, `supabase/functions/v1-documents/index.ts`, `apps/web/src/components/workspace/HiveDocumentsPanel.tsx`, `apps/web/src/lib/documents/document-workspace-lists.ts`.

**Done when:** After SQL + Edge + web deploy, acceptance rows 19–25 pass; P1.7-A card summary (rows 13–18) remains as previously specified.

**Blocked on:** Operator applies P1.7 recovery SQL after P1.7-A `20261021180000`; redeploy `v1-documents`; deploy web app.

---

## P1.7-A — My Hives card summary and Delete Hive from cards

**Status:** **IMPLEMENTED (repo)** — blocked on Supabase apply of `20261021180000_hive3_m1_hive_card_summary.sql` + web deploy; live acceptance per `docs/acceptance/P1.7-document-workspace-hive-delete.md` (2026-10-21)

**Objective:** My Hives cards show persisted document count and filename preview (one list RPC), domain placeholder **Not identified yet.**, and **Open Hive** / **Delete Hive** actions reusing the existing typed `delete` modal and Edge deletion flow.

**Evidence:** `supabase/migrations/20261021180000_hive3_m1_hive_card_summary.sql`, `supabase/qualification/p1.7_a_hive_card_summary_assertions_readonly.sql`, `apps/web/src/components/hives/HiveCardGrid.tsx`, `HiveCardMenu.tsx`, `apps/web/src/lib/hives/hive-card-summary.ts`, `packages/contracts/src/hives/v1/types.ts`.

**Done when:** After SQL + web deploy, acceptance rows 13–18 in P1.7 doc pass; P1.7 base deletion (rows 5–12) remains as previously verified at commit `52cb061` where applicable.

**Blocked on:** Operator applies P1.7-A SQL (after P1.7 `20261021170000`); deploy web app. No Edge Function redeploy required for list field passthrough.

---

## P1.7 — Document workspace UX and permanent Hive deletion

**Status:** **IMPLEMENTED (repo)** — P1.7 SQL applied per operator; Edge `v1-hives` deployed at commit `52cb061`; web + live acceptance pending (2026-10-21)

**Objective:** Prototype-aligned Documents tab (upload-only states) and owner-initiated permanent Hive deletion with typed `delete` confirmation, storage cleanup, and restricted database finalize.

**Evidence:** `supabase/migrations/20261021170000_hive3_m1_hive_deletion_document_workspace.sql`, `supabase/functions/v1-hives/`, `supabase/functions/_shared/hive-source-storage.ts`, `apps/web/src/components/workspace/`, `docs/acceptance/P1.7-document-workspace-hive-delete.md`.

---

## P1.6 — Database-backed upload policy

**Status:** **IMPLEMENTED (repo)** — blocked on Supabase apply of `20261021160000_hive3_m1_upload_product_policy.sql` + redeploy Edge Function `v1-documents`; live acceptance per `docs/acceptance/P1.6-upload-product-policy.md` (2026-10-21)

**Evidence:** `supabase/migrations/20261021160000_hive3_m1_upload_product_policy.sql`, `supabase/qualification/p1.6_upload_policy_assertions_readonly.sql`, `packages/contracts/src/documents/v1/types.ts`, `apps/web/src/lib/documents/upload-policy.ts`, `docs/acceptance/P1.6-upload-product-policy.md`.

**Done when:** Policy changes in Supabase affect enforcement and UI without app redeploy; P1.5 upload flow intact; payments remain disabled.

**Blocked on:** Operator applies P1.6 SQL after P1.5 upload migrations; redeploy `v1-documents`.

---

## P1.5 — Complete reusable document upload

**Status:** **IMPLEMENTED (repo)** — blocked on Supabase apply of upload migrations + deploy Edge Function `v1-documents`; live browser acceptance pending (2026-10-21)

**Evidence:** `supabase/migrations/20261021150000_hive3_m1_upload_baseline.sql`, `supabase/migrations/20261021150100_hive3_m1_public_document_rpc.sql`, `supabase/functions/v1-documents/`, `docs/acceptance/P1.5-document-upload.md`.

**Deferred (unchanged):** UI → Inngest → Oracle Worker processing path; Canonical Study; Reader extraction.

---

## P1.4 — Hive persistence + unified Supabase authentication (V3)

**Status:** **IMPLEMENTED** — app code in repo; Hive path **BLOCKED** on Supabase apply + Edge Function deploy `v1-hives` where not yet applied; auth **ready for live email-code verification** after deploy (2026-10-21)

**Evidence:** `apps/web/src/lib/auth/`, `supabase/functions/v1-hives/`, `supabase/migrations/20261021130000_hive3_m1_public_hive_rpc.sql`, `docs/acceptance/P1.4-first-user-flow.md`.

---

## P1.3 — Database Qualification (deferred execution)

**Status:** PROCEDURE_READY (2026-10-20); **execution deferred** while application slices land

**Evidence:** `docs/HIVEFORYOU-V3-DATABASE-QUALIFICATION-P1.3.md`, `supabase/qualification/p1.3_q*.sql`.

**Re-run when:** After upload migrations apply and operator authorization for non-production qualification.

---

## P1.2 — Database Schema and RLS Design (awaiting acceptance)

**Status:** READY_FOR_REVIEW (2026-10-20)

**Evidence:** `docs/HIVEFORYOU-V3-DATABASE-MIGRATION-P1.2.md`, `supabase/migrations/20261020120000_hive3_m1_hives_baseline.sql`.

---

## Closed / historical sections

Prior P0.1–P0.3, P1.1, database-first plan approval, and Milestone 1 decision tables remain in git history and governing plan documents. **P1.5 (processing integration)** in the old development-plan row meant Inngest/Oracle; that work stays **NOT_STARTED** under a future ticket ID after upload acceptance.

**Processing integration (future):** UI → Inngest → Oracle Worker → Reader → `hive3` write/read — not part of this P1.5 upload ticket.

---

## Authority documents

| Document | Role |
|----------|------|
| `docs/PRODUCT-REQUIREMENTS.md` | OD-01 upload types/quota; owner Hive deletion (P1.7) |
| `docs/DEVELOPMENT-PLAN.md` | Status index |
| `docs/HIVEFORYOU-V3-DEVELOPMENT-PLAN-database-first-PROPOSED.md` | Governing sequence |
| `docs/acceptance/P1.7-document-workspace-hive-delete.md` | P1.7 live acceptance |
