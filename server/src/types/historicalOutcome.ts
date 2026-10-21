export const accuracyVersion = '1.0';
export type EvidenceQuality = 'high' | 'medium' | 'low' | 'insufficient';
export type PredictionRealityOutcome =
  | 'predicted_and_observed'
  | 'predicted_not_observed'
  | 'unexpected_impact'
  | 'partially_predicted'
  | 'no_significant_impact'
  | 'insufficient_evidence';

export interface AccuracyDimensions {
  outcome: number | null;
  impact: number | null;
  resources: number | null;
  failureModes: number | null;
  overall: number | null;
  accuracyVersion: string;
}

export interface HistoricalOutcomeDTO {
  id: string;
  changeId: string;
  resourceId: string;
  changeType: string;
  source: string;
  riskScore: number;
  riskLevel: string;
  predictedImpact: string[];
  observedImpact: string[];
  outcome: PredictionRealityOutcome;
  affectedResourceIds: string[];
  securityFindingCount: number;
  predictedAt: string;
  evaluatedAt: string;
  predictionVersion: string;
  evidenceQuality: EvidenceQuality;
  accuracy: AccuracyDimensions;
  evidenceIds: string[];
}
