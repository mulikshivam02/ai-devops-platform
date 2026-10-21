export const observationStatuses = ['pending', 'observed', 'insufficient_evidence'] as const;
export type ObservationStatus = (typeof observationStatuses)[number];
export const metricDirections = ['increase', 'decrease', 'unchanged', 'unknown'] as const;
export type MetricDirection = (typeof metricDirections)[number];
export const observedSeverities = ['none', 'low', 'medium', 'high', 'critical', 'unknown'] as const;
export type ObservedSeverity = (typeof observedSeverities)[number];
export type AccuracyLevel = 'poor' | 'low' | 'moderate' | 'good' | 'excellent' | 'insufficient_evidence';
export type PredictionRealityOutcome =
  | 'predicted_and_observed'
  | 'predicted_not_observed'
  | 'unexpected_impact'
  | 'partially_predicted'
  | 'no_significant_impact'
  | 'insufficient_evidence';

export interface SecurityImpactReference {
  fingerprint: string;
  findingId?: string;
  category: string;
  severity: string;
  title: string;
  evidenceIds: string[];
}
export interface SecurityComparison {
  predicted: SecurityImpactReference[];
  observed: SecurityImpactReference[];
  confirmed: SecurityImpactReference[];
  unexpected: SecurityImpactReference[];
  // Predicted findings that did NOT show up in observation -- without this,
  // security over-prediction (predicting findings that never materialize) was
  // undetectable. See review 2.11.
  unconfirmed: SecurityImpactReference[];
  // 'clean' added: previously "nothing predicted, nothing observed, evidence
  // available" fell through to 'insufficient_evidence', indistinguishable from
  // "we don't know." A genuinely clean result deserves its own status. See
  // review 2.11.
  status: 'confirmed' | 'unexpected' | 'clean' | 'insufficient_evidence';
}

export interface MetricObservation {
  name: string;
  baseline?: number;
  observed?: number;
  delta?: number;
  unit?: string;
  direction: MetricDirection;
  source: string;
}
export interface PredictionSnapshotDTO {
  id: string;
  changeId: string;
  analysisId: string;
  resourceId: string;
  predictedAt: string;
  predictedRisk: { score: number; level: string };
  predictedImpact: { categories: string[]; summary: string };
  predictedBlastRadius: {
    directCount: number;
    transitiveCount: number;
    totalCount: number;
    maxDependencyDepth: number;
  };
  predictedResourceIds: string[];
  predictedSecurityFindings: SecurityImpactReference[];
  predictionVersion: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
export interface ObservedImpactDTO {
  id: string;
  changeId: string;
  predictionId: string;
  resourceId: string;
  observationWindow: { start: string; end: string };
  evidenceIds: string[];
  observedImpact: { categories: string[]; summary: string };
  observedResources: string[];
  observedMetrics: MetricObservation[];
  observedEvents: Array<{ name: string; status?: string; source: string }>;
  observedFailures: Array<{ name: string; severity: ObservedSeverity; source: string }>;
  observedSecurityFindings: SecurityImpactReference[];
  status: ObservationStatus;
  createdAt: string;
  updatedAt: string;
}
export interface PredictionComparisonDTO {
  id: string;
  changeId: string;
  predictionId: string;
  observationId: string;
  comparedAt: string;
  outcome: PredictionRealityOutcome;
  impactComparison: {
    predictedCategories: string[];
    observedCategories: string[];
    confirmedCategories: string[];
    unconfirmedCategories: string[];
    unexpectedCategories: string[];
  };
  resourceComparison: {
    predictedResourceIds: string[];
    observedResourceIds: string[];
    confirmedResourceIds: string[];
    unexpectedResourceIds: string[];
  };
  securityComparison: SecurityComparison;
  metricComparison: Array<{
    name: string;
    predictedDirection?: MetricDirection;
    observedDirection: MetricDirection;
    match: boolean | null;
    baseline?: number;
    observed?: number;
    delta?: number;
    unit?: string;
  }>;
  blastRadiusComparison: { predictedTotal: number; observedTotal: number | null; delta: number | null };
  riskComparison: { predictedScore: number; observedSeverity: ObservedSeverity; explanation: string };
  accuracy: { score: number | null; level: AccuracyLevel };
  summary: string;
  evidenceIds: string[];
  createdAt: string;
  updatedAt: string;
}
