import type { AIAnalysisInput, AIAnalysisResult, AIProvider } from './types.js';

export class MockAIProvider implements AIProvider {
  readonly name = 'mock';
  async health() { return { available: true, provider: this.name, model: 'mock', message: 'Mock provider available' }; }
  async analyze(input: AIAnalysisInput): Promise<AIAnalysisResult> { const evidenceIds = input.context.evidence.map((item) => item.id); return { summary: 'Mock evidence-backed investigation.', rootCause: { statement: evidenceIds.length ? 'Insufficient evidence to determine root cause.' : 'Insufficient evidence.', confidence: 0, evidenceIds: [] }, hypotheses: [], evidenceReferences: evidenceIds.slice(0, 3), reasoning: [{ statement: 'The deterministic context was received without inventing additional facts.', type: 'fact' }], impactExplanation: 'Insufficient evidence to determine observed impact.', predictionRealityExplanation: 'Insufficient evidence to compare prediction and reality.', recommendations: [], limitations: ['Mock provider output is for tests only.'] }; }
}