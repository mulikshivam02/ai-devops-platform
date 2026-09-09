export const changeTypes = ['code', 'configuration', 'infrastructure', 'deployment', 'dependency', 'security', 'unknown'] as const;
export type ChangeType = (typeof changeTypes)[number];

export const changeStatuses = ['detected', 'deployed', 'failed', 'reverted', 'unknown'] as const;
export type ChangeStatus = (typeof changeStatuses)[number];

export interface Change {
  id: string;
  resourceId: string;
  changeId: string;
  source: string;
  author?: string;
  timestamp: string;
  summary: string;
  changeType: ChangeType;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  evidenceIds: string[];
  deploymentId?: string;
  status: ChangeStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeInput {
  resourceId: string;
  changeId: string;
  source: string;
  author?: string;
  timestamp: string;
  summary: string;
  changeType: ChangeType;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  evidenceIds?: string[];
  deploymentId?: string;
  status?: ChangeStatus;
  metadata?: Record<string, unknown>;
}

export interface ChangeFilters {
  resourceId?: string;
  source?: string;
  changeType?: ChangeType;
  status?: ChangeStatus;
  author?: string;
  startTime?: string;
  endTime?: string;
  page?: number;
  limit?: number;
}