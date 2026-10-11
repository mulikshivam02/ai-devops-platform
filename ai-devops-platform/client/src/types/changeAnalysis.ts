export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ImpactCategory = 'availability' | 'performance' | 'reliability' | 'configuration' | 'infrastructure' | 'deployment' | 'dependency' | 'security';

export interface ChangeAnalysis {
  id: string;
  changeId: string;
  resourceId: string;
  analyzedAt: string;
  changedItems: Array<{ path: string; itemType: string; operation: 'added' | 'removed' | 'changed'; before?: unknown; after?: unknown }>;
  directlyAffectedResourceIds: string[];
  transitivelyAffectedResourceIds: string[];
  blastRadius: { directCount: number; transitiveCount: number; totalCount: number; maxDependencyDepth: number };
  risk: { score: number; level: RiskLevel; factors: Array<{ name: string; contribution: number; reason: string }> };
  impact: { categories: ImpactCategory[]; summary: string };
  rollback: { available: boolean; source: string; description: string };
  evidenceIds: string[];
  analysisVersion: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}