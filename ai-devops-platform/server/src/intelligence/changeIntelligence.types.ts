import type { ChangeDTO } from '../types/change.js';
import type { ChangeAnalysisDTO } from '../types/changeAnalysis.js';
import type { EvidenceDTO } from '../types/evidence.js';
import type { ResourceRecord } from '../types/resource.js';
import type { PredictionSnapshotDTO, ObservedImpactDTO, PredictionComparisonDTO } from '../types/predictionReality.js';
import type { SecurityFinding, SecuritySummary } from '../types/security.js';
import type { HistoricalPattern, PredictionAccuracy, RiskTrend, SimilarChange } from './intelligence.types.js';
import type { HistoricalOutcomeDTO } from '../types/historicalOutcome.js';

export interface EvidenceSummary {
  total: number;
  bySource: Record<string, number>;
  items: Array<Pick<EvidenceDTO, 'id' | 'source' | 'evidenceType' | 'timestamp' | 'correlationId'>>;
}

export interface AIInvestigationResult {
  status: 'completed' | 'unavailable' | 'skipped' | 'failed';
  data?: ReturnType<typeof import('../models/Investigation.js').toInvestigationDTO>;
}

export interface HistoricalLearningResult {
  status: 'available' | 'insufficient_evidence';
  similarChanges: SimilarChange[];
  riskTrend: RiskTrend;
  predictionAccuracy: PredictionAccuracy;
  patterns: HistoricalPattern[];
}

export interface ChangeIntelligenceResult {
  change: ChangeDTO;
  resource: ResourceRecord;
  evidenceSummary: EvidenceSummary;
  dependencyImpact?: Pick<
    ChangeAnalysisDTO,
    'directlyAffectedResourceIds' | 'transitivelyAffectedResourceIds' | 'blastRadius'
  >;
  risk?: ChangeAnalysisDTO['risk'];
  analysis?: ChangeAnalysisDTO;
  prediction?: PredictionSnapshotDTO;
  reality?: ObservedImpactDTO;
  predictionVsReality?: PredictionComparisonDTO;
  security?: { findings: SecurityFinding[]; summary: SecuritySummary };
  aiInvestigation: AIInvestigationResult;
  historicalLearning: HistoricalLearningResult;
  historicalOutcome?: HistoricalOutcomeDTO;
}

export interface EvaluateRealityOptions {
  start?: string;
  end?: string;
}
