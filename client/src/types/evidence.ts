export const evidenceTypes = ['git', 'deployment', 'kubernetes', 'terraform', 'docker', 'metric', 'log', 'event', 'configuration'] as const;
export type EvidenceType = (typeof evidenceTypes)[number];

export const evidenceSources = ['manual', 'system', 'github', 'kubernetes', 'terraform', 'prometheus', 'loki', 'docker'] as const;
export type EvidenceSource = (typeof evidenceSources)[number];

export interface Evidence {
  id: string;
  resourceId?: string;
  evidenceType: EvidenceType;
  source: EvidenceSource;
  timestamp: string;
  collectedAt: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  correlationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceInput {
  resourceId?: string;
  evidenceType: EvidenceType;
  source: EvidenceSource;
  timestamp: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  correlationId?: string;
}

export interface EvidenceFilters {
  resourceId?: string;
  evidenceType?: EvidenceType;
  source?: EvidenceSource;
  correlationId?: string;
  startTime?: string;
  endTime?: string;
  page?: number;
  limit?: number;
}