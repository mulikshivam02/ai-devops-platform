# Architecture Decisions

## ADR-001 - Modular Monolith

Status: Accepted

### Decision

The initial platform will use a modular monolith.

### Reason

The project is being developed incrementally and does not initially require distributed infrastructure.

This keeps development, testing and deployment simpler.

Microservices can be considered later if there is a demonstrated need.

## ADR-012 - Evidence-Backed AI Provider Boundary

Status: Accepted

### Decision

Phase 7 uses a replaceable AI provider interface behind a deterministic bounded context builder and strict structured-response validator. Ollama is optional and accessed only over HTTP; MongoDB/server startup does not depend on it. Failed or unavailable provider calls persist failed investigation state and never fabricate an RCA.

AI may explain supplied facts, generate hypotheses, and offer advisory recommendations, but deterministic ChangeLens resources, dependencies, risk, blast radius, evidence, and prediction comparisons remain authoritative.

### Reason

The AI layer must remain evidence-backed, bounded, replaceable, and safe before future remediation or advanced intelligence phases.

## ADR-011 - Prediction Versus Reality Semantics

Status: Accepted

### Decision

Phase 6 stores immutable prediction snapshots, derives bounded observations exclusively from relevant structured Evidence, and compares them deterministically. Missing evidence never becomes evidence of no impact; comparisons use unknown or insufficient-evidence semantics instead.

Observation windows must be valid and no longer than seven days. Metric deltas are calculated as observed minus baseline, with a small deterministic noise threshold for unchanged values. Accuracy averages only dimensions with comparable data.

### Reason

ChangeLens must distinguish hypotheses from observed facts and avoid overstating system behavior before live collectors exist.

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

## ADR-013 - Evidence-First Security Findings

Status: Accepted

### Decision

Phase 8 represents security observations as normalized `SecurityFinding` records. Findings reference existing Evidence, Change, and Resource records rather than duplicating payloads. Missing source fields remain `unknown` or omitted; the platform never invents a CVE, severity, version, location, or remediation version.

Duplicate findings use a stable fingerprint and a unique database index. Security severity weights are deterministic, deduplicated, and capped before being added to the existing 0-100 Change risk calculation. Dependency traversal uses the existing bounded graph and describes downstream resources as potentially affected, not vulnerable.

### Reason

Security analysis must remain reproducible and passive before real scanners and controlled remediation are introduced. AI may explain verified findings but cannot create or modify security facts.

## ADR-014 - Controlled Remediation and Dry Run

Status: Accepted

### Decision

Phase 9 persists remediation proposals as structured, allowlisted actions and moves them through a deterministic state machine. High-risk or production remediation requires explicit human approval. PR preparation is local structured data only; no GitHub API is called. The only execution implementation is a clearly marked dry-run executor that performs no host or external-system mutation. Verification requires separate observed Evidence and treats missing evidence as insufficient evidence.

### Reason

ChangeLens must assist with remediation while preventing AI or API callers from obtaining unrestricted production control. Every lifecycle event is auditable and deterministic policy remains authoritative.

## ADR-015 - Deterministic Historical Intelligence

Status: Accepted

### Decision

Phase 10 derives historical outcomes, similarity, trends, prediction accuracy, bias, patterns, and insights from existing persisted Phase 1-9 records. Results are bounded, explainable, and carry sample size, confidence, limitations, and evidence references. Historical associations never create current security findings or assert causation.

### Reason

ChangeLens needs operational memory without opaque machine learning or unsupported claims. Deterministic analytics provide reproducible context that AI can explain but cannot override.

## ADR-016 - Structured Qwen3/Ollama Investigation Output

Status: Accepted

### Decision

Investigation requests use a strict prompt schema, structured JSON output from the configured Ollama model, and a safety parser that strips only wrapper text such as Qwen3 reasoning blocks or markdown fences while preserving otherwise valid JSON. The provider parses the raw model response, normalizes one clear JSON object, and passes it to the validator before the investigation is persisted.

The validator enforces the same contract used by the TypeScript interfaces: integer confidence values from 0 to 100, evidence IDs restricted to the supplied allowlist, reasoning type enums, recommendation safety checks, and no untrusted IDs from the model. Errors are surfaced as controlled AppError codes such as AI_INVALID_JSON or AI_VALIDATION_ERROR instead of silently accepting malformed output.

### Reason

Qwen3 may emit reasoning text, markdown fences, or surrounding prose alongside valid JSON. A robust parser and strict validator keep the AI layer bounded, evidence-grounded, and safe without weakening the system's security boundary.

## ADR-006 - Repository Name

Status: Accepted

### Decision

The repository/folder remains:

ai-devops-platform

## ADR-017 - Kubernetes Read-Only Observation Adapter

Status: Accepted

### Decision

Phase 13 connects ChangeLens to an optional Kubernetes HTTP API using native server-side fetch. Only API version, namespaces, Deployments, StatefulSets, and DaemonSets are read. Workload state is bounded and normalized into existing Kubernetes Evidence records. A first observation does not create a Change; subsequent meaningful differences create an infrastructure, deployment, or configuration Change with explicit before/after snapshots. Repeated identical observations are idempotent.

Kubernetes access requires an existing ChangeLens resource ID for imports. Tokens are optional, remain server-side, and are never persisted, logged, or returned. No Kubernetes mutation, kubectl execution, secret retrieval, or raw object persistence is permitted.

### Reason

Kubernetes is an authoritative source for workload state, but Phase 13 must observe safely without introducing write operations or a second normalization pipeline.

## ADR-018 - Read-Only Prometheus and Loki Evidence

Status: Accepted

### Decision

Phase 14 accesses only the configured Prometheus query API and Loki query-range API using bounded native HTTP GET requests. Prometheus results become metric Evidence and Loki results become redacted log Evidence attached to an existing resource. Combined imports require operator/admin authorization, use stable correlation IDs, and do not create Changes from metric or log variation alone.

Tokens are optional server-side configuration and are never logged, returned, or persisted. Query lengths, result counts, response sizes, log ranges, labels, and messages are bounded. Alerting, rule changes, log deletion, metric deletion, configuration changes, arbitrary proxying, and all other mutation operations remain out of scope.

### Reason

Observability data should enrich prediction, reality comparison, and RCA with authoritative evidence while avoiding unsupported causality and production mutation.

## ADR-019 - Single End-to-End Change Intelligence Orchestrator

Status: Accepted

### Decision

Phase 15 composes the existing Change, Evidence, dependency, deterministic Change Analysis/risk, Prediction Snapshot, Prediction vs Reality, Security Intelligence, AI Investigation, Historical Intelligence, and remediation recommendation services behind one `changeIntelligence` orchestration layer. Analyze and evaluate operations are operator/admin actions; the consolidated view is readable by authenticated viewers.

Prediction snapshots and reality comparisons are reused on repeated requests. Optional integrations and AI do not make the deterministic workflow fail when their evidence is unavailable. Observations are not automatically causal, and remediation remains recommendation-only and approval-controlled.

### Reason

The platform needs one coherent lifecycle without duplicating domain logic or granting the orchestration layer production mutation authority.

## ADR-020 - Deterministic Historical Outcome Feedback

Status: Accepted

### Decision

Phase 17 persists a bounded `HistoricalOutcome` after a completed Prediction vs Reality comparison. Accuracy version `1.0` averages only available outcome, impact, affected-resource, and failure-mode dimensions. Insufficient evidence leaves accuracy unavailable. Similarity reuses deterministic Phase 10 characteristics, and completed outcomes contribute at most 12 points to future risk only after at least two comparable outcomes. No-history is neutral.

### Reason

ChangeLens must learn from actual completed evaluations without introducing ML infrastructure, fabricating outcomes, or allowing historical association to override current deterministic evidence.

### Reason

The repository name is independent from the product concept.

The product is called ChangeLens, but the existing repository name must not be changed.
