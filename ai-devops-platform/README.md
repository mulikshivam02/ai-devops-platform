# ChangeLens

ChangeLens is an evidence-first platform for understanding software and infrastructure changes

## Phase 1

The foundation includes a TypeScript Express API, MongoDB connection, health endpoint, and React/Vite application shell

### Run the backend

```powershell
cd server
Copy-Item .env.example .env
npm install
npm run dev
```

### Run the frontend

```powershell
cd client
Copy-Item .env.example .env
npm install
npm run dev
```

MongoDB must be available at the `MONGODB_URI` configured in `server/.env` before the API starts.

## GitHub read-only integration

ChangeLens includes an optional GitHub read-only adapter for importing repository metadata and recent commits into the existing normalized Change and Evidence pipeline.

### Scope

- Read-only GitHub API access only.
- No write operations, no webhook support, no automatic deployment detection.
- GitHub data is normalized through the existing Change/Evidence/Resource services.
- The GitHub adapter does not bypass the resource validation, change tracking, or evidence pipeline.

### Environment

Set the optional variables in `server/.env`:

```env
GITHUB_API_BASE_URL=https://api.github.com
GITHUB_TOKEN=
GITHUB_TIMEOUT_MS=15000
```

`GITHUB_TOKEN` is optional for public repositories. It is never exposed to the frontend and is never logged.

### Import flow

1. Validate `owner` and `repo` input as a simple owner/repo pair.
2. Require a valid existing ChangeLens resource ID for import.
3. Fetch repository metadata or recent commits from GitHub.
4. Normalize each commit into a `source=github` Change record and a corresponding `git` Evidence record.
5. Reuse existing records when the same GitHub SHA is encountered again.

### Idempotency

The import uses a stable change identifier:

`github:<owner>/<repo>:<sha>`

If the same commit is imported again, ChangeLens reuses the existing Change and avoids duplicate Evidence creation.

### Security boundaries

- Only the server can call GitHub.
- Requests use a bounded timeout and explicit error mapping for 401, 403, 404, 422, timeout, and network failures.
- No raw GitHub headers or tokens are returned from API responses.
- Arbitrary GitHub URLs are rejected at validation time.

## Kubernetes read-only integration

ChangeLens optionally connects to a Kubernetes API for bounded, read-only workload observations.

```env
KUBERNETES_API_URL=
KUBERNETES_TOKEN=
KUBERNETES_TIMEOUT_MS=10000
```

Endpoints:

- `GET /api/integrations/kubernetes/health`
- `GET /api/integrations/kubernetes/namespaces`
- `GET /api/integrations/kubernetes/workloads?namespace=&kind=`
- `POST /api/integrations/kubernetes/import`

The GET endpoints are available to authenticated viewers, operators, and administrators. Import requires an operator or administrator and an existing Kubernetes ChangeLens resource ID. Imports collect only bounded Deployment, StatefulSet, and DaemonSet state and normalize it into existing `kubernetes` Evidence and Change records. The first observation creates Evidence only; later meaningful differences create Changes, and repeated unchanged observations are skipped.

The integration never calls `kubectl` and never performs apply, patch, delete, create, or exec operations. Kubernetes tokens, authorization headers, secrets, service-account credentials, environment values, and raw Kubernetes objects are excluded from persistence and API responses. Prometheus and Loki are not part of this phase.

## Prometheus and Loki read-only observability

Phase 14 optionally collects bounded metric and log observations from server-configured Prometheus and Loki APIs:

```env
PROMETHEUS_API_URL=
PROMETHEUS_TOKEN=
PROMETHEUS_TIMEOUT_MS=10000
LOKI_API_URL=
LOKI_TOKEN=
LOKI_TIMEOUT_MS=10000
```

Endpoints:

- `GET /api/integrations/prometheus/health`
- `GET /api/integrations/prometheus/query?query=...`
- `GET /api/integrations/prometheus/import?resourceId=...&query=...`
- `GET /api/integrations/loki/health`
- `GET /api/integrations/loki/query?query=...&limit=...`
- `POST /api/integrations/observability/import`

Prometheus observations use `source=prometheus`, `evidenceType=metric`; Loki observations use `source=loki`, `evidenceType=log`. Imports require an existing resource and use deterministic correlation IDs so repeated observations are idempotent. Metric or log changes alone never create causal Change records or deployment IDs.

Queries, labels, result counts, response sizes, log messages, and Loki time ranges are bounded. Loki messages and sensitive labels are redacted. Tokens remain server-side and are never returned, logged, or persisted. Only GET requests are made to configured external APIs; no alert, rule, log, metric, or configuration mutation endpoints exist.

## End-to-end Change Intelligence

Phase 15 connects the existing services through one explicit lifecycle:

`Change -> Evidence -> Dependency -> Risk -> Prediction -> Observation -> Reality -> Comparison -> AI Investigation -> Learning -> Recommendation`

Endpoints:

- `POST /api/intelligence/changes/:changeId/analyze`
- `POST /api/intelligence/changes/:changeId/evaluate`
- `GET /api/intelligence/changes/:changeId`

Analysis and evaluation require operator/admin access; the consolidated view is available to authenticated viewers. Deterministic Change Analysis, security findings, risk, prediction, evidence, dependency impact, reality, comparison, and historical learning remain authoritative. AI receives bounded structured context and is optional; unavailable AI never prevents deterministic analysis. Metric and log observations are not treated as causal changes. No deployment, rollback, shell execution, or remediation mutation is performed.

## Production-grade dashboard workflow

Phase 16 makes the authenticated landing page an operational Dashboard. It provides bounded change health counts, recent changes, risk distribution, integration/AI status, and recent prediction-versus-reality outcomes. The Changes explorer supports bounded search/filtering and links directly to the Phase 15 intelligence detail view.

`GET /api/dashboard/summary` returns only aggregate counts, bounded recent change summaries, outcome summaries, and integration status. It does not return raw evidence, logs, credentials, or tokens. The user workflow is:

`Dashboard -> Change -> Intelligence -> Prediction -> Observation -> Reality -> RCA -> Recommendation`

No continuous polling, automatic remediation, deployment, rollback, or production mutation is added.

## Historical learning and accuracy

Phase 17 closes the deterministic feedback loop:

`Prediction -> Reality -> Prediction vs Reality -> Accuracy -> Historical Outcome -> Similarity -> Future Risk`

Completed evaluations persist bounded `HistoricalOutcome` records containing normalized change/prediction/reality summaries, outcome classification, evidence quality, affected resource references, and versioned accuracy dimensions. Accuracy version `1.0` calculates the average of available outcome, impact-category, affected-resource, and failure-mode dimensions; unavailable dimensions are excluded, and insufficient evidence produces no accuracy score.

Historical risk is a bounded contributor only. When at least two completed outcomes exist for the same resource and change type, unexpected or partially predicted outcomes contribute up to 12 deterministic risk points with an explainable factor. No history is neutral. Historical records never contain credentials, raw logs, or external API responses.

Historical endpoints:

- `GET /api/intelligence/history/summary`
- `GET /api/intelligence/history/similar/:changeId`
- `GET /api/intelligence/history/accuracy/:changeId`

---

## Production Configuration

### Environment Setup

Create `server/.env` for production deployment with:

```env
NODE_ENV=production
PORT=4000
MONGODB_URI=mongodb+srv://[user]:[password]@cluster.mongodb.net/changelens
CLIENT_URL=https://your-domain.com
AUTH_DISABLED=false
ALLOW_PUBLIC_REGISTRATION=false

JWT_SECRET=[generate-with-openssl-rand-base64-32]
INITIAL_ADMIN_EMAIL=admin@your-domain.com
INITIAL_ADMIN_PASSWORD=[strong-password]

# Optional: AI provider
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=llama3.2
OLLAMA_TIMEOUT_MS=120000

# Optional: Integrations
GITHUB_API_BASE_URL=https://api.github.com
GITHUB_TOKEN=[optional-github-token]
KUBERNETES_API_URL=https://kubernetes.default.svc
KUBERNETES_TOKEN=[service-account-token]
PROMETHEUS_API_URL=http://prometheus:9090
LOKI_API_URL=http://loki:3100
```

### Required Production Settings

- `NODE_ENV=production` - enables security checks
- `CLIENT_URL` - must match frontend origin (required)
- `AUTH_DISABLED=false` - authentication must be enabled (required)
- `JWT_SECRET` - minimum 32 characters, random (required)
- `MONGODB_URI` - production MongoDB instance (required)

### Security Validation

The application validates production configuration:

- ✅ Rejects `AUTH_DISABLED=true` in production
- ✅ Requires `JWT_SECRET` ≥32 characters
- ✅ Requires `CLIENT_URL` in production
- ✅ Enforces CORS to configured CLIENT_URL only
- ✅ Secrets never logged or exposed in error responses
- ✅ RBAC enforced on all `/api` endpoints

### Optional: Ollama AI Integration

ChangeLens can integrate with a local or remote Ollama instance for evidence-backed RCA.

```bash
# Local development
docker run -d -p 11434:11434 ollama/ollama
ollama pull llama3.2
```

Or configure OLLAMA_BASE_URL to point to a remote instance. AI is optional; if unavailable, the application continues to function deterministically.

### Optional: Integration Credentials

All integration tokens are optional and server-side only:

- `GITHUB_TOKEN` - optional for public repo import, required for private
- `KUBERNETES_TOKEN` - required for Kubernetes integration
- `PROMETHEUS_TOKEN` - optional for Prometheus
- `LOKI_TOKEN` - optional for Loki

Tokens are never exposed to the frontend or logged.

---

## Development

### Prerequisites

- Node.js 18+
- MongoDB 4.4+
- (Optional) Ollama for local AI

### Local Setup

Backend:
```powershell
cd server
Copy-Item .env.example .env
npm install
npm run dev
```

Frontend:
```powershell
cd client
npm install
npm run dev
```

API runs at `http://localhost:4000/api`
Frontend runs at `http://localhost:5173`

### Testing

```powershell
cd server
npm test -- --run
npm run typecheck
npm run build
```

```powershell
cd client
npm run typecheck
npm run build
```

### MongoDB Setup

Local development:
```bash
docker run -d -p 27018:27017 mongo:latest
```

### Ollama Setup

Local development:
```bash
docker run -d -p 11434:11434 ollama/ollama
ollama pull qwen3:8b  # or llama3.2
```

---

## Docker Deployment

A `docker-compose.yml` is provided for local deployment/demo:

```bash
docker-compose up
```

This starts:
- MongoDB (persistent volume at `./mongo-data`)
- Ollama (optional, for AI)
- Backend API (port 4000)
- Frontend (port 3000)

---

## Important Safety Limitations

ChangeLens follows a strict evidence-first and safe-by-default principle:

1. **No Automatic Production Mutation**: Remediation is dry-run only. No shell commands, Kubernetes operations, Terraform changes, or cloud mutations are executed automatically.

2. **No Unauthenticated Access**: All `/api` endpoints require JWT authentication. Only `/api/health` is public.

3. **No Arbitrary External Execution**: Integration URLs are configured server-side only. Clients cannot invoke arbitrary external systems.

4. **AI is Optional**: If Ollama is unavailable, the application continues to function. Deterministic analysis, risk scoring, and change intelligence operate independently of AI.

5. **Tokens Never Exposed**: GitHub, Kubernetes, Prometheus, and Loki tokens are environment variables only. They are never returned in API responses, logged, or persisted.

6. **Evidence-Backed Reasoning**: AI investigation and RCA recommendations are based only on collected Evidence, Changes, and Dependencies. Predictions and historical context are provided, but not AI-fabricated claims.

7. **Read-Only Integrations**: All external integrations (GitHub, Kubernetes, Prometheus, Loki) are read-only. No write operations, mutations, or side effects occur.

8. **Prediction vs Reality**: The system captures predictions before deployment, then compares them against observed reality. If reality diverges from predictions, the system records the discrepancy and learns from it.

9. **RBAC Enforcement**: GET operations require viewer+ access. Mutations (POST/PATCH/DELETE) require operator+ access. Admin operations require admin role.

10. **No Secrets in Code**: JWT secret, integration tokens, and MongoDB credentials are environment variables only.

---

## API Overview

### Authentication

```
POST /api/auth/login
POST /api/auth/register
GET /api/health
GET /api/health/live
GET /api/health/ready
```

### Resources & Evidence

```
GET /api/resources
POST /api/resources
GET /api/evidence
POST /api/evidence
```

### Change Intelligence

```
GET /api/changes
POST /api/changes
POST /api/intelligence/changes/:changeId/analyze
POST /api/intelligence/changes/:changeId/evaluate
GET /api/intelligence/changes/:changeId
```

### Integrations

```
GET /api/integrations/github/preview
POST /api/integrations/github/import
GET /api/integrations/kubernetes/health
GET /api/integrations/kubernetes/namespaces
GET /api/integrations/kubernetes/workloads
POST /api/integrations/kubernetes/import
GET /api/integrations/prometheus/health
GET /api/integrations/prometheus/query
POST /api/integrations/prometheus/import
POST /api/integrations/observability/import
```

### Remediation

```
POST /api/remediation
POST /api/remediation/:id/analyze
POST /api/remediation/:id/generate
POST /api/remediation/:id/validate
POST /api/remediation/:id/prepare-pr
POST /api/remediation/:id/approve (admin only)
POST /api/remediation/:id/reject (admin only)
POST /api/remediation/:id/dry-run
POST /api/remediation/:id/verify
```

### Dashboard & History

```
GET /api/dashboard/summary
GET /api/intelligence/history/summary
GET /api/intelligence/history/similar/:changeId
GET /api/intelligence/history/accuracy/:changeId
```

---

## Feature Matrix

| Feature | Status | Requires External | Notes |
|---------|--------|------------------|-------|
| Change History | ✅ Implemented | No | Manual or integration import |
| Evidence Collection | ✅ Implemented | No | Manual or integration import |
| Dependency Graph | ✅ Implemented | No | Manual or integration import |
| Change Intelligence | ✅ Implemented | No | Deterministic, no AI required |
| Risk Scoring | ✅ Implemented | No | Deterministic 0-100 scale |
| Impact Prediction | ✅ Implemented | No | Uses existing data only |
| Prediction vs Reality | ✅ Implemented | No | Compares with observed evidence |
| Historical Learning | ✅ Implemented | No | Persisted outcomes & accuracy |
| AI Investigation/RCA | ✅ Implemented | Optional | Requires Ollama (optional) |
| GitHub Integration | ✅ Implemented | Optional | Read-only commits & metadata |
| Kubernetes Integration | ✅ Implemented | Optional | Read-only workloads |
| Prometheus Integration | ✅ Implemented | Optional | Read-only metrics |
| Loki Integration | ✅ Implemented | Optional | Read-only logs |
| RBAC | ✅ Implemented | No | Three roles: viewer, operator, admin |
| Remediation (Dry-Run) | ✅ Implemented | No | Simulates only, no mutations |
| Dashboard | ✅ Implemented | No | Aggregate view of change health |

---

## Quick Start: Demo Workflow

1. Start MongoDB and Ollama (optional):
   ```bash
   docker-compose up -d mongo ollama
   ```

2. Start backend and frontend:
   ```bash
   # Terminal 1: Backend
   cd server
   npm run dev

   # Terminal 2: Frontend
   cd client
   npm run dev
   ```

3. Log in at `http://localhost:5173` with:
   - Email: Use INITIAL_ADMIN_EMAIL from setup
   - Password: Use INITIAL_ADMIN_PASSWORD from setup

4. Create a resource, add evidence, create a change:
   - Add a resource (repository, deployment, etc.)
   - Add evidence (commit, metric, log)
   - Create a change linked to evidence

5. Analyze the change:
   - `POST /api/intelligence/changes/:changeId/analyze` → deterministic risk/impact
   - Add observability evidence (metrics, logs)
   - `POST /api/intelligence/changes/:changeId/evaluate` → prediction vs reality

6. (Optional) AI Investigation:
   - `POST /api/intelligence/changes/:changeId/investigate` → RCA and recommendations
   - Only works if Ollama is running

7. Remediation (Safe):
   - `POST /api/remediation` → propose remediation actions
   - `POST /api/remediation/:id/approve` (admin) → approve changes
   - `POST /api/remediation/:id/dry-run` → simulate without mutations

---

## Feedback & Contributions

ChangeLens is in active development. Feedback and contributions are welcome.

---

**Version**: 0.1.0
**Status**: Production Ready (Phase 18 audit passed)
