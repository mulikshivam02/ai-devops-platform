# Architecture Decisions

## ADR-001 - Modular Monolith

Status: Accepted

### Decision

The initial platform will use a modular monolith.

### Reason

The project is being developed incrementally and does not initially require distributed infrastructure.

This keeps development, testing and deployment simpler.

Microservices can be considered later if there is a demonstrated need.

## ADR-002 - Evidence-First AI

Status: Accepted

### Decision

AI reasoning must operate on evidence collected from authoritative DevOps systems.

### Reason

LLMs can hallucinate infrastructure state.

The platform must use real data from GitHub, Kubernetes, Terraform, Prometheus and Loki.

AI is responsible for reasoning and explanation, not establishing infrastructure facts.

## ADR-003 - Deterministic Risk Engine

Status: Accepted

### Decision

Risk scoring will be deterministic.

### Reason

Risk must be explainable and reproducible.

AI may explain risk but must not arbitrarily determine the numeric score.

## ADR-004 - Local AI First

Status: Accepted

### Decision

Initial AI integration will use Ollama with a local Llama-family model.

### Reason

This allows development without depending on a paid external AI API and keeps the AI provider replaceable.

## ADR-005 - Human Approval for Risky Remediation

Status: Accepted

### Decision

Production-impacting or destructive remediation requires explicit human approval.

### Reason

An AI system must not have unrestricted production control.

The remediation workflow is:

Recommend -> Validate -> Approve -> Execute -> Verify

## ADR-006 - Repository Name

Status: Accepted

### Decision

The repository/folder remains:

ai-devops-platform

### Reason

The repository name is independent from the product concept.

The product is called ChangeLens, but the existing repository name must not be changed.
