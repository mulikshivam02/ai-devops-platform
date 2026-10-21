# Limitations

What ChangeLens does **not** do, or does only partly. This file starts with the AI layer (Phase 5)
and is extended as later phases land.

## AI investigation

### Prompt injection: reduced, not solved

The AI layer reads text that people outside ChangeLens control: commit messages, pull-request text,
Loki log lines, metric labels. Anyone who can commit code or write a log line can therefore put words
in front of the model. Natural language has no reliable boundary between data and instructions, so
this risk cannot be removed — only reduced.

What is in place (all in `server/src/ai/`):

| Defence | Where | What it buys |
| --- | --- | --- |
| Instructions and data travel in separate chat messages (`/api/chat` system vs user) | `ollamaProvider.ts`, `promptBuilder.ts` | Evidence can no longer sit in the same string as the contract. |
| Data is fenced with a per-request random delimiter and labelled untrusted | `promptBuilder.ts` | Evidence cannot name or close a fence that did not exist when it was written. |
| Instruction-like text is neutralised in the prompt's copy of the data (role tags, chat-template tokens, "ignore previous instructions", our own template headings, invisible characters) | `untrustedContent.ts` | Removes the obvious attacks. Stored evidence is never modified. |
| Output is constrained: JSON schema (`format`), strict validation, evidence-ID allow-list, `safe` forced to `false` for commands/destructive wording | `ollamaProvider.ts`, `responseValidator.ts` | A successful injection cannot invent evidence references or mark a command safe. |

**Residual risk.** A determined attacker can still phrase text the pattern list does not catch, and a
model can still be swayed by it. The realistic worst case is **misleading prose** in an investigation
summary, hypotheses or recommendations — not data exfiltration or action, because the AI layer has no
tools, cannot write to any system, and remediation is dry-run only. Treat AI output as inference support,
not operational fact; the UI says so. Do not feed it evidence from sources you do not at least partly trust
without that understanding.

The neutralisation list is a deny-list and will always be incomplete; it is not a security boundary.

### Other AI limits

- **Models are fallible.** Output is checked for shape and for evidence references, not for truth.
  Unrecognised evidence references are removed and reported in `limitations`; long strings and arrays are
  truncated (see `aiResponseLimits` in `responseValidator.ts`) and reported the same way.
- **The context is bounded.** At most 40 evidence records (the change's own linked evidence first), 10
  prior changes and 100 security findings reach the model. Larger histories are sampled, not summarised.
- **"Unknown" is distinct from "none".** If a history or dependency lookup fails, the context carries
  `historicalIntelligence.lookupErrors` and the change-intelligence result reports `degraded`/`error`
  instead of `insufficient_evidence`. The prompt tells the model to treat those sections as unknown.
- **Repair is best-effort.** If the model wraps its JSON in prose, the outermost JSON object is
  extracted (logged as `AI_JSON_REPAIR`). Two separate top-level objects are rejected as ambiguous.

## Frontend

- **The token is readable by page scripts.** It is kept in `sessionStorage`, so an XSS flaw could steal it.
  An httpOnly cookie with CSRF protection would remove that, at the cost of server-side session handling;
  this is not done. Mitigations: the app renders no raw HTML, and the token is per-tab and gone when the tab
  closes. It also means opening a link in a new tab requires signing in again.
- **UI role checks are advisory.** Controls are hidden by role, but a stale role in an open tab is only
  corrected on the next request that the server rejects (403 shows an error; 401 signs out).
- **No client-side cache.** Each page fetches on open and refetches on revisit. A data-fetching library
  (e.g. TanStack Query) would add caching and request de-duplication; it was deferred as a larger change.
- **Resource lists load fully.** `listResources` walks every page (100 per request, at most 50 pages), so
  deployments beyond 5,000 resources would see the list truncated in pickers.
