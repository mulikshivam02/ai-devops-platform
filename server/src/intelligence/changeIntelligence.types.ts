import type { ChangeDTO } from '../types/change.js';
import type { ChangeAnalysisDTO } from '../types/changeAnalysis.js';
import type { EvidenceDTO } from '../types/evidence.js';
import type { ResourceRecord } from '../types/resource.js';
import type { PredictionSnapshotDTO, ObservedImpactDTO, PredictionComparisonDTO } from '../types/predictionReality.js';
import type { SecurityFinding, SecuritySummary } from '../types/security.js';
import type { HistoricalPattern, PredictionAccuracy, RiskTrend, SimilarChange } from './intelligence.types.js';
import type { HistoricalOutcomeDTO } from '../types/historicalOutcome.js';
import type { LookupFailure } from '../utils/lookup.js';

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
  /**
   * `insufficient_evidence` = we looked and there is not enough history. `degraded`/`error` = some
   * or all lookups FAILED, so the empty sections mean "unknown", not "none".
   */
  status: 'available' | 'insufficient_evidence' | 'degraded' | 'error';
  similarChanges: SimilarChange[];
  riskTrend: RiskTrend | LookupFailure;
  predictionAccuracy: PredictionAccuracy | LookupFailure;
  patterns: HistoricalPattern[];
  /** Labels of the lookups that failed; empty when every lookup succeeded. */
  lookupErrors: string[];
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
  /** Present only when a lookup behind this result failed; the sections it names are unknown, not empty. */
  lookupErrors?: string[];
  historicalOutcome?: HistoricalOutcomeDTO;
}

export interface EvaluateRealityOptions {
  start?: string;
  end?: string;
}
