

## Architecture Style

The initial system is a modular monolith.

```text
Frontend
   ↓
REST API
   ↓
Application Services
   ↓
Domain Engines
   ↓
Collectors / External Systems
   ↓
MongoDB

AI is an additional reasoning layer and is not the source of truth.

High-Level Architecture

                    DevOps Resources
                          │
                          ▼
                   Resource Discovery
                          │
                          ▼
                    Data Collection
                          │
                          ▼
                    Normalization
                          │
                          ▼
                    Evidence Engine
                          │
                ┌─────────┴─────────┐
                ▼                   ▼
        Dependency Graph         History
                │                   │
                └─────────┬─────────┘
                          ▼
                  Change Intelligence
                          │
                 ┌────────┴────────┐
                 ▼                 ▼
             Risk Engine     Impact Prediction
                 │                 │
                 └────────┬────────┘
                          ▼
                      Deployment
                          │
                          ▼
                     Observability
                          │
                          ▼
                     Actual Impact
                          │
                          ▼
                 Prediction vs Reality
                          │
                          ▼
                     AI Reasoning
                          │
                          ▼
                  Incident Intelligence
                          │
                          ▼
                   Security Intelligence
                       │
                       ▼
                    Recommendation
                          │
                          ▼
                 Controlled Remediation
                          │
                          ▼
                       Verify
                          │
                          ▼
                       History

      ## Kubernetes Read-Only Integration

      Phase 13 adds a server-side Kubernetes input adapter under `server/src/integrations/kubernetes/`. The client performs only bounded HTTP GET requests for API version, namespaces, Deployments, StatefulSets, and DaemonSets. It never calls `kubectl` and exposes no cluster mutation endpoint.

      Workload objects are reduced to namespace, name, kind, bounded labels/annotations, images, replica/readiness state, rollout metadata, conditions, and observation time. The normalized snapshot is stored as `source=kubernetes`, `evidenceType=kubernetes` Evidence. The first observation creates Evidence only; later observations compare the previous normalized snapshot and create a `source=kubernetes` Change with before/after values when meaningful state changes are detected.

   ## Prometheus and Loki Observability

   Phase 14 adds optional server-side read-only adapters. Prometheus `/api/v1/query` results are reduced to bounded metric labels, values, timestamps, query, and provider. Loki `/loki/api/v1/query_range` results are reduced to bounded labels, redacted messages, timestamps, query, and provider within a maximum one-hour range.

   The combined observability import requires an existing resource and writes through the existing Evidence service only: Prometheus uses `source=prometheus` and `evidenceType=metric`; Loki uses `source=loki` and `evidenceType=log`. Stable correlation IDs make repeated observations idempotent. Metric/log variation is not treated as a causal deployment or Change. No external URL is accepted from API input, and no mutation API is implemented.

   ## End-to-End Change Intelligence Orchestration

   Phase 15 adds `server/src/intelligence/changeIntelligence.service.ts` as the single composition boundary for the existing lifecycle: Change, Evidence, dependency/impact analysis, deterministic risk, prediction snapshot, observability-backed reality, prediction comparison, AI investigation, historical learning, and remediation recommendation context.

   The orchestrator reuses existing services and models. Prediction and reality evaluation are repeatable through existing snapshots plus stable observation-window/comparison lookups. Optional GitHub, Kubernetes, Prometheus, Loki, historical, security, and AI failures degrade to missing or insufficient context where possible. Deterministic facts remain separate from AI inference, and no deployment or production mutation is performed.

   ## Production Dashboard

   Phase 16 adds a thin dashboard aggregation boundary at `GET /api/dashboard/summary`. It performs bounded read-only model queries for change counts, risk distribution, recent change summaries, comparison outcomes, resource names, and optional integration/AI status. It contains no new intelligence calculations and does not expose raw Evidence or external credentials.

   The frontend uses the dashboard as the authenticated entry point, the Changes explorer as the bounded selection surface, and the Phase 15 orchestrator as the detail view. Existing Resource, Evidence, integration, graph, security, remediation, and historical sections remain available through the same application shell.

   ## Historical Feedback Loop

   Phase 17 persists one normalized `HistoricalOutcome` per Change and prediction version after a completed reality comparison. It records bounded summaries and references only. Accuracy version `1.0` averages the available outcome, impact, resource, and failure-mode dimensions; missing dimensions are excluded and `insufficient_evidence` remains unscored.

   Historical similarity continues to use deterministic characteristics already present in Phase 10: resource, change type, environment, impact categories, paths, size, and dependency chain. Completed outcome history adds observed outcome and accuracy context. Future deterministic risk receives at most 12 historical points after at least two comparable outcomes; no history contributes zero. AI does not modify these values.
## API surface and lifecycle notes (Phase 6)

- **Dashboard counts** (`dashboard/dashboard.service.ts`) come from database aggregations over the latest analysis / comparison per change, never from the 12-item recent windows. Recent-change risk, prediction, reality and outcome are looked up by the IDs of the changes actually shown.
- **Health probes** (Kubernetes, Prometheus, Loki, AI) go through `utils/ttlCache.ts` with a 20 s TTL. Concurrent requests share one in-flight probe; a failed probe is cached as "unavailable" so a down system is not re-probed on every poll. `utils/timeout.ts` bounds the AI probe at 2 s and always clears its timer.
- **Pagination**: every list endpoint, including `GET /api/resources`, uses `parsePagination` (default 25, max 100) and returns `{ data, pagination }`. List queries are built from validated fields only (`buildResourceQuery`), never by passing the request's filter object to `find()`.
- **Startup and shutdown** (`server.ts`): a startup failure logs the real error (credentials in connection strings redacted) and exits 1. SIGINT/SIGTERM close idle keep-alive connections, wait for in-flight requests, disconnect MongoDB and exit 0, with a 10 s force-exit bound. The MongoDB `error` listener is attached once at module load.

## Frontend routing, sessions and roles (Phase 7)

- **Routing**: `react-router-dom` (`BrowserRouter` in `main.tsx`, routes in `AppRoutes.tsx`). Every page is
  a lazily loaded route, so a page's data is fetched only when it is opened. Previously all fifteen pages
  rendered at once and signing in fired every page's requests together, including the dashboard's live
  probes and the intelligence overview. `/changes/:changeId` deep-links to one change's intelligence view.
- **Auth** (`auth/`): `AuthProvider` holds the current user, `RequireAuth` guards the routes and remembers
  where the visitor was going, `Can`/`useCan` hide controls the role cannot use (viewer < operator < admin,
  mirroring `middleware/auth.middleware.ts`). Hiding is a courtesy; the server remains the authority.
- **Session**: the token lives in `sessionStorage` (`services/session.ts`). Any 401 clears it and the app
  returns to sign-in. A token left in `localStorage` by an earlier version is deleted on load.
- **API client**: `buildHeaders` merges caller headers over the defaults case-insensitively, so passing
  custom headers no longer drops `Authorization`. `listResources` follows pagination to the end.
- **Same-origin API**: the client calls `/api`; Vite (dev/preview) and nginx (Docker) forward it to the
  backend. nginx sets `X-Forwarded-For`, and the backend's `TRUST_PROXY` setting makes the rate limiter
  see real client addresses.
- **Tests**: `vitest` + Testing Library (`client/src/**/*.test.ts(x)`), including route-level tests that
  mock the API module and assert which calls each route makes.
