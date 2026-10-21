# Integration behaviour (GitHub, Kubernetes, Prometheus, Loki)

What each importer actually does, and where its limits are. Review references are to
`changelens-remediation-plan.md` Phase 4.

## Errors from upstream systems

An upstream auth failure is a **server configuration problem**, never a user-session problem.
The browser client signs the user out on any `401` from the ChangeLens API, so these map to `502`:

| Upstream | Code | Meaning |
|---|---|---|
| GitHub / Kubernetes / Prometheus / Loki `401` | `*_AUTH_FAILED` | the configured token was rejected |
| `403` | `*_FORBIDDEN` | the token is valid but lacks permission (Kubernetes: RBAC) |
| GitHub `403`/`429` with exhausted quota or `Retry-After` | `GITHUB_RATE_LIMIT` (429) | message says when to retry |
| `5xx`, including proxy HTML error pages | `*_UNAVAILABLE` | status is checked before the body is parsed |

## GitHub

- Commit size stats (`additions`/`deletions`/`changedFiles`) come from the per-commit endpoint,
  5 requests in flight. After a rate limit, remaining stats lookups are skipped; the commits are still imported.
- De-duplication is per resource: the same repo can be imported into several Resources.
- Incremental import asks only for commits newer than the latest one imported **for that resource and
  repository**. Pass `ref` (branch/tag/SHA) or `page` to walk history deliberately; `since` is then not used.
  The response has `hasMore` (GitHub's `Link: rel="next"`) and `page`.
- Commits GitHub reports without a date are skipped, never given a fabricated one.
- Limit: `since` filters on commit date, so a commit with an old author date that is pushed later
  (rebase, cherry-pick) is only reachable by paging.

## Kubernetes

- Reads Deployments, StatefulSets and DaemonSets, following `continue` tokens. One import reads up to
  200 per kind; kinds beyond that are listed in `truncatedKinds`.
- A **change** is a difference in: images, desired replicas, ready replicas, generation, labels,
  annotations. Condition text, `resourceVersion` and current/available/updated counts are kept in the
  Evidence payload but do not count as changes (they churn during every rollout).
- Each poll is compared with the latest observation, so reverts (A→B→A) are recorded. A change's id is
  `previous observation → new state`, so repeated flips are distinct and concurrent imports collapse to one.
- TLS: set `KUBERNETES_CA_CERT` (PEM text or path). Verification is never disabled.

## Prometheus

- Instant queries only. A range (matrix) result is counted in `skipped`. The import result reports
  `observed`, `skipped` and `truncated` (more than 50 series returned).
- Metric **comparison** (predicted vs observed direction) is not implemented: there is no pre-change
  baseline to compare against. See Phase 3.3 of the plan.

## Loki

- Time ranges up to 7 days (the Prediction-vs-Reality observation window). Ranges are read newest-first in
  24-hour chunks until the line limit is met, so a busy day costs one request and the worst case is 7.
- Timestamps are converted with `BigInt`; nanosecond precision is preserved in `timestampNs` and used in
  the de-duplication key.
- `POST /api/integrations/loki/import` (operator) mirrors the Prometheus and Kubernetes imports.
- Lines are redacted **before** truncation (JWTs, AWS keys, GitHub tokens, PEM blocks, bearer/basic
  credentials, `key=value` secrets).

## Aggregate import (`POST /api/integrations/observability/import`)

Sources are imported independently. If one fails and another succeeds, the response is `200` with the
successful results plus `errors.<source> = { code, message }`. If every requested source fails, the
first failure is returned with its own status code.
