# Features

## Status Legend

- Planned
- In Progress
- Implemented

## Resource Center

Status: Implemented

Phase 2 provides a manually managed normalized resource inventory. External discovery integrations remain future work.

Discover and normalize:
- GitHub
- Kubernetes
- Terraform
- Docker
- Prometheus
- Loki

Resources include repositories, pull requests, commits, workflows, deployments, services, pods, namespaces, Terraform resources, infrastructure resources, metrics and logs.

## Evidence Engine

Status: Implemented

Phase 3 stores and retrieves manually supplied, timestamped evidence with resource references, source/type classification, filtering, pagination, and redacted structured display. Live external collectors remain future work.

Collect and normalize evidence from external systems.

Evidence should contain:
- source
- resource
- type
- timestamp
- value
- metadata

## Change History

Status: Implemented

Phase 3 records manually supplied change history with deterministic classifications, evidence ID references, filtering, pagination, and explicit status updates. Risk, impact, prediction, and analysis remain future work.

## Dependency Graph

Status: Implemented

Phase 4 provides explicit, deterministic dependency relationships with evidence references, direct and multi-hop traversal, cycle-safe graph responses, and a basic frontend graph view. Risk, blast-radius scoring, prediction, and live collectors remain future work.

Build relationships between services, deployments, pods, containers, databases, infrastructure and Git changes.

Use the graph for dependency visualization, blast radius and impact analysis.

## Change Intelligence

Status: Implemented

Phase 5 provides deterministic analysis of recorded changes: normalized changed items, explicit and dependency-expanded affected resources, documented blast-radius counts, deterministic risk scoring, derived impact categories, rollback availability from existing Change data, and evidence references. It does not execute actions or use AI.

Analyze Git commits, GitHub pull requests, Terraform plans, Kubernetes changes, configuration changes and deployments.

Output:
- change summary
- affected resources
- dependencies
- blast radius
- risk
- historical similarity
- rollback availability

## Risk Engine

Status: Implemented

Phase 5 calculates change risk deterministically using seven factors:
- change size (lines of code, file count)
- environment (production: 30 points, staging: 15, dev: 5)
- affected resource count (up to 20 points)
- dependency depth (up to 15 points)
- security sensitivity (up to 25 points)
- rollback availability (±5 to ±10 points)
- historical failures (up to 10 points)

Risk scoring produces a 0-100 scale with levels: low/medium/high/critical. Scoring is deterministic and does not use AI.

## Impact Prediction

Status: Implemented

Phase 5 predicts impact categories (latency, error-rate, CPU, memory, availability), affected services, affected resources, and failure modes. Predictions are stored in PredictionSnapshot records, use only existing Change and Resource data, and require no external execution.

## Prediction vs Reality

Status: Implemented

Phase 6 snapshots Phase 5 predictions, derives observations only from relevant structured Evidence within a maximum seven-day window, and compares impact categories, resources, metrics, blast radius, severity, and accuracy. Missing evidence is reported as insufficient evidence rather than no impact. No external collectors or execution are included.

## Incident Intelligence

Status: Implemented

Phase 7 provides an optional evidence-backed AI reasoning layer with replaceable providers, bounded deterministic context, structured response validation, persisted investigations, RCA hypotheses, and advisory recommendations. AI remains non-authoritative and Ollama is optional.

Correlate recent changes, deployments, metrics, logs, Kubernetes events, Git history, dependencies and historical incidents.

Generate evidence-backed root-cause analysis.

## Historical Intelligence

Status: Implemented

Phase 10 provides bounded deterministic historical intelligence over persisted changes, analyses, observations, comparisons, security findings, dependency relationships, and remediations. It calculates explainable similarity, evidence-backed outcomes, recurring patterns, risk trends, prediction accuracy, prediction bias, remediation performance, and proactive insight status.

Missing history or observations return `insufficient_evidence`; historical associations do not establish causation and do not create current SecurityFindings. The AI context receives only bounded summaries and source evidence IDs.

## Kubernetes Integration

Status: Implemented

Phase 13 provides an authenticated, read-only Kubernetes API adapter. It checks API version connectivity, lists namespaces, previews bounded Deployments, StatefulSets, and DaemonSets, and imports normalized workload observations through the existing Resource, Evidence, and Change services.

Collected data is limited to namespace, workload identity, kind, bounded labels/annotations, images, replica/readiness state, rollout metadata, selected conditions, and observation time. The first observation creates Evidence without inventing a before-state. Later changed observations create normalized Kubernetes Changes; repeated unchanged observations are idempotent.

Kubernetes tokens remain server-side and are never logged or returned. Raw objects, secrets, service-account credentials, environment values, kubectl operations, and cluster mutations are deliberately excluded.

## Prometheus and Loki Observability

Status: Implemented

Phase 14 provides optional, authenticated, read-only Prometheus and Loki integrations. Prometheus supplies bounded metric query previews and metric Evidence; Loki supplies bounded LogQL range previews and redacted log Evidence. Both can be imported against an existing ChangeLens resource through the combined observability endpoint.

Queries, result sizes, labels, messages, response bodies, and Loki time ranges are bounded. Repeated identical observations are idempotent. Metric or log changes do not automatically create Changes, deployment IDs, or causal claims. Tokens remain server-side, and alert/rule/configuration changes, deletion, arbitrary proxying, and other write operations are excluded.

## End-to-End Change Intelligence

Status: Implemented

Phase 15 connects the existing lifecycle through one orchestration service: Change, Evidence, dependency impact, deterministic risk, Prediction Snapshot, observability-backed reality, Prediction vs Reality, optional AI Investigation, Historical Intelligence, and remediation recommendation context.

`POST /api/intelligence/changes/:changeId/analyze` performs deterministic analysis and creates or reuses a prediction snapshot. `POST /api/intelligence/changes/:changeId/evaluate` evaluates the available evidence with insufficient-evidence semantics and reuses prior observation/comparison records. `GET /api/intelligence/changes/:changeId` returns the consolidated view. AI is bounded and optional; no deployment, rollback, shell execution, or automatic remediation is performed.

## Production Change Intelligence Dashboard

Status: Implemented

Phase 16 makes the authenticated landing page an operational Dashboard with bounded change health, risk distribution, recent changes, integration/AI status, and recent prediction-versus-reality outcomes. The Changes explorer supports search, source/type/status/resource filters, pagination, and direct navigation into the consolidated Phase 15 intelligence detail.

The detail view distinguishes deterministic risk and dependency impact, PREDICTED state, OBSERVED reality, prediction comparison outcome, AI inference, historical learning, and recommendation-only next actions. It shows unavailable or insufficient states explicitly and does not add polling, production mutation, automatic remediation, or a charting dependency.

## Security Intelligence

Status: Implemented

Phase 8 stores structured, evidence-backed security findings with validated Change, Resource, and Evidence references. Findings support dependency, container, Terraform, Kubernetes, CI/CD, configuration, code, secret-exposure, and misconfiguration categories without running scanners or external commands.

Security findings are normalized deterministically, deduplicated by a stable fingerprint, filtered and paginated through the API, summarized by severity/category, and added to Change risk through a capped deterministic contribution. Dependency traversal is bounded to the existing depth-10 graph semantics: security findings belong to the evidenced resource; dependent resources are only potentially affected by the relationship and are not claimed to be vulnerable.

Security findings are carried through Prediction vs Reality as predicted fingerprints, observed evidence-backed findings, and deterministic `confirmed`, `unexpected`, or `insufficient_evidence` outcomes. Missing security evidence never means that no vulnerability exists.

AI investigation context includes only bounded finding fields, evidence IDs, confidence, optional CVE/CWE values, and potential dependency blast-radius facts. Secret findings store only redacted metadata and evidence references. AI remains an optional explanation layer and cannot alter finding fields, evidence, affected resources, or risk scores. The frontend distinguishes SECURITY FINDING from POTENTIAL BLAST RADIUS and states: "Potentially affected by dependency relationship." Automatic remediation, scanner execution, cloud/API integrations, and secret rotation remain out of scope for Phase 8.

## Remediation

Status: Implemented

Phase 9 provides controlled, evidence-backed remediation proposals with structured allowlisted actions, deterministic lifecycle transitions, remediation risk, rollback representations, schema validation, prepared PR information without GitHub API calls, explicit human approval, dry-run execution, evidence-required verification, and audit history.

The dry-run executor never invokes a shell, script, kubectl, Terraform, Docker, cloud API, or credential operation. Missing verification evidence produces insufficient evidence rather than success. AI may explain or suggest a proposal, but deterministic validation, risk, approval, and execution policy remain authoritative.

## Historical Learning and Intelligence Accuracy

Status: Implemented

Phase 17 persists normalized historical outcomes after completed Prediction → Reality → Comparison evaluations. Each outcome includes bounded prediction/reality summaries, outcome classification, evidence quality, affected resources, versioned accuracy dimensions, and evidence references.

Accuracy version `1.0` averages available outcome, impact, resource, and failure-mode dimensions. `N/A` dimensions do not become zero, and insufficient evidence is not scored. Deterministic Phase 10 similarity uses resource, change type, environment, impact, paths, size, and dependency characteristics. Future risk receives a bounded, visible historical contribution only when sufficient comparable outcomes exist; no-history is neutral. AI does not alter historical accuracy or risk.

## Production Hardening

Status: Planned

Eventually include authentication, RBAC, audit logging, secure secrets, rate limiting, CI/CD, monitoring and containerized deployment.
