# Oracle Worker — Inngest Connect

HiveForYou study-run processing (`hive3-process-study-run`) runs on the Oracle Worker through **Inngest Connect** (outbound WebSocket). Vercel publishes `hive3/study_run.queued` events only; it does not invoke Oracle over HTTP.

## Runtime

- **Node.js:** 22.4.0 or newer (built-in WebSocket required by the Inngest Connect SDK).
- **Process:** `npm run start` in `apps/worker` starts the diagnostic HTTP server and Connect in one long-running process.

## Required environment variables (Oracle host)

| Variable | Purpose |
|----------|---------|
| `INNGEST_SIGNING_KEY` | Authenticates the Connect worker to Inngest Cloud (same environment as Vercel). |
| `SUPABASE_URL` | Worker persistence (unchanged). |
| `SUPABASE_SERVICE_ROLE_KEY` | Worker RPC transitions and artifacts (unchanged). |
| `READER_BASE_URL`, `READER_SERVICE_TOKEN` | Reader HTTP (unchanged). |
| `WORKER_SERVICE_TOKEN` | Protects `/internal/v1/process-study-run` for local/diagnostic HTTP only. |

Optional:

| Variable | Purpose |
|----------|---------|
| `WORKER_INNGEST_APP_VERSION` | Rolling deploy version (git SHA or image tag). |
| `WORKER_INNGEST_INSTANCE_ID` | Stable worker instance id (defaults to `HOSTNAME`). |
| `WORKER_INNGEST_MAX_CONCURRENCY` | Max concurrent Inngest steps per worker (default `5`). |
| `INNGEST_DEV=1` | Local dev: Connect to Inngest Dev Server (no signing key). |

**Not required on Vercel after Connect:** `WORKER_ORACLE_BASE_URL`, `WORKER_SERVICE_TOKEN`, or `SUPABASE_SERVICE_ROLE_KEY` for Inngest execution.

## systemd (example)

Adjust paths and env file location to match the Oracle host.

```ini
[Unit]
Description=HiveForYou Worker (HTTP diagnostics + Inngest Connect)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=hiveforyou
WorkingDirectory=/opt/hiveforyou/hiveforyou-v3/apps/worker
EnvironmentFile=/etc/hiveforyou/worker.env
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartSec=5
# Connect drains in-flight steps on SIGTERM before closing the WebSocket.
KillSignal=SIGTERM
TimeoutStopSec=120

[Install]
WantedBy=multi-user.target
```

Ensure `/etc/hiveforyou/worker.env` includes `INNGEST_SIGNING_KEY` and existing Worker/Reader/Supabase/LiteLLM variables from `worker.config.env.example`.

## Deploy steps (operator)

1. Apply Supabase migrations and configure Reader/Worker secrets as in the release runbook.
2. Set `INNGEST_SIGNING_KEY` on the Oracle Worker host (Inngest dashboard → Signing key for the production environment).
3. Remove `WORKER_ORACLE_BASE_URL` and `WORKER_SERVICE_TOKEN` from **Vercel** once Connect is verified (Vercel keeps `INNGEST_EVENT_KEY` for event send).
4. Deploy Vercel with an empty `/api/inngest` function list (no competing `hive3-process-study-run` registration).
5. Pull release SHA on Oracle, `npm ci` in `apps/worker` (uses `.npmrc` `legacy-peer-deps` for Inngest peer resolution), restart the Worker systemd unit.
6. Confirm `GET http://127.0.0.1:8081/health` returns `inngest_connect_state: "ACTIVE"` (or `ConnectionState.ACTIVE` string from SDK).
7. In Inngest Cloud → Workers, confirm the `hiveforyou-worker` app shows an active connection and synced `hive3-process-study-run`.

## Local development

1. Run Inngest Dev Server (`npx inngest-cli@latest dev`).
2. In `apps/worker`: `INNGEST_DEV=1 npm run start`.
3. In `apps/web`: configure `INNGEST_EVENT_KEY` / dev keys and submit a study run; execution should appear on the Connect worker.
