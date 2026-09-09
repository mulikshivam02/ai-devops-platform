export type ReasoningType = 'change_analysis' | 'incident_rca' | 'prediction_explanation';
export type ReasoningItemType = 'fact' | 'inference' | 'hypothesis';

export interface InvestigationContext {
  change: { id: string; summary: string; changeType: string; source: string; resourceId: string; evidenceIds: string[] };
  resource: { id: string; name: string; type: string; environment?: string };
  analysis?: unknown;
  dependencies: Array<{ source: string; target: string; relationshipType: string }>;
  evidence: Array<{ id: string; type: string; source: string; timestamp: string; resourceId?: string; payload: Record<string, unknown>; metadata: Record<string, unknown> }>;
  prediction?: unknown;
  observation?: unknown;
  comparison?: unknown;
  history: Array<{ id: string; summary: string; changeType: string; timestamp: string; status: string }>;
  securityFindings: Array<{ id: string; category: string; severity: string; title: string; description: string; resourceId?: string; changeId?: string; evidenceIds: string[]; confidence: number; cve?: string; cwe?: string; dependencyBlastRadius: { directDependents: string[]; transitiveDependents: string[]; dependencyDepth: number; totalPotentiallyAffected: number; semantics: 'potentially_affected_by_dependency_relationship' } }>;
}

export interface AIAnalysisInput { type: ReasoningType; context: InvestigationContext; prompt: string; }
export interface AIHypothesis { title: string; explanation: string; confidence: number; supportingEvidenceIds: string[]; contradictingEvidenceIds: string[]; }
export interface AIRecommendation { title: string; explanation: string; priority: string; safe: boolean; supportingEvidenceIds: string[]; }
export interface AIAnalysisResult { summary: string; rootCause: { statement: string; confidence: number; evidenceIds: string[] }; hypotheses: AIHypothesis[]; evidenceReferences: string[]; reasoning: Array<{ statement: string; type: ReasoningItemType }>; impactExplanation: string; predictionRealityExplanation: string; recommendations: AIRecommendation[]; limitations: string[]; }

export interface AIProvider { readonly name: string; analyze(input: AIAnalysisInput): Promise<AIAnalysisResult>; health(): Promise<{ available: boolean; provider: string; model: string; message: string }>; }