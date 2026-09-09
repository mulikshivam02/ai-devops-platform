# Architecture Decisions

## ADR-001 - Modular Monolith

Status: Accepted

### Decision

The initial platform will use a modular monolith.

### Reason

The project is being developed incrementally and does not initially require distributed infrastructure.

This keeps development, testing and deployment simpler.

Microservices can be considered later if there is a demonstrated need.

## ADR-010 - Deterministic Change Intelligence

Status: Accepted

### Decision

Phase 5 persists one latest deterministic analysis per Change. Changed items are normalized from recorded before/after data or explicit metadata paths, affected resources come from the Change resource and Phase 4 graph, and risk is calculated by a pure weighted engine with scores from 0 to 100.

Blast-radius `directCount` excludes the primary changed resource, `transitiveCount` contains unique graph-expanded resources, and `totalCount` includes the primary resource plus all unique direct and transitive resources. Analysis describes potential impact only; it does not claim an outage or execute remediation.

### Reason

Change Intelligence must remain reproducible and evidence-backed before AI reasoning, live collectors, prediction validation, or remediation are introduced.

## ADR-009 - Explicit Dependency Graph Direction

Status: Accepted

### Decision

Dependency edges use `sourceResourceId -> targetResourceId`. For `depends_on`, A -> B means A depends on B. Dependency traversal follows outgoing edges; dependent traversal follows incoming edges. Graph traversal is bounded to a maximum depth of 10 and uses visited-resource tracking for cycles.

### Reason

Explicit direction makes graph behavior deterministic and prevents ambiguous impact traversal. Relationships are manually or evidence supplied; no AI or automatic inference creates graph edges.

## ADR-008 - Evidence and Change History Foundations

Status: Accepted

### Decision

Phase 3 stores observed evidence and manually supplied change history as separate MongoDB records. Evidence and changes reference resources by ID, and changes reference evidence by ID without duplicating evidence documents.

Payloads and metadata are sanitized for obvious sensitive keys at write and response boundaries. This is a practical redaction layer, not a guarantee that arbitrary external data is perfectly safe.

### Reason

ChangeLens needs a durable, deterministic record of observations before collectors, analysis, prediction, or AI reasoning are introduced.

## ADR-007 - Resource Center Records

Status: Accepted

### Decision

Phase 2 stores normalized resource records in MongoDB and allows them to be managed manually through the REST API and frontend.

Resource status is explicit and defaults to `unknown`; creating a record does not claim that ChangeLens is connected to the external system.

### Reason

The Resource Center needs a stable domain contract before external collectors are introduced. Keeping integrations out of this phase avoids inventing connectivity or infrastructure state.

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
