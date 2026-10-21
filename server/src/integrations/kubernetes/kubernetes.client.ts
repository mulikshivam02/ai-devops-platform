import { Agent, fetch as undiciFetch } from 'undici';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/app-error.js';
import type {
  KubernetesApiVersion,
  KubernetesNamespaceList,
  KubernetesWorkloadKind,
  KubernetesWorkloadList
} from './kubernetes.types.js';

const defaultHeaders = { Accept: 'application/json' } as const;

function requireConfigured(): string {
  if (!env.kubernetesApiUrl)
    throw new AppError(503, 'Kubernetes integration is not configured.', 'KUBERNETES_NOT_CONFIGURED');
  return env.kubernetesApiUrl;
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

function parseKubernetesError(response: { status: number }, fallback: string): never {
  // 502 with distinct codes, never a pass-through 401: the browser client signs the user out on any
  // 401 from this API, and "the server's service-account token is bad" is not the user's session.
  // The two cases need different fixes, so they get different codes (and messages that say which).
  if (response.status === 401)
    throw new AppError(
      502,
      'Kubernetes rejected the configured credentials. Check KUBERNETES_TOKEN.',
      'KUBERNETES_AUTH_FAILED'
    );
  if (response.status === 403)
    throw new AppError(
      502,
      'The configured Kubernetes credentials lack RBAC permission to list this resource.',
      'KUBERNETES_FORBIDDEN'
    );
  if (response.status === 404)
    throw new AppError(502, 'Kubernetes API resource was not found.', 'KUBERNETES_NOT_FOUND');
  if (response.status === 429)
    throw new AppError(502, 'Kubernetes API rate limit was exceeded.', 'KUBERNETES_RATE_LIMIT');
  if (response.status >= 500) throw new AppError(502, 'Kubernetes API is unavailable.', 'KUBERNETES_UNAVAILABLE');
  throw new AppError(502, fallback, 'KUBERNETES_REQUEST_FAILED');
}

// TLS. Node's global fetch has no per-request CA option, and a real API server almost always uses a
// private CA, which the default trust store rejects (every call failed with KUBERNETES_NETWORK_ERROR).
// When KUBERNETES_CA_CERT is set, requests go through an undici Agent that trusts that CA IN ADDITION
// and nothing else -- certificate verification stays ON. With no CA configured the global fetch is
// used unchanged (NODE_EXTRA_CA_CERTS still works for that path).
let dispatcher: Agent | undefined;

function caDispatcher(): Agent | undefined {
  if (!env.kubernetesCaCert) return undefined;
  dispatcher ??= new Agent({ connect: { ca: env.kubernetesCaCert } });
  return dispatcher;
}

interface HttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

async function send(
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal }
): Promise<HttpResponse> {
  const agent = caDispatcher();
  if (agent) return undiciFetch(url, { method: 'GET', ...init, dispatcher: agent });
  return fetch(url, { method: 'GET', ...init });
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.kubernetesTimeoutMs);

  try {
    const response = await send(url, {
      headers: {
        ...defaultHeaders,
        ...(env.kubernetesToken ? { Authorization: `Bearer ${env.kubernetesToken}` } : {})
      },
      signal: controller.signal
    });
    // Status before body: a proxy's HTML 502 page used to be reported as "invalid JSON" instead of
    // "unavailable", hiding the real failure.
    const rawText = await response.text();
    if (!response.ok) parseKubernetesError(response, label);
    try {
      return (rawText ? JSON.parse(rawText) : null) as T;
    } catch {
      throw new AppError(502, `${label} returned invalid JSON.`, 'KUBERNETES_INVALID_RESPONSE');
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === 'AbortError')
      throw new AppError(504, 'Kubernetes API request timed out.', 'KUBERNETES_TIMEOUT');
    throw new AppError(503, 'Kubernetes API request failed.', 'KUBERNETES_NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

export function isKubernetesConfigured(): boolean {
  return Boolean(env.kubernetesApiUrl);
}

export async function getKubernetesVersion(): Promise<KubernetesApiVersion> {
  return fetchJson<KubernetesApiVersion>(`${requireConfigured()}/version`, 'Kubernetes version lookup');
}

export async function getKubernetesNamespaces(limit: number): Promise<KubernetesNamespaceList> {
  return fetchJson<KubernetesNamespaceList>(
    `${requireConfigured()}/api/v1/namespaces?limit=${limit}`,
    'Kubernetes namespace lookup'
  );
}

export async function getKubernetesWorkloads(
  namespace: string | undefined,
  kind: KubernetesWorkloadKind,
  limit: number,
  continueToken?: string
): Promise<KubernetesWorkloadList> {
  const base = requireConfigured();
  const resource = kind.toLowerCase() + 's';
  const path = namespace
    ? `/apis/apps/v1/namespaces/${encodeSegment(namespace)}/${resource}`
    : `/apis/apps/v1/${resource}`;
  const params = new URLSearchParams({ limit: String(limit) });
  // Following this was previously never implemented at all: every list request
  // silently returned only its first page, with no way to see more. See review 4.4.
  if (continueToken) params.set('continue', continueToken);
  return fetchJson<KubernetesWorkloadList>(`${base}${path}?${params.toString()}`, `Kubernetes ${kind} lookup`);
}
