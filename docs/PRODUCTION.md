# ChangeLens Production Operations

## Configuration

Copy `.env.example` to a local environment file and provide deployment-specific values. Never commit `.env` files or credentials.

Required production values:

- `NODE_ENV=production`
- `PORT`
- `MONGODB_URI`
- `CLIENT_URL`
- `JWT_SECRET` with at least 32 characters
- `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, and `OLLAMA_TIMEOUT_MS` when AI is enabled

Ollama is optional. MongoDB is required for readiness.

## Authentication and RBAC

Authentication uses scrypt-hashed passwords and signed bearer tokens. The first admin can be initialized with `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` before startup. Public registration must remain disabled in production.

Roles are `viewer`, `operator`, and `admin`. Read operations require authentication. Mutating operations require operator or admin privileges. RBAC never bypasses deterministic remediation validation, approval, or dry-run policy.

## Health and Operations

- `/api/health/live` confirms the process is alive.
- `/api/health/ready` confirms MongoDB readiness. Ollama does not affect readiness.
- `/api/health` reports safe version, environment, uptime, and dependency status.

Every request receives an `X-Request-ID`. Structured logs include request ID, route, method, status, and duration. Error responses contain a safe code, message, and request ID without stack traces or credentials.

The server handles `SIGINT` and `SIGTERM` by stopping the listener and closing MongoDB.

## Data Safety

MongoDB is the source of durable ChangeLens history. Back up changes, Evidence, investigations, Prediction vs Reality records, SecurityFindings, remediation history, users, and AdvancedInsights. No automatic destructive retention or cleanup is enabled.

Secrets must not be stored in Evidence, AI context, remediation audit records, logs, or frontend configuration. `VITE_*` values are public browser configuration only.

## Remediation Safety

Remediation accepts only structured allowlisted actions. PR preparation is local data and does not call GitHub. Execution is dry-run only; no shell, Kubernetes, Terraform, Docker, cloud, or credential mutation path exists. Verification requires separate observed Evidence; missing Evidence is insufficient evidence, not success.

## Deployment Notes

Build with `npm run build` in both `server` and `client`. Run the server with `npm start` after supplying environment variables. Put the frontend behind an explicit configured `CLIENT_URL`; do not use wildcard CORS with authenticated APIs.

## Limitations

Live MongoDB smoke tests, browser automation, backups, and external deployment orchestration depend on the deployment environment and are not performed by the application.
