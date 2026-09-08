# Features

## Status Legend

- Planned
- In Progress
- Implemented

## Resource Center

Status: Planned

Discover and normalize:
- GitHub
- Kubernetes
- Terraform
- Docker
- Prometheus
- Loki

Resources include repositories, pull requests, commits, workflows, deployments, services, pods, namespaces, Terraform resources, infrastructure resources, metrics and logs.

## Evidence Engine

Status: Planned

Collect and normalize evidence from external systems.

Evidence should contain:
- source
- resource
- type
- timestamp
- value
- metadata

## Dependency Graph

Status: Planned

Build relationships between services, deployments, pods, containers, databases, infrastructure and Git changes.

Use the graph for dependency visualization, blast radius and impact analysis.

## Change Intelligence

Status: Planned

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

Status: Planned

Compare predicted impact with actual impact and detect unexpected deviations.

## Incident Intelligence

Status: Planned

Correlate recent changes, deployments, metrics, logs, Kubernetes events, Git history, dependencies and historical incidents.

Generate evidence-backed root-cause analysis.

## Historical Intelligence

Status: Planned

Store changes, predictions, deployments, observed impact, incidents, root causes, remediation and verification.

Use history to improve future analysis.

## Security Intelligence

Status: Planned

Analyze dependencies, secrets, Docker, Terraform, Kubernetes, CI/CD and repositories.

Security results should influence change risk.

## Remediation

Status: Planned

Detect -> Analyze -> Recommend -> Generate Fix -> Validate -> Create PR -> Human Approval -> Execute -> Verify

## Production Hardening

Status: Planned

Eventually include authentication, RBAC, audit logging, secure secrets, rate limiting, CI/CD, monitoring and containerized deployment.
