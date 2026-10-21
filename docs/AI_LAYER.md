# AI layer

How an investigation runs, and where each safeguard lives. Limits and residual risk are in
[LIMITATIONS.md](./LIMITATIONS.md).

1. **Context** — `ai/contextBuilder.ts` gathers the change, its linked evidence (always included),
   recent resource evidence (fills the remaining 40 slots), analysis, prediction/observation/comparison,
   security findings and historical intelligence. Dependency traversals run once per distinct root with
   bounded concurrency. Failed lookups are recorded in `historicalIntelligence.lookupErrors`.
2. **Prompt** — `ai/promptBuilder.ts` returns `{ system, user }`. `system` is the contract; `user` is the
   fenced, neutralised data. `promptVersion` is stored with every investigation (`2.0`).
3. **Provider** — `ai/provider.ts` returns a cached provider chosen by `AI_PROVIDER` (`ollama` | `mock`,
   validated at startup). Ollama is called on `/api/chat` with `format: investigationResultSchema`,
   `temperature: 0`, and `OLLAMA_TIMEOUT_MS`. `provider.model` is what gets stored on the record.
4. **Validation** — `ai/responseValidator.ts` checks the shape, drops unknown evidence IDs, forces
   `safe=false` on commands/destructive wording, and caps lengths. Problems are appended to `limitations`.
5. **Persistence** — `services/investigationService.ts` reuses the context from step 1. Provider failures
   map to `503` and validation failures to `502` (never `401`, which would sign the browser out); the
   original error is kept as `cause` and logged. A failed attempt is recorded, but a failure to record it
   never replaces the error the caller sees.

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `AI_PROVIDER` | `ollama` | `ollama` or `mock`; anything else fails at startup. |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | |
| `OLLAMA_MODEL` | `llama3.2` | Recorded on each investigation via `provider.model`. |
| `OLLAMA_TIMEOUT_MS` | `120000` | Per-request abort. |

## Error codes stored on failed investigations

`AI_UNAVAILABLE`, `AI_MODEL_UNAVAILABLE`, `AI_PROVIDER_ERROR`, `AI_INVALID_RESPONSE`, `AI_INVALID_JSON`
(provider); `AI_INVALID_RESPONSE` (validator, `502`); `AI_UNEXPECTED_ERROR` (anything else, `502`, with
`cause`).
