import { env } from '../../config/env.js';
import { AppError } from '../../utils/app-error.js';
import type { PrometheusApiResponse, PrometheusBuildInfo, PrometheusQueryData } from './prometheus.types.js';

const MAX_RESPONSE_BYTES = 512 * 1024;

function requireConfigured(): string {
  if (!env.prometheusApiUrl)
    throw new AppError(503, 'Prometheus integration is not configured.', 'PROMETHEUS_NOT_CONFIGURED');
  return env.prometheusApiUrl;
}

function parsePrometheusError(response: Response, fallback: string): never {
  // 502, never 401: the browser client signs the user out on any 401 from this API, but this
  // is the SERVER's credential for Prometheus being wrong, not the user's session.
  if (response.status === 401)
    throw new AppError(
      502,
      'Prometheus rejected the configured credentials. Check PROMETHEUS_TOKEN.',
      'PROMETHEUS_AUTH_FAILED'
    );
  if (response.status === 403)
    throw new AppError(
      502,
      'The configured Prometheus credentials lack permission for this request.',
      'PROMETHEUS_FORBIDDEN'
    );
  if (response.status === 404)
    throw new AppError(502, 'Prometheus API endpoint was not found.', 'PROMETHEUS_NOT_FOUND');
  if (response.status === 429)
    throw new AppError(502, 'Prometheus API rate limit was exceeded.', 'PROMETHEUS_RATE_LIMIT');
  if (response.status >= 500) throw new AppError(502, 'Prometheus API is unavailable.', 'PROMETHEUS_UNAVAILABLE');
  throw new AppError(502, fallback, 'PROMETHEUS_REQUEST_FAILED');
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.prometheusTimeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(env.prometheusToken ? { Authorization: `Bearer ${env.prometheusToken}` } : {})
      },
      signal: controller.signal
    });
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > MAX_RESPONSE_BYTES)
      throw new AppError(502, 'Prometheus response exceeded the safe size limit.', 'PROMETHEUS_RESPONSE_TOO_LARGE');
    const rawText = await response.text();
    if (rawText.length > MAX_RESPONSE_BYTES)
      throw new AppError(502, 'Prometheus response exceeded the safe size limit.', 'PROMETHEUS_RESPONSE_TOO_LARGE');
    if (!response.ok) parsePrometheusError(response, label);
    let payload: PrometheusApiResponse<T>;
    try {
      payload = rawText ? (JSON.parse(rawText) as PrometheusApiResponse<T>) : {};
    } catch {
      throw new AppError(502, `${label} returned invalid JSON.`, 'PROMETHEUS_INVALID_RESPONSE');
    }
    if (payload.status === 'error') throw new AppError(502, 'Prometheus query failed.', 'PROMETHEUS_QUERY_FAILED');
    return (payload.data ?? {}) as T;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === 'AbortError')
      throw new AppError(504, 'Prometheus API request timed out.', 'PROMETHEUS_TIMEOUT');
    throw new AppError(503, 'Prometheus API request failed.', 'PROMETHEUS_NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

export function isPrometheusConfigured(): boolean {
  return Boolean(env.prometheusApiUrl);
}

export async function getPrometheusBuildInfo(): Promise<PrometheusBuildInfo> {
  return fetchJson<PrometheusBuildInfo>(`${requireConfigured()}/api/v1/status/buildinfo`, 'Prometheus health check');
}

export async function queryPrometheus(query: string): Promise<PrometheusQueryData> {
  const url = new URL(`${requireConfigured()}/api/v1/query`);
  url.searchParams.set('query', query);
  return fetchJson<PrometheusQueryData>(url.toString(), 'Prometheus query');
}
