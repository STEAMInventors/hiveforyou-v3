# @hiveforyou/contracts

Versioned HTTP and data contracts shared by `apps/web`, `apps/worker`, and `apps/reader`.

**Normative spec:** `docs/ERROR-HANDLING-RECOVERY.md`

## error-envelope@1

- TypeScript: `src/errors/v1`
- JSON Schema: `schemas/error-envelope.v1.json`

Do not import Worker or Reader implementation code from other apps; depend on this package only.
