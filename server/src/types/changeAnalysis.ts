export const riskLevels = ['low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = (typeof riskLevels)[number];

export const impactCategories = ['availability', 'performance', 'reliability', 'configuration', 'infrastructure', 'deployment', 'dependency', 'security'] as const;
export type ImpactCategory = (typeof impactCategories)[number];

export interface ChangedItem {
  path: string;
  itemType: string;
  operation: 'added' | 'removed' | 'changed';
  before?: unknown;
  after?: unknown;
}

export interface RiskFactor {
  name: string;
  contribution: number;
  reason: string;
}

export interface ChangeAnalysisDTO {
  id: string;
  changeId: string;
  resourceId: string;
  analyzedAt: string;
  changedItems: ChangedItem[];
  directlyAffectedResourceIds: string[];
  transitivelyAffectedResourceIds: string[];
  blastRadius: {
    directCount: number;
    transitiveCount: number;
    totalCount: number;
    maxDependencyDepth: number;
  };
  risk: {
    score: number;
    level: RiskLevel;
    factors: RiskFactor[];
  };
  impact: {
    categories: ImpactCategory[];
    summary: string;
  };
  rollback: {
    available: boolean;
    source: string;
    description: string;
  };
  evidenceIds: string[];
  analysisVersion: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}