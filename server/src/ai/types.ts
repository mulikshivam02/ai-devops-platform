export type ReasoningType = 'change_analysis' | 'incident_rca' | 'prediction_explanation';
export type ReasoningItemType = 'fact' | 'inference' | 'hypothesis';

export interface InvestigationContext {
  change: {
    id: string;
    summary: string;
    changeType: string;
    source: string;
    resourceId: string;
    evidenceIds: string[];
  };
  resource: { id: string; name: string; type: string; environment?: string };
  analysis?: unknown;
  dependencies: Array<{ source: string; target: string; relationshipType: string }>;
  evidence: Array<{
    id: string;
    type: string;
    source: string;
    timestamp: string;
    resourceId?: string;
    payload: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }>;
  prediction?: unknown;
  observation?: unknown;
  comparison?: unknown;
  history: Array<{ id: string; summary: string; changeType: string; timestamp: string; status: string }>;
  securityFindings: Array<{
    id: string;
    category: string;
    severity: string;
    title: string;
    description: string;
    resourceId?: string;
    changeId?: string;
    evidenceIds: string[];
    confidence: number;
    cve?: string;
    cwe?: string;
    dependencyBlastRadius: {
      directDependents: string[];
      transitiveDependents: string[];
      dependencyDepth: number;
      totalPotentiallyAffected: number;
      semantics: 'potentially_affected_by_dependency_relationship';
    };
  }>;
  historicalIntelligence: {
    similarChanges: Array<{
      changeId: string;
      similarityScore: number;
      matchingFactors: string[];
      differences: string[];
      outcome: string;
      evidenceIds: string[];
    }>;
    riskTrend: unknown;
    predictionAccuracy: unknown;
    patterns: unknown[];
    /**
     * Lookups that FAILED (as opposed to returning nothing). When non-empty, "no history" in the
     * corresponding section means "unknown", not "none".
     */
    lookupErrors?: string[];
  };
}

/**
 * Instructions and data travel in separate chat messages. Putting evidence (commit messages, log
 * lines -- text an attacker can write) in the same string as the instructions let that text pose as
 * instructions. See review 5.5.
 */
export interface AIPrompt {
  /** Trusted: the contract, schema and rules. Written by us. */
  system: string;
  /** Untrusted data, fenced and labelled as such. */
  user: string;
}

export interface AIAnalysisInput {
  type: ReasoningType;
  context: InvestigationContext;
  prompt: AIPrompt;
}
export interface AIHypothesis {
  title: string;
  explanation: string;
  confidence: number;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
}
export interface AIRecommendation {
  title: string;
  explanation: string;
  priority: string;
  safe: boolean;
  supportingEvidenceIds: string[];
}
export interface AIAnalysisResult {
  summary: string;
  rootCause: { statement: string; confidence: number; evidenceIds: string[] };
  hypotheses: AIHypothesis[];
  evidenceReferences: string[];
  reasoning: Array<{ statement: string; type: ReasoningItemType }>;
  impactExplanation: string;
  predictionRealityExplanation: string;
  recommendations: AIRecommendation[];
  limitations: string[];
}

export interface AIProvider {
  readonly name: string;
  /** The model that actually serves requests, so records can store it instead of guessing from env. */
  readonly model: string;
  analyze(input: AIAnalysisInput): Promise<AIAnalysisResult>;
  health(): Promise<{ available: boolean; provider: string; model: string; message: string }>;
}
