

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