import type { HealthStatus } from '../types/health';
import type { Resource, ResourceFilters, ResourceInput } from '../types/resource';
import type { Evidence, EvidenceFilters, EvidenceInput } from '../types/evidence';
import type { Change, ChangeFilters, ChangeInput, ChangeStatus } from '../types/change';
import type { Dependency, DependencyFilters, DependencyGraph, DependencyInput } from '../types/dependency';
import type { ChangeAnalysis } from '../types/changeAnalysis';
import type { ObservedImpact, PredictionComparison, PredictionSnapshot } from '../types/predictionReality';
import type { Investigation } from '../types/investigation';
import type { SecurityFinding, SecuritySummary, SecurityDependencyEdge } from '../types/security';
import type { Remediation } from '../types/remediation';
import type { AdvancedInsight, IntelligenceOverview } from '../types/intelligence';
import type { KubernetesHealth, KubernetesImportResult, KubernetesNamespace, KubernetesWorkload, KubernetesWorkloadKind } from '../types/kubernetes';
import type { LokiHealth, LokiLogObservation, ObservabilityImportResult, PrometheusHealth, PrometheusMetricObservation } from '../types/observability';
import type { ChangeIntelligenceResult } from '../types/changeIntelligence';
import type { DashboardSummary } from '../types/dashboard';
import type { HistoricalOutcome, HistoricalSummary } from '../types/historical';

import { authSessionChanged, getAuthToken, setAuthToken } from './session';

export { authSessionChanged, setAuthToken };

/**
 * Relative by default: the app and the API share an origin (nginx in production, the Vite dev proxy in
 * development), so there is no CORS and nothing to configure. Set VITE_API_BASE_URL at BUILD time to
 * point at a separate API origin; Vite inlines it, so changing it on a running container does nothing.
 */
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');

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

export interface AuthUser { id: string; email: string; role: 'viewer' | 'operator' | 'admin'; active: boolean; createdAt: string; }
function authHeaders(): Record<string, string> { const token = getAuthToken(); return token ? { Authorization: `Bearer ${token}` } : {}; }

/**
 * Defaults first, caller's headers last, so a caller can add or override a header without losing the
 * Authorization header. (The old code spread `...options` AFTER a merged `headers` object, so any call
 * passing its own headers replaced the whole thing and went out unauthenticated.)
 */
export function buildHeaders(extra?: HeadersInit): Headers {
  // A Headers object, so names are case-insensitive: a caller's "content-type" replaces ours instead of
  // being sent alongside it.
  const headers = new Headers({ 'Content-Type': 'application/json', ...authHeaders() });
  new Headers(extra).forEach((value, name) => headers.set(name, value));
  return headers;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers: buildHeaders(options?.headers) });
  const body = (await response.json().catch(() => null)) as { data?: T; error?: string | { message?: string } } | null;
  if (!response.ok) {
    const error = body?.error; const message = typeof error === 'string' ? error : error && typeof error === 'object' && 'message' in error ? String(error.message) : `Request failed with status ${response.status}.`;
    if (response.status === 401) setAuthToken(null);
    throw new Error(message);
  }
  return (body as ApiResponse<T>).data;
}

async function requestPage<T>(path: string): Promise<{ data: T; pagination: Pagination }> {
  const response = await fetch(`${apiBaseUrl}${path}`, { headers: buildHeaders() });
  const body = (await response.json().catch(() => null)) as ApiResponse<T> | { error?: string | { message?: string } } | null;
  if (!response.ok) { const error = body && 'error' in body ? body.error : undefined; const message = typeof error === 'string' ? error : error && typeof error === 'object' && 'message' in error ? String(error.message) : `Request failed with status ${response.status}.`; if (response.status === 401) setAuthToken(null); throw new Error(message); }
  if (!body || !('pagination' in body) || !body.pagination) throw new Error('The API returned invalid pagination data.');
  return { data: body.data, pagination: body.pagination };
}

const RESOURCE_PAGE_SIZE = 100;
const RESOURCE_MAX_PAGES = 50;

/**
 * The API pages /resources (max 100 per page). Every current caller wants the whole inventory for a
 * dropdown or table, so this walks the pages. Capped so a runaway inventory cannot loop forever; the
 * pagination UI for large inventories belongs to the frontend phase.
 */
export async function listResources(filters: ResourceFilters = {}): Promise<Resource[]> {
  const all: Resource[] = [];
  for (let page = 1; page <= RESOURCE_MAX_PAGES; page += 1) {
    const params = new URLSearchParams({ page: String(page), limit: String(RESOURCE_PAGE_SIZE) });
    if (filters.type) params.set('type', filters.type);
    if (filters.status) params.set('status', filters.status);
    if (filters.environment) params.set('environment', filters.environment);
    if (filters.enabled !== undefined) params.set('enabled', String(filters.enabled));
    const result = await requestPage<Resource[]>(`/resources?${params.toString()}`);
    all.push(...result.data);
    if (page >= result.pagination.pages) break;
  }
  return all;
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

export function createPrediction(changeId: string): Promise<PredictionSnapshot> { return request<PredictionSnapshot>(`/changes/${changeId}/prediction`, { method: 'POST' }); }
export function getPrediction(changeId: string): Promise<PredictionSnapshot> { return request<PredictionSnapshot>(`/changes/${changeId}/prediction`); }
export function createObservation(changeId: string, input: { predictionId: string; start: string; end: string }): Promise<ObservedImpact> { return request<ObservedImpact>(`/changes/${changeId}/observations`, { method: 'POST', body: JSON.stringify(input) }); }
export function listObservations(changeId: string): Promise<ObservedImpact[]> { return request<ObservedImpact[]>(`/changes/${changeId}/observations`); }
export function comparePrediction(changeId: string, input: { predictionId: string; observationId: string }): Promise<PredictionComparison> { return request<PredictionComparison>(`/changes/${changeId}/compare`, { method: 'POST', body: JSON.stringify(input) }); }
export function getComparison(changeId: string): Promise<PredictionComparison> { return request<PredictionComparison>(`/changes/${changeId}/comparison`); }
export function investigateChange(changeId: string): Promise<Investigation> { return request<Investigation>(`/changes/${changeId}/investigate`, { method: 'POST' }); }
export function listInvestigations(changeId: string): Promise<Investigation[]> { return request<Investigation[]>(`/changes/${changeId}/investigations`); }
export function getInvestigation(id: string): Promise<Investigation> { return request<Investigation>(`/investigations/${id}`); }
export function getAIHealth(): Promise<{ available: boolean; provider: string; model: string; message: string }> { return request('/ai/health'); }
export async function login(email: string, password: string): Promise<AuthUser> { const result = await request<{ user: AuthUser; token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); setAuthToken(result.token); return result.user; }
export async function logout(): Promise<null> { try { return await request<null>('/auth/logout', { method: 'POST' }); } finally { setAuthToken(null); } }
export function currentUser(): Promise<AuthUser> { return request<AuthUser>('/auth/me'); }
export function listSecurityFindings(filters: { severity?: string; category?: string; status?: string; source?: string; page?: number; limit?: number } = {}): Promise<{ data: SecurityFinding[]; pagination: Pagination }> { return requestPage<SecurityFinding[]>(`/security/findings${queryString(filters)}`); }
export function getSecuritySummary(): Promise<SecuritySummary> { return request<SecuritySummary>('/security/summary'); }
export function getSecurityFindingDependents(resourceId: string, depth = 10): Promise<SecurityDependencyEdge[]> { return request<SecurityDependencyEdge[]>(`/resources/${resourceId}/dependents?depth=${depth}`); }
export function listRemediations(filters: { status?: string; type?: string; changeId?: string; resourceId?: string; page?: number; limit?: number } = {}): Promise<{ data: Remediation[]; pagination: Pagination }> { return requestPage<Remediation[]>(`/remediations${queryString(filters)}`); }
export function getRemediation(id: string): Promise<Remediation> { return request<Remediation>(`/remediations/${id}`); }
export function remediationAction(id: string, action: string, body: Record<string, unknown> = {}): Promise<Remediation> { return request<Remediation>(`/remediations/${id}/${action}`, { method: 'POST', body: JSON.stringify(body) }); }
export function getGitHubRepository(owner: string, repo: string): Promise<{ fullName: string; description?: string; defaultBranch?: string; htmlUrl?: string; private?: boolean; archived?: boolean; pushedAt?: string }> {
  return request<{ fullName: string; description?: string; defaultBranch?: string; htmlUrl?: string; private?: boolean; archived?: boolean; pushedAt?: string }>(`/integrations/github/repository?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`);
}
export function getGitHubCommits(owner: string, repo: string, limit = 10): Promise<Array<{ sha: string; message: string; authorName?: string; authorEmail?: string; username?: string; timestamp: string; url?: string; repository: string; additions?: number; deletions?: number; changedFiles?: number }>> {
  return request<Array<{ sha: string; message: string; authorName?: string; authorEmail?: string; username?: string; timestamp: string; url?: string; repository: string; additions?: number; deletions?: number; changedFiles?: number }>>(`/integrations/github/commits?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&limit=${limit}`);
}
export function importGitHubCommits(input: { owner: string; repo: string; resourceId: string; limit?: number; ref?: string; page?: number }): Promise<{ repository: string; requested: number; imported: number; alreadyPresent: number; hasMore: boolean; page: number; changes: Array<{ id: string; changeId: string; source: string; summary: string; status: string; existing?: boolean }> }> {
  return request<{ repository: string; requested: number; imported: number; alreadyPresent: number; hasMore: boolean; page: number; changes: Array<{ id: string; changeId: string; source: string; summary: string; status: string; existing?: boolean }> }>('/integrations/github/import', { method: 'POST', body: JSON.stringify(input) });
}
export function getKubernetesHealth(): Promise<KubernetesHealth> { return request<KubernetesHealth>('/integrations/kubernetes/health'); }
export function listKubernetesNamespaces(): Promise<KubernetesNamespace[]> { return request<KubernetesNamespace[]>('/integrations/kubernetes/namespaces'); }
export function listKubernetesWorkloads(input: { namespace?: string; kind?: KubernetesWorkloadKind; limit?: number } = {}): Promise<KubernetesWorkload[]> { return request<KubernetesWorkload[]>(`/integrations/kubernetes/workloads${queryString(input)}`); }
export function importKubernetesWorkloads(input: { resourceId: string; namespace?: string; kind?: KubernetesWorkloadKind }): Promise<KubernetesImportResult> { return request<KubernetesImportResult>('/integrations/kubernetes/import', { method: 'POST', body: JSON.stringify(input) }); }
export function getPrometheusHealth(): Promise<PrometheusHealth> { return request<PrometheusHealth>('/integrations/prometheus/health'); }
export function queryPrometheus(query: string): Promise<PrometheusMetricObservation[]> { return request<PrometheusMetricObservation[]>(`/integrations/prometheus/query?query=${encodeURIComponent(query)}`); }
export function getLokiHealth(): Promise<LokiHealth> { return request<LokiHealth>('/integrations/loki/health'); }
export function queryLoki(query: string, limit = 25, start?: string, end?: string): Promise<LokiLogObservation[]> { return request<LokiLogObservation[]>(`/integrations/loki/query${queryString({ query, limit, start, end })}`); }
export function importObservability(input: { resourceId: string; prometheus?: { query: string }; loki?: { query: string; start?: string; end?: string; limit?: number } }): Promise<ObservabilityImportResult> { return request<ObservabilityImportResult>('/integrations/observability/import', { method: 'POST', body: JSON.stringify(input) }); }
export function getIntelligenceOverview(): Promise<IntelligenceOverview> { return request<IntelligenceOverview>('/intelligence/overview'); }
export function listIntelligenceInsights(filters: { status?: string; page?: number; limit?: number } = {}): Promise<{ data: AdvancedInsight[]; pagination: Pagination }> { return requestPage<AdvancedInsight[]>(`/intelligence/insights${queryString(filters)}`); }
export function updateIntelligenceInsight(id: string, action: 'acknowledge' | 'dismiss'): Promise<AdvancedInsight> { return request<AdvancedInsight>(`/intelligence/insights/${id}/${action}`, { method: 'POST' }); }
export function analyzeChangeIntelligence(changeId: string): Promise<ChangeIntelligenceResult> { return request<ChangeIntelligenceResult>(`/intelligence/changes/${changeId}/analyze`, { method: 'POST' }); }
export function evaluateChangeReality(changeId: string, input: { start?: string; end?: string } = {}): Promise<ChangeIntelligenceResult> { return request<ChangeIntelligenceResult>(`/intelligence/changes/${changeId}/evaluate`, { method: 'POST', body: JSON.stringify(input) }); }
export function getChangeIntelligence(changeId: string): Promise<ChangeIntelligenceResult> { return request<ChangeIntelligenceResult>(`/intelligence/changes/${changeId}`); }
export function getDashboardSummary(): Promise<DashboardSummary> { return request<DashboardSummary>('/dashboard/summary'); }
export function getHistoricalSummary(): Promise<HistoricalSummary> { return request<HistoricalSummary>('/intelligence/history/summary'); }
export function getSimilarHistoricalChanges(changeId: string): Promise<Array<{ changeId: string; similarityScore: number; matchingFactors: string[]; differences: string[]; outcome: string; evidenceIds: string[] }>> { return request(`/intelligence/history/similar/${changeId}`); }
export function getHistoricalAccuracy(changeId: string): Promise<HistoricalOutcome | null> { return request<HistoricalOutcome | null>(`/intelligence/history/accuracy/${changeId}`); }
