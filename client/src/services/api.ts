import type { HealthStatus } from '../types/health';
import type { Resource, ResourceFilters, ResourceInput } from '../types/resource';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

export async function fetchHealth(): Promise<HealthStatus> {
  const response = await fetch(`${apiBaseUrl}/health`);

  if (!response.ok) {
    throw new Error(`Health request failed with status ${response.status}.`);
  }

  return response.json() as Promise<HealthStatus>;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const body = (await response.json().catch(() => null)) as { data?: T; error?: string } | null;
  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed with status ${response.status}.`);
  }
  return (body as ApiResponse<T>).data;
}

export async function listResources(filters: ResourceFilters = {}): Promise<Resource[]> {
  const params = new URLSearchParams();
  if (filters.type) params.set('type', filters.type);
  if (filters.status) params.set('status', filters.status);
  if (filters.environment) params.set('environment', filters.environment);
  if (filters.enabled !== undefined) params.set('enabled', String(filters.enabled));
  const query = params.toString();
  return request<Resource[]>(`/resources${query ? `?${query}` : ''}`);
}

export function getResource(id: string): Promise<Resource> {
  return request<Resource>(`/resources/${id}`);
}

export function createResource(input: ResourceInput): Promise<Resource> {
  return request<Resource>('/resources', { method: 'POST', body: JSON.stringify(input) });
}

export function updateResource(id: string, input: Partial<ResourceInput>): Promise<Resource> {
  return request<Resource>(`/resources/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deleteResource(id: string): Promise<null> {
  return request<null>(`/resources/${id}`, { method: 'DELETE' });
}
