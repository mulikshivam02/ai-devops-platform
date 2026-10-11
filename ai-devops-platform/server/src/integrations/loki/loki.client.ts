import { env } from '../../config/env.js';
import { AppError } from '../../utils/app-error.js';
import type { LokiBuildInfo, LokiQueryData } from './loki.types.js';

const MAX_RESPONSE_BYTES = 1024 * 1024;

function requireConfigured(): string {
  if (!env.lokiApiUrl) throw new AppError(503, 'Loki integration is not configured.', 'LOKI_NOT_CONFIGURED');
  return env.lokiApiUrl;
}

function parseLokiError(response: Response, fallback: string): never {
  // 502, never 401: the browser client treats any 401 from this API as "your session expired"
  // and signs the user out, but this is the SERVER's credential for Loki being wrong.
  if (response.status === 401)
    throw new AppError(502, 'Loki rejected the configured credentials. Check LOKI_TOKEN.', 'LOKI_AUTH_FAILED');
  if (response.status === 403)
    throw new AppError(502, 'The configured Loki credentials lack permission for this request.', 'LOKI_FORBIDDEN');
  if (response.status === 404) throw new AppError(502, 'Loki API endpoint was not found.', 'LOKI_NOT_FOUND');
  if (response.status === 429) throw new AppError(502, 'Loki API rate limit was exceeded.', 'LOKI_RATE_LIMIT');
  if (response.status >= 500) throw new AppError(502, 'Loki API is unavailable.', 'LOKI_UNAVAILABLE');
  throw new AppError(502, fallback, 'LOKI_REQUEST_FAILED');
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.lokiTimeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', ...(env.lokiToken ? { Authorization: `Bearer ${env.lokiToken}` } : {}) },
      signal: controller.signal
    });
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > MAX_RESPONSE_BYTES)
      throw new AppError(502, 'Loki response exceeded the safe size limit.', 'LOKI_RESPONSE_TOO_LARGE');
    const rawText = await response.text();
    if (rawText.length > MAX_RESPONSE_BYTES)
      throw new AppError(502, 'Loki response exceeded the safe size limit.', 'LOKI_RESPONSE_TOO_LARGE');
    // Status first: a 502/503 from a proxy in front of Loki has an HTML body, and parsing that
    // first reported "invalid JSON" instead of "unavailable".
    if (!response.ok) parseLokiError(response, label);
    let payload: { status?: string; data?: T; error?: string };
    try {
      payload = rawText ? (JSON.parse(rawText) as { status?: string; data?: T; error?: string }) : {};
    } catch {
      throw new AppError(502, `${label} returned invalid JSON.`, 'LOKI_INVALID_RESPONSE');
    }
    if (payload.status === 'error') throw new AppError(502, 'Loki query failed.', 'LOKI_QUERY_FAILED');
    return (payload.data ?? {}) as T;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === 'AbortError')
      throw new AppError(504, 'Loki API request timed out.', 'LOKI_TIMEOUT');
    throw new AppError(503, 'Loki API request failed.', 'LOKI_NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

export function isLokiConfigured(): boolean {
  return Boolean(env.lokiApiUrl);
}

export async function getLokiBuildInfo(): Promise<LokiBuildInfo> {
  return fetchJson<LokiBuildInfo>(`${requireConfigured()}/loki/api/v1/status/buildinfo`, 'Loki health check');
}

export async function queryLoki(
  query: string,
  range: { start: Date; end: Date },
  limit: number
): Promise<LokiQueryData> {
  const url = new URL(`${requireConfigured()}/loki/api/v1/query_range`);
  url.searchParams.set('query', query);
  url.searchParams.set('start', range.start.toISOString());
  url.searchParams.set('end', range.end.toISOString());
  url.searchParams.set('direction', 'backward');
  url.searchParams.set('limit', String(limit));
  return fetchJson<LokiQueryData>(url.toString(), 'Loki query');
}
