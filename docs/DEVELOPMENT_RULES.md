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
