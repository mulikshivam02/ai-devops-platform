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

Status: Planned

Deterministically calculate change risk using:
- change size
- environment
- resource criticality
- dependency count
- blast radius
- security sensitivity
- historical failures
- rollback availability

## Impact Prediction

Status: Planned

Predict possible latency changes, error-rate changes, CPU changes, memory changes, availability impact, affected services and failure modes.

## Prediction vs Reality

Status: Implemented

Phase 6 snapshots Phase 5 predictions, derives observations only from relevant structured Evidence within a maximum seven-day window, and compares impact categories, resources, metrics, blast radius, severity, and accuracy. Missing evidence is reported as insufficient evidence rather than no impact. No external collectors or execution are included.

## Incident Intelligence

Status: Implemented

Phase 7 provides an optional evidence-backed AI reasoning layer with replaceable providers, bounded deterministic context, structured response validation, persisted investigations, RCA hypotheses, and advisory recommendations. AI remains non-authoritative and Ollama is optional.

Correlate recent changes, deployments, metrics, logs, Kubernetes events, Git history, dependencies and historical incidents.

Generate evidence-backed root-cause analysis.

## Historical Intelligence

Status: Planned

Store changes, predictions, deployments, observed impact, incidents, root causes, remediation and verification.

Use history to improve future analysis.

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

## Production Hardening

Status: Planned

Eventually include authentication, RBAC, audit logging, secure secrets, rate limiting, CI/CD, monitoring and containerized deployment.
