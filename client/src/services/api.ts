import type { HealthStatus } from '../types/health';
import type { Resource, ResourceFilters, ResourceInput } from '../types/resource';
import type { Evidence, EvidenceFilters, EvidenceInput } from '../types/evidence';
import type { Change, ChangeFilters, ChangeInput, ChangeStatus } from '../types/change';
import type { Dependency, DependencyFilters, DependencyGraph, DependencyInput } from '../types/dependency';
import type { ChangeAnalysis } from '../types/changeAnalysis';

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
  pagination?: Pagination;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
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

async function requestPage<T>(path: string): Promise<{ data: T; pagination: Pagination }> {
  const response = await fetch(`${apiBaseUrl}${path}`);
  const body = (await response.json().catch(() => null)) as ApiResponse<T> | { error?: string } | null;
  if (!response.ok) throw new Error(body && 'error' in body ? body.error ?? `Request failed with status ${response.status}.` : `Request failed with status ${response.status}.`);
  if (!body || !('pagination' in body) || !body.pagination) throw new Error('The API returned invalid pagination data.');
  return { data: body.data, pagination: body.pagination };
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

function queryString(values: object): string {
  const params = new URLSearchParams();
  (Object.entries(values) as [string, string | number | undefined][]).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)); });
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function listEvidence(filters: EvidenceFilters = {}): Promise<{ data: Evidence[]; pagination: Pagination }> {
  return requestPage<Evidence[]>(`/evidence${queryString(filters)}`);
}

export function getEvidence(id: string): Promise<Evidence> {
  return request<Evidence>(`/evidence/${id}`);
}

export function getResourceEvidence(resourceId: string, page = 1, limit = 25): Promise<{ data: Evidence[]; pagination: Pagination }> {
  return requestPage<Evidence[]>(`/resources/${resourceId}/evidence?page=${page}&limit=${limit}`);
}

export function createEvidence(input: EvidenceInput): Promise<Evidence> {
  return request<Evidence>('/evidence', { method: 'POST', body: JSON.stringify(input) });
}

export function deleteEvidence(id: string): Promise<null> {
  return request<null>(`/evidence/${id}`, { method: 'DELETE' });
}

export function listChanges(filters: ChangeFilters = {}): Promise<{ data: Change[]; pagination: Pagination }> {
  return requestPage<Change[]>(`/changes${queryString(filters)}`);
}

export function getChange(id: string): Promise<Change> {
  return request<Change>(`/changes/${id}`);
}

export function getResourceChanges(resourceId: string, page = 1, limit = 25): Promise<{ data: Change[]; pagination: Pagination }> {
  return requestPage<Change[]>(`/resources/${resourceId}/changes?page=${page}&limit=${limit}`);
}

export function createChange(input: ChangeInput): Promise<Change> {
  return request<Change>('/changes', { method: 'POST', body: JSON.stringify(input) });
}

export function updateChangeStatus(id: string, status: ChangeStatus): Promise<Change> {
  return request<Change>(`/changes/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export function listDependencies(filters: DependencyFilters = {}): Promise<{ data: Dependency[]; pagination: Pagination }> {
  return requestPage<Dependency[]>(`/dependencies${queryString(filters)}`);
}

export function getDependency(id: string): Promise<Dependency> {
  return request<Dependency>(`/dependencies/${id}`);
}

export function createDependency(input: DependencyInput): Promise<Dependency> {
  return request<Dependency>('/dependencies', { method: 'POST', body: JSON.stringify(input) });
}

export function updateDependency(id: string, input: Partial<DependencyInput>): Promise<Dependency> {
  return request<Dependency>(`/dependencies/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deleteDependency(id: string): Promise<null> {
  return request<null>(`/dependencies/${id}`, { method: 'DELETE' });
}

export function getResourceDependencies(resourceId: string, depth = 1): Promise<Dependency[]> {
  return request<Dependency[]>(`/resources/${resourceId}/dependencies?depth=${depth}`);
}

export function getResourceDependents(resourceId: string, depth = 1): Promise<Dependency[]> {
  return request<Dependency[]>(`/resources/${resourceId}/dependents?depth=${depth}`);
}

export function getResourceGraph(resourceId: string, depth = 1, direction: 'dependencies' | 'dependents' = 'dependencies'): Promise<DependencyGraph> {
  return request<DependencyGraph>(`/resources/${resourceId}/dependency-graph?depth=${depth}&direction=${direction}`);
}

export function analyzeChange(changeId: string): Promise<ChangeAnalysis> {
  return request<ChangeAnalysis>(`/changes/${changeId}/analyze`, { method: 'POST' });
}

export function getChangeAnalysis(changeId: string): Promise<ChangeAnalysis> {
  return request<ChangeAnalysis>(`/changes/${changeId}/analysis`);
}

export function listChangeAnalyses(filters: { changeId?: string; resourceId?: string; page?: number; limit?: number } = {}): Promise<{ data: ChangeAnalysis[]; pagination: Pagination }> {
  return requestPage<ChangeAnalysis[]>(`/change-analyses${queryString(filters)}`);
}

export function getChangeAnalysisById(id: string): Promise<ChangeAnalysis> {
  return request<ChangeAnalysis>(`/change-analyses/${id}`);
}
