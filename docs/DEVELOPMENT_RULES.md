# Development Rules

## General

1. Work incrementally.
2. Complete the current phase before starting the next.
3. Do not rewrite working code unnecessarily.
4. Keep modules small.
5. Avoid unnecessary dependencies.
6. Prefer maintainable solutions over clever solutions.

## Backend

- Keep routes thin.
- Keep controllers focused on HTTP.
- Put business logic in services.
- Put deterministic domain calculations in engines.
- Keep external integrations inside collectors/services.
- Validate external input.
- Use centralized error handling.
- Do not expose internal errors directly.

## Frontend

- Use TypeScript.
- Keep API calls separate from UI components.
- Do not duplicate backend business logic.
- Handle loading, error, empty and success states.
- Build reusable components.

## TypeScript

- Use strict mode.
- Avoid any.
- Prefer explicit types.
- Avoid unsafe assertions.
- Keep functions focused.

## Database

- Use Mongoose schemas.
- Centralize database connection.
- Use timestamps where appropriate.
- Do not store unnecessary duplicated information.

## AI

- AI is not the source of truth.
- Provide structured evidence to the model.
- Never send secrets.
- Keep the provider replaceable.
- Prefer structured AI responses.
- AI recommendations must be distinguishable from verified facts.
- The Ollama provider is optional and configured through OLLAMA_BASE_URL, OLLAMA_MODEL, OLLAMA_TIMEOUT_MS and AI_PROVIDER.
- AI output must be parsed as structured JSON, stripped only of safe wrapper text such as a single `<think>` block or markdown fence around the JSON payload, and then validated before persistence.
- Evidence IDs are strict allowlists and validation rejects any unknown or duplicated IDs.
- Investigations never execute shell commands, production actions, or destructive actions; recommendations remain advisory and require human approval.
- Mock provider output is the default test path when the AI provider is intentionally disabled in CI.

## Security

Never commit passwords, API keys, tokens, certificates, private keys or .env files.

Never expose credentials to the frontend.

## Git

Use meaningful commits.

Examples:
- feat: add health endpoint
- feat: add resource model
- fix: handle database connection failure
- docs: define architecture
- refactor: separate resource service
- test: add health endpoint tests

Do not commit generated files unless explicitly required.

## Testing

Every meaningful backend feature should eventually have tests.

At minimum verify:
- successful behavior
- validation failure
- expected error behavior
- external dependency failure where practical

## Documentation

When architecture changes:
1. Update the relevant documentation.
2. Update DECISIONS.md.
3. Keep implementation and documentation consistent.

Never claim an unimplemented feature is implemented.

## Kubernetes Integration

- Kubernetes integration is strictly read-only. Do not add apply, patch, delete, create, exec, or shell execution paths.
- Keep Kubernetes tokens server-side; never log or return tokens, authorization headers, secret values, environment variable values, or raw Kubernetes objects.
- Require an existing ChangeLens `resourceId` for imports. Do not create resources automatically.
- Bound namespaces, workloads, labels, annotations, images, response sizes, and request timeouts.
- Normalize observations through the existing Evidence and Change services. Do not create a parallel change pipeline.

## Observability Integration

- Prometheus and Loki queries use configured server URLs only; never accept a base URL or arbitrary HTTP method from a request.
- Prometheus metrics and Loki logs are observations. Do not create Changes or causal deployment claims from signal variation alone.
- Bound PromQL/LogQL length, result counts, response sizes, label/message lengths, and Loki time ranges.
- Redact obvious bearer tokens, API keys, passwords, secrets, and token-bearing labels/messages before response or persistence.

## End-to-End Intelligence

- Compose existing services through the Phase 15 orchestrator; do not create a second Change, Evidence, prediction, reality, or historical pipeline.
- Deterministic analysis and persisted evidence are authoritative. AI context must be bounded and AI conclusions must remain identifiable as inference or hypothesis.
- Optional external integrations and AI must degrade gracefully; missing evidence means `insufficient_evidence`, never an invented outcome.
- Repeated analyze/evaluate requests must reuse existing prediction, observation, comparison, and evidence records.
- The orchestration layer may expose remediation recommendations only. It must never execute shell commands, deployments, rollbacks, kubectl operations, or production mutations.

## Historical Learning

- Persist historical outcomes only after actual Prediction vs Reality evaluation; never fabricate training data.
- Keep historical outcomes bounded and normalized. Never persist tokens, credentials, raw Authorization headers, unrestricted logs, or complete external responses.
- Accuracy must be versioned and dimension-based. Unavailable dimensions are `null`/`N/A`, not zero.
- `insufficient_evidence` is not a failure and must not receive a fabricated accuracy score.
- Historical risk is a bounded explainable contributor; no-history remains neutral and deterministic current analysis remains authoritative.
