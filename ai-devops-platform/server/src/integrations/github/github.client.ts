import { env } from '../../config/env.js';
import { AppError } from '../../utils/app-error.js';
import type { GitHubCommitSummary, GitHubRepositorySummary } from './github.types.js';

const defaultHeaders = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28'
} as const;

function buildRepositoryUrl(owner: string, repo: string): string {
  return `${env.githubApiBaseUrl.replace(/\/$/, '')}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function normalizeCommitMessage(message: string): string {
  const trimmed = message.trim();
  const firstLine = trimmed.split(/\r?\n/)[0]?.trim() ?? trimmed;
  return firstLine.length > 500 ? `${firstLine.slice(0, 497)}...` : firstLine;
}

function parseGitHubError(response: Response, fallback: string): never {
  const status = response.status;
  // 401/403 from GitHub mean the SERVER's GITHUB_TOKEN is bad or under-scoped. They are mapped to
  // 502, never passed through: the browser client signs the user out on any 401 from this API, so
  // a revoked GitHub token used to log every operator out of ChangeLens.
  if (status === 401)
    throw new AppError(502, 'GitHub rejected the configured credentials. Check GITHUB_TOKEN.', 'GITHUB_AUTH_FAILED');
  if (status === 403)
    throw new AppError(502, 'The configured GitHub credentials lack access to this resource.', 'GITHUB_FORBIDDEN');
  if (status === 404) throw new AppError(404, 'GitHub repository not found.', 'GITHUB_REPOSITORY_NOT_FOUND');
  if (status === 422) throw new AppError(422, 'GitHub request validation failed.', 'GITHUB_INVALID_REQUEST');
  if (status >= 500) throw new AppError(502, 'GitHub service is unavailable.', 'GITHUB_UNAVAILABLE');
  throw new AppError(502, fallback, 'GITHUB_REQUEST_FAILED');
}

interface JsonResult<T> {
  data: T;
  hasNextPage: boolean;
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  return (await fetchJsonWithMeta<T>(url, label)).data;
}

async function fetchJsonWithMeta<T>(url: string, label: string): Promise<JsonResult<T>> {
  const controller = new AbortController();
  const timeoutMs = env.githubTimeoutMs;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...defaultHeaders,
        ...(env.githubToken ? { Authorization: `Bearer ${env.githubToken}` } : {})
      },
      signal: controller.signal
    });

    if (!response.ok) {
      // Read the real rate-limit headers GitHub sends on every response
      // instead of string-matching the error message for the word "rate limit".
      // The header check is authoritative -- GitHub's error message wording
      // isn't a documented, stable contract, and this also catches the
      // secondary-rate-limit case (403 with Retry-After but no "rate limit"
      // wording at all in some responses). See review 4.3.
      const remaining = response.headers.get('x-ratelimit-remaining');
      const retryAfter = response.headers.get('retry-after');
      const primaryExhausted = response.status === 403 && remaining === '0';
      // Secondary (abuse) limits arrive as 403 or 429 carrying Retry-After, with quota remaining.
      const secondaryLimited = (response.status === 403 || response.status === 429) && retryAfter !== null;
      if (primaryExhausted || secondaryLimited || response.status === 429) {
        const resetHeader = response.headers.get('x-ratelimit-reset');
        const resetSeconds = resetHeader ? Number(resetHeader) : Number.NaN;
        const retrySeconds = retryAfter ? Number(retryAfter) : Number.NaN;
        const resetAt = Number.isFinite(retrySeconds)
          ? new Date(Date.now() + retrySeconds * 1000)
          : Number.isFinite(resetSeconds)
            ? new Date(resetSeconds * 1000)
            : undefined;
        throw new AppError(
          429,
          resetAt ? `GitHub rate limit exceeded. Retry after ${resetAt.toISOString()}.` : 'GitHub rate limit exceeded.',
          'GITHUB_RATE_LIMIT'
        );
      }
      const rawText = await response.text();
      let payload: unknown = null;
      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        // Not JSON -- fall through to the generic status-based error below
        // rather than let a JSON.parse failure surface as a network error,
        // which previously masked the real HTTP status. See review 4.3.
      }
      const message =
        typeof payload === 'object' && payload !== null && 'message' in payload && typeof payload.message === 'string'
          ? payload.message
          : label;
      parseGitHubError(response, message);
    }

    const rawText = await response.text();
    let data: unknown = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      // A malformed 2xx body is an upstream fault, not a network failure (which is what the
      // outer catch would otherwise report it as).
      throw new AppError(502, `${label} returned invalid JSON.`, 'GITHUB_INVALID_RESPONSE');
    }
    const link = response.headers.get('link') ?? '';
    return { data: data as T, hasNextPage: /<[^>]+>;\s*rel="next"/.test(link) };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppError(504, 'GitHub request timed out.', 'GITHUB_TIMEOUT');
    }
    throw new AppError(503, 'GitHub request failed.', 'GITHUB_NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

export async function getGitHubRepositorySummary(owner: string, repo: string): Promise<GitHubRepositorySummary> {
  const url = buildRepositoryUrl(owner, repo);
  const data = await fetchJson<{
    full_name?: string;
    description?: string;
    default_branch?: string;
    html_url?: string;
    private?: boolean;
    archived?: boolean;
    pushed_at?: string;
  }>(url, 'Repository lookup');

  return {
    fullName: data.full_name ?? `${owner}/${repo}`,
    description:
      typeof data.description === 'string' && data.description.trim().length > 0
        ? data.description.trim().slice(0, 500)
        : undefined,
    defaultBranch: typeof data.default_branch === 'string' ? data.default_branch : undefined,
    htmlUrl: typeof data.html_url === 'string' ? data.html_url : undefined,
    private: Boolean(data.private),
    archived: Boolean(data.archived),
    pushedAt: typeof data.pushed_at === 'string' ? data.pushed_at : undefined
  };
}

interface RawCommit {
  sha?: string;
  commit?: {
    message?: string;
    author?: { name?: string; email?: string; date?: string };
    committer?: { name?: string; email?: string; date?: string };
  };
  author?: { login?: string; name?: string } | null;
  committer?: { login?: string; name?: string } | null;
  html_url?: string;
}

// GET /repos/{o}/{r}/commits/{sha} -- the only GitHub endpoint that returns
// stats/files. The list endpoint used by getGitHubRecentCommits below does NOT
// include them, no matter what fields are requested; additions/deletions/
// changedFiles were always undefined (stored downstream as 0) because of this.
// See review 4.1.
interface StatsBudget {
  /** Set once GitHub reports a rate limit, so the remaining lookups are skipped rather than all failing. */
  exhausted: boolean;
}

async function getCommitStats(
  owner: string,
  repo: string,
  sha: string,
  budget: StatsBudget
): Promise<{ additions?: number; deletions?: number; changedFiles?: number }> {
  if (budget.exhausted) return {};
  try {
    const data = await fetchJson<{
      stats?: { additions?: number; deletions?: number };
      files?: Array<{ filename?: string }>;
    }>(`${buildRepositoryUrl(owner, repo)}/commits/${encodeURIComponent(sha)}`, 'Commit detail lookup');
    return {
      additions: typeof data.stats?.additions === 'number' ? data.stats.additions : undefined,
      deletions: typeof data.stats?.deletions === 'number' ? data.stats.deletions : undefined,
      changedFiles: Array.isArray(data.files) ? data.files.length : undefined
    };
  } catch (error) {
    // A single commit's detail lookup failing (transient network issue) should not fail the
    // whole import -- the commit itself is still real and worth recording, just without size
    // stats for this run. A RATE LIMIT is different: every further lookup would fail too, so
    // stop spending the remaining quota on them.
    if (error instanceof AppError && error.code === 'GITHUB_RATE_LIMIT') budget.exhausted = true;
    return {};
  }
}

// Runs `worker` over `items` with at most `concurrency` in flight at once,
// instead of either one-at-a-time (slow) or Promise.all (up to 50 simultaneous
// requests, inviting a secondary rate limit). No new dependency for this.
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

export interface GitHubCommitPage {
  commits: GitHubCommitSummary[];
  /** True when GitHub's Link header advertises another page. */
  hasNextPage: boolean;
}

export interface GitHubCommitOptions {
  since?: string;
  /** Branch, tag or SHA to list from; defaults to the repository's default branch. */
  ref?: string;
  /** 1-based page number (default 1). */
  page?: number;
}

export async function getGitHubCommitPage(
  owner: string,
  repo: string,
  limit: number,
  options: GitHubCommitOptions = {}
): Promise<GitHubCommitPage> {
  const safeLimit = Math.max(1, Math.min(50, limit));
  const params = new URLSearchParams({ per_page: String(safeLimit) });
  // `since` lets a repeat import ask only for commits after the last one it already saw.
  // `ref` (branch/tag/SHA) and `page` let a caller reach history the newest-50 window never
  // shows. See review 4.3.
  if (options.since) params.set('since', options.since);
  if (options.ref) params.set('sha', options.ref);
  if (options.page && options.page > 1) params.set('page', String(options.page));
  const url = `${buildRepositoryUrl(owner, repo)}/commits?${params.toString()}`;
  const { data, hasNextPage } = await fetchJsonWithMeta<RawCommit[]>(url, 'Recent commit lookup');
  if (!Array.isArray(data))
    throw new AppError(502, 'Recent commit lookup returned an unexpected payload.', 'GITHUB_INVALID_RESPONSE');

  const withoutStats = data
    .map((commit) => ({
      sha: commit.sha ?? '',
      message: normalizeCommitMessage(commit.commit?.message ?? 'untitled commit'),
      authorName:
        commit.commit?.author?.name ??
        commit.author?.login ??
        commit.commit?.committer?.name ??
        commit.committer?.login,
      authorEmail: commit.commit?.author?.email ?? commit.commit?.committer?.email,
      username: commit.author?.login ?? commit.committer?.login,
      timestamp: commit.commit?.author?.date ?? commit.commit?.committer?.date,
      url: typeof commit.html_url === 'string' ? commit.html_url : undefined,
      repository: `${owner}/${repo}`
    }))
    // A commit with no discoverable date used to fall back to new Date(0) ('1970-01-01'),
    // planting a garbage timestamp that then failed every observation-window query touching it.
    // Skipping it is more honest than fabricating a date GitHub never reported. See review 4.3.
    .filter(
      (commit): commit is typeof commit & { sha: string; timestamp: string } =>
        commit.sha.length > 0 && typeof commit.timestamp === 'string'
    );

  const budget: StatsBudget = { exhausted: false };
  const stats = await mapWithConcurrency(withoutStats, 5, (commit) => getCommitStats(owner, repo, commit.sha, budget));
  return { commits: withoutStats.map((commit, index) => ({ ...commit, ...stats[index] })), hasNextPage };
}

export async function getGitHubRecentCommits(
  owner: string,
  repo: string,
  limit: number,
  options: GitHubCommitOptions = {}
): Promise<GitHubCommitSummary[]> {
  return (await getGitHubCommitPage(owner, repo, limit, options)).commits;
}
