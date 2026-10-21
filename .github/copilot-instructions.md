# AI DevOps Platform - Copilot Instructions

## Project Identity

Product name: ChangeLens

Repository name: ai-devops-platform

The repository name must not be changed.

ChangeLens is an AI-powered DevOps change intelligence platform.

Its purpose is to understand software and infrastructure changes, predict their impact, observe what actually happens after deployment, compare predictions with reality, investigate incidents using evidence, learn from historical changes, and safely assist with remediation.

Core product loop:

Change -> Understand -> Predict -> Deploy -> Observe -> Compare -> Explain -> Learn -> Safely Remediate

## Technology Stack

### Frontend
- React
- TypeScript
- Vite

### Backend
- Node.js
- Express
- TypeScript
- ES Modules / NodeNext

### Database
- MongoDB
- Mongoose

### AI
Initial local AI:
- Ollama
- Llama-family model

The AI provider must be replaceable through an abstraction layer.

### DevOps Integrations
These will be implemented progressively:
- GitHub
- Kubernetes
- Terraform
- Docker
- Prometheus
- Loki

## Architecture

Use a modular monolith initially.

Do not introduce microservices, Kafka, Redis, queues, or distributed infrastructure unless a later documented architecture decision requires them.

Backend structure:

server/src/
- config/
- routes/
- controllers/
- services/
- models/
- collectors/
- analyzers/
- engines/
- ai/
- remediation/
- middleware/
- utils/
- server.ts

Responsibilities:
- config: environment and application configuration.
- routes: HTTP route definitions.
- controllers: HTTP request and response handling.
- services: application workflows and business logic.
- models: Mongoose database models.
- collectors: data collection from external DevOps systems.
- analyzers: analysis of structured collected data.
- engines: deterministic domain calculations.
- ai: LLM abstraction, context building, reasoning and explanation.
- remediation: safe remediation workflows.
- middleware: validation, authentication, errors and HTTP middleware.
- utils: small reusable utilities.

## Evidence-First Principle

External DevOps systems are the source of truth.

- GitHub is authoritative for repository, commit and pull-request information.
- Kubernetes is authoritative for workload and cluster state.
- Terraform provides infrastructure configuration and plan information.
- Prometheus provides metric information.
- Loki provides log information.
- MongoDB stores normalized platform history.

The AI must never invent infrastructure state.

AI reasoning must be based on structured evidence collected by the platform.

## Deterministic Logic vs AI

Use deterministic code for:
- resource discovery
- data validation
- dependency extraction
- dependency graph construction
- blast-radius calculation
- risk scoring
- metric calculations
- threshold calculations
- prediction-vs-reality calculations
- authorization
- remediation safety checks

Use AI for:
- semantic interpretation
- natural-language explanations
- hypothesis generation
- incident reasoning
- root-cause explanation
- historical similarity interpretation
- recommendation generation
- summarization

Do not use AI where deterministic logic is more reliable.

AI must never override verified system state.

## Resource Center

The platform will eventually discover and normalize:
- GitHub repositories
- GitHub commits
- GitHub pull requests
- GitHub workflows
- Kubernetes clusters
- Kubernetes namespaces
- Kubernetes deployments
- Kubernetes services
- Kubernetes pods
- Terraform configuration
- Terraform plans
- Docker resources
- Prometheus metrics
- Loki logs

Do not implement all integrations during the foundation phase.

## Evidence Engine

The Evidence Engine collects and normalizes facts.

Evidence should contain:
- source
- resource
- type
- timestamp
- value
- metadata
- confidence when applicable

Evidence must be traceable to its original source.

AI reasoning should reference evidence rather than arbitrary raw environment data.

## Dependency Graph

The platform will build a dependency graph from discovered evidence.

Examples:
- service -> deployment -> pods -> container
- service -> database
- deployment -> Git commit
- Terraform resource -> infrastructure resource

The graph must be based on actual collected information.

Do not allow the AI to invent dependency relationships.

## Change Intelligence

Change Intelligence is the central product capability.

The system will eventually analyze:
- Git commits
- GitHub pull requests
- Terraform plans
- Terraform configuration changes
- Kubernetes manifest changes
- deployment changes
- configuration changes

For each change, determine:
- what changed
- affected resources
- dependency impact
- blast radius
- risk
- historical similarity
- rollback availability
- predicted impact

## Risk Engine

Risk scoring must be deterministic.

Potential risk factors:
- change size
- environment
- affected resources
- dependency count
- blast radius
- resource criticality
- security sensitivity
- historical failure rate
- rollback availability

The exact scoring formula must be documented before implementation.

AI can explain the risk score.

AI must not arbitrarily invent the numeric risk score.

## Impact Prediction

Before deployment, the platform should eventually predict:
- latency impact
- error-rate impact
- CPU impact
- memory impact
- availability impact
- affected services
- possible failure modes

Predictions should contain:
- prediction
- evidence
- confidence
- expected direction
- expected magnitude when available

Predictions are hypotheses, not facts.

## Prediction vs Reality

This is a core product feature.

After deployment:
1. Capture actual system state.
2. Collect metrics, logs and events.
3. Establish the relevant baseline.
4. Compare actual behavior with predictions.
5. Calculate deviations.
6. Identify unexpected effects.
7. Store the result in history.

Example:
- Predicted latency: +5%
- Actual latency: +38%
- Deviation: +33 percentage points

The system should explain why reality differed from the prediction using evidence.

## Historical Intelligence

Store historical information about:
- changes
- predictions
- deployments
- observed impact
- incidents
- root causes
- recommendations
- remediation
- verification

Future changes should be compared against previous changes and incidents.

Historical claims must always be based on stored evidence.

## AI Architecture

Use an AI abstraction.

Application -> Context Builder -> Evidence Selection -> AI Provider Interface -> Ollama / Local LLM -> Structured Result

Do not allow random application code to call Ollama directly.

Never send secrets to the LLM.

Never send unnecessary environment data.

Prefer focused structured context.

AI responses should preferably be structured.

## Incident Intelligence

When an incident occurs, correlate:
- recent changes
- deployments
- Git history
- Kubernetes state
- Kubernetes events
- logs
- metrics
- dependency graph
- historical incidents

The system should produce:
- incident summary
- timeline
- suspected root cause
- supporting evidence
- affected resources
- impact
- confidence
- recommendation

Root-cause conclusions must be evidence-backed.

## Remediation Safety

Never implement:

AI -> unrestricted shell -> production

Use:

Detect -> Analyze -> Recommend -> Generate Fix -> Validate -> Create PR -> Human Approval -> Execute -> Verify

Destructive or production-impacting actions require explicit human approval.

Every remediation action must be auditable.

Verification must confirm whether remediation actually improved the system.

## Security

Eventually cover:
- repository security
- dependency vulnerabilities
- secrets
- Docker security
- Terraform/IaC security
- Kubernetes security
- CI/CD security

Security findings should integrate with change risk and blast-radius analysis.

Never expose secrets in:
- logs
- API responses
- prompts
- frontend output
- Git commits

## API Rules

Use versioned APIs:

/api/v1/...

Validate external input.

Use consistent response structures.

Use appropriate HTTP status codes.

Do not expose internal errors directly to users.

Keep routes thin.

Keep controllers focused on HTTP concerns.

Put business logic in services and engines.

## Database Rules

Use MongoDB with Mongoose.

Use schemas for persistent domain objects.

Use timestamps where appropriate.

Centralize the database connection.

Application startup must handle database connection failures properly.

Do not silently continue when required infrastructure is unavailable.

## Error Handling

Errors must be explicit and actionable.

Do not silently swallow errors.

Avoid empty catch blocks.

Use centralized error handling where appropriate.

External integration failures should provide useful context without leaking secrets.

## TypeScript Rules

Use strict TypeScript.

Avoid `any` unless absolutely necessary.

Prefer interfaces and types for domain objects.

Do not use unsafe type assertions to hide problems.

Keep functions focused.

Prefer small reusable modules.

## Frontend Rules

The frontend consumes backend APIs.

Never put DevOps credentials in frontend code.

Do not duplicate backend business logic in React.

Create reusable components.

Keep API calls in dedicated client/service modules.

Handle loading, error, empty and success states properly.

## Development Phases

### Phase 1 - Foundation

Implement only:
- project structure
- React + TypeScript + Vite
- Express + TypeScript
- MongoDB/Mongoose
- environment configuration
- health API
- basic frontend shell
- API client foundation
- linting
- formatting
- Git configuration
- documentation

Do not implement external DevOps integrations or AI during Phase 1.

### Phase 2 - Resource Center

Implement:
- resource model
- GitHub discovery
- Kubernetes discovery
- Terraform discovery
- Prometheus connection
- Loki connection
- normalized resources

### Phase 3 - Evidence and History

Implement:
- evidence model
- evidence collection
- normalization
- history
- audit records
- timelines

### Phase 4 - Dependency Graph

Implement:
- relationship extraction
- graph representation
- dependency visualization
- blast-radius calculation

### Phase 5 - Change Intelligence

Implement:
- Git diff analysis
- pull-request analysis
- Terraform plan analysis
- Kubernetes change analysis
- change classification
- deterministic risk engine
- impact prediction

### Phase 6 - Prediction vs Reality

Implement:
- deployment tracking
- baseline collection
- metric comparison
- log correlation
- event correlation
- prediction-vs-reality analysis

### Phase 7 - AI and RCA

Implement:
- Ollama integration
- AI abstraction
- context builder
- evidence-aware prompts
- RCA
- explanations
- confidence

### Phase 8 - Security

Implement:
- repository security
- dependency security
- secret detection
- Docker security
- Terraform security
- Kubernetes security
- CI/CD security

### Phase 9 - Remediation

Implement:
- recommendations
- fix generation
- validation
- pull-request creation
- approval
- controlled execution
- verification
- audit trail

### Phase 10 - Advanced Intelligence

Implement:
- historical similarity
- recurring failure detection
- change-risk learning
- improved impact prediction
- pattern detection

### Phase 11 - Production Hardening

Implement:
- authentication
- RBAC
- secure secret handling
- rate limiting
- audit hardening
- Docker deployment
- CI/CD
- application monitoring

## Current Phase Rule

Always work only on the current phase.

During Phase 1, do not implement:
- GitHub integration
- Kubernetes integration
- Terraform integration
- Prometheus integration
- Loki integration
- security scanners
- dependency graph
- change analysis
- risk engine
- impact prediction
- deployment analysis
- RCA
- Ollama
- Llama
- remediation
- authentication
- RBAC
- cloud integrations
- Redis
- Kafka
- queues
- microservices
- vector databases
- multi-agent systems

## Git Rules

Use meaningful commits.

Examples:
- feat: add health endpoint
- feat: add resource model
- fix: handle database connection failure
- docs: define architecture
- refactor: separate resource service
- test: add health endpoint tests

Never commit:
- .env
- secrets
- API keys
- tokens
- credentials
- private keys
- unnecessary generated files

## Documentation Rules

When implementation changes architecture:
1. Update the relevant documentation.
2. Update DECISIONS.md if it is an architectural decision.
3. Keep documentation consistent with implementation.

Do not document unimplemented functionality as implemented.

Use Planned, In Progress, or Implemented for feature status.

## Copilot Behavior

Before modifying code:
1. Inspect the existing project structure.
2. Read relevant documentation.
3. Understand the current implementation.
4. Identify dependencies.
5. Make the smallest correct change.

Do not delete working functionality unless explicitly requested.

Do not rewrite unrelated files.

Do not introduce dependencies without justification.

After changes:
1. Run relevant checks.
2. Fix errors.
3. Report what changed.
4. Report validation results.

Prefer incremental implementation over large uncontrolled rewrites.

## Quality Principles

Correctness > complexity

Evidence > assumptions

Deterministic logic > unnecessary AI

Small modules > giant files

Explicit errors > silent failures

Safe automation > unrestricted automation

Real DevOps data > mocked AI claims

The final platform must provide genuine DevOps intelligence rather than simply wrapping an LLM in a dashboard.
