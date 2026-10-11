import { beforeEach, describe, expect, it, vi } from 'vitest';

const changeModel = vi.hoisted(() => ({ findById: vi.fn() }));
const evidenceModel = vi.hoisted(() => ({ find: vi.fn() }));
const changeAnalysis = vi.hoisted(() => ({ analyzeChange: vi.fn(), getLatestAnalysis: vi.fn() }));
const security = vi.hoisted(() => ({
  analyzeChangeSecurity: vi.fn(),
  getSecurityFindingsForChange: vi.fn(),
  getSecuritySummary: vi.fn()
}));
const prediction = vi.hoisted(() => ({
  getOrCreatePrediction: vi.fn(),
  evaluateReality: vi.fn(),
  getPrediction: vi.fn(),
  getObservations: vi.fn(),
  getComparison: vi.fn()
}));
const resources = vi.hoisted(() => ({ getResourceById: vi.fn() }));
const investigations = vi.hoisted(() => ({ investigateChange: vi.fn(), listInvestigations: vi.fn() }));
const history = vi.hoisted(() => ({
  findSimilarChanges: vi.fn(),
  getHistoricalRisk: vi.fn(),
  getPredictionAccuracyHistory: vi.fn(),
  getPatterns: vi.fn()
}));
const historicalOutcome = vi.hoisted(() => ({
  getHistoricalOutcomeForChange: vi.fn(),
  persistHistoricalOutcome: vi.fn()
}));

vi.mock('../src/models/Change.js', () => ({ ChangeModel: changeModel, toChangeDTO: (value: any) => value.dto }));
vi.mock('../src/models/Evidence.js', () => ({ EvidenceModel: evidenceModel, toEvidenceDTO: (value: any) => value }));
vi.mock('../src/services/changeAnalysisService.js', () => changeAnalysis);
vi.mock('../src/services/securityAnalysisService.js', () => security);
vi.mock('../src/services/predictionRealityService.js', () => prediction);
vi.mock('../src/services/resourceService.js', () => resources);
vi.mock('../src/services/investigationService.js', () => investigations);
vi.mock('../src/intelligence/historical-intelligence.service.js', () => history);
vi.mock('../src/intelligence/historical-outcome.service.js', () => historicalOutcome);

const { analyzeChange, evaluateChangeReality, getChangeIntelligence } =
  await import('../src/intelligence/changeIntelligence.service.js');

const change = {
  _id: '507f1f77bcf86cd799439011',
  resourceId: '507f1f77bcf86cd799439012',
  evidenceIds: ['507f1f77bcf86cd799439013'],
  timestamp: new Date('2026-09-14T00:00:00.000Z'),
  dto: {
    id: '507f1f77bcf86cd799439011',
    resourceId: '507f1f77bcf86cd799439012',
    evidenceIds: ['507f1f77bcf86cd799439013'],
    summary: 'Update deployment',
    changeType: 'deployment',
    source: 'github',
    author: 'operator',
    timestamp: '2026-09-14T00:00:00.000Z',
    metadata: {},
    changeId: 'github:demo:abc',
    status: 'detected',
    createdAt: '2026-09-14T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z'
  }
};
const analysis = {
  id: '507f1f77bcf86cd799439014',
  changeId: '507f1f77bcf86cd799439011',
  resourceId: '507f1f77bcf86cd799439012',
  risk: { score: 72, level: 'high', factors: [] },
  changedItems: [],
  directlyAffectedResourceIds: ['507f1f77bcf86cd799439012'],
  transitivelyAffectedResourceIds: ['507f1f77bcf86cd799439015'],
  blastRadius: { directCount: 0, transitiveCount: 1, totalCount: 2, maxDependencyDepth: 1 },
  impact: { categories: ['deployment'], summary: 'potential impact' },
  rollback: { available: true, source: 'before', description: 'available' },
  evidenceIds: ['507f1f77bcf86cd799439013'],
  analysisVersion: '1.0'
};
const predictionSnapshot = {
  id: '507f1f77bcf86cd799439016',
  changeId: '507f1f77bcf86cd799439011',
  analysisId: '507f1f77bcf86cd799439014',
  resourceId: '507f1f77bcf86cd799439012',
  predictedAt: '2026-09-14T00:00:00.000Z',
  predictedRisk: analysis.risk,
  predictedImpact: analysis.impact,
  predictedBlastRadius: analysis.blastRadius,
  predictedResourceIds: ['507f1f77bcf86cd799439012', '507f1f77bcf86cd799439015'],
  predictedSecurityFindings: [],
  predictionVersion: '1.0',
  metadata: {},
  createdAt: '2026-09-14T00:00:00.000Z',
  updatedAt: '2026-09-14T00:00:00.000Z'
};
const observation = {
  id: '507f1f77bcf86cd799439017',
  changeId: '507f1f77bcf86cd799439011',
  predictionId: '507f1f77bcf86cd799439016',
  resourceId: '507f1f77bcf86cd799439012',
  observationWindow: { start: '2026-09-14T00:00:00.000Z', end: '2026-09-14T01:00:00.000Z' },
  evidenceIds: ['507f1f77bcf86cd799439013'],
  observedImpact: { categories: [], summary: 'Insufficient evidence' },
  observedResources: [],
  observedMetrics: [],
  observedEvents: [],
  observedFailures: [],
  observedSecurityFindings: [],
  status: 'insufficient_evidence'
};
const comparison = {
  id: '507f1f77bcf86cd799439018',
  changeId: '507f1f77bcf86cd799439011',
  predictionId: '507f1f77bcf86cd799439016',
  observationId: '507f1f77bcf86cd799439017',
  comparedAt: '2026-09-14T01:00:00.000Z',
  outcome: 'insufficient_evidence',
  impactComparison: {
    predictedCategories: ['deployment'],
    observedCategories: [],
    confirmedCategories: [],
    unconfirmedCategories: ['deployment'],
    unexpectedCategories: []
  },
  resourceComparison: {
    predictedResourceIds: [],
    observedResourceIds: [],
    confirmedResourceIds: [],
    unexpectedResourceIds: []
  },
  securityComparison: { predicted: [], observed: [], confirmed: [], unexpected: [], status: 'insufficient_evidence' },
  metricComparison: [],
  blastRadiusComparison: { predictedTotal: 2, observedTotal: null, delta: null },
  riskComparison: { predictedScore: 72, observedSeverity: 'unknown', explanation: 'Insufficient evidence' },
  accuracy: { score: null, level: 'insufficient_evidence' },
  summary: 'Insufficient evidence',
  evidenceIds: []
};

beforeEach(() => {
  vi.clearAllMocks();
  changeModel.findById.mockResolvedValue(change);
  evidenceModel.find.mockReturnValue({
    sort: () => ({
      limit: async () => [
        {
          id: '507f1f77bcf86cd799439013',
          source: 'github',
          evidenceType: 'git',
          timestamp: '2026-09-14T00:00:00.000Z',
          correlationId: 'correlation'
        }
      ]
    })
  });
  resources.getResourceById.mockResolvedValue({
    id: '507f1f77bcf86cd799439012',
    name: 'Demo service',
    type: 'kubernetes_cluster',
    status: 'active',
    metadata: {},
    enabled: true,
    createdAt: '',
    updatedAt: ''
  });
  changeAnalysis.analyzeChange.mockResolvedValue(analysis);
  changeAnalysis.getLatestAnalysis.mockResolvedValue(analysis);
  security.analyzeChangeSecurity.mockResolvedValue({ findings: [], summary: {} });
  security.getSecurityFindingsForChange.mockResolvedValue({
    data: [],
    pagination: { page: 1, limit: 100, total: 0, pages: 0 }
  });
  security.getSecuritySummary.mockResolvedValue({
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    open: 0,
    affectedResources: 0,
    categories: {},
    highestSeverity: 'unknown',
    riskContribution: 0
  });
  prediction.getOrCreatePrediction.mockResolvedValue(predictionSnapshot);
  prediction.getPrediction.mockResolvedValue(predictionSnapshot);
  prediction.getObservations.mockResolvedValue([observation]);
  prediction.getComparison.mockResolvedValue(comparison);
  prediction.evaluateReality.mockResolvedValue({ observation, comparison });
  investigations.listInvestigations.mockResolvedValue([]);
  investigations.investigateChange.mockResolvedValue({
    id: 'investigation-id',
    status: 'completed',
    summary: 'Evidence-backed investigation'
  });
  history.findSimilarChanges.mockResolvedValue([]);
  history.getHistoricalRisk.mockResolvedValue({ status: 'insufficient_evidence' });
  history.getPredictionAccuracyHistory.mockResolvedValue({ status: 'insufficient_evidence' });
  history.getPatterns.mockResolvedValue([]);
  historicalOutcome.getHistoricalOutcomeForChange.mockResolvedValue(null);
  historicalOutcome.persistHistoricalOutcome.mockResolvedValue(null);
});

describe('change intelligence orchestration', () => {
  it('fails when the Change is missing', async () => {
    changeModel.findById.mockResolvedValue(null);
    await expect(analyzeChange('507f1f77bcf86cd799439011')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('composes deterministic analysis, risk, dependency impact, security, prediction, and AI', async () => {
    const result = await analyzeChange('507f1f77bcf86cd799439011');
    expect(result.risk?.score).toBe(72);
    expect(result.dependencyImpact?.transitivelyAffectedResourceIds).toEqual(['507f1f77bcf86cd799439015']);
    expect(result.prediction?.id).toBe('507f1f77bcf86cd799439016');
    expect(result.aiInvestigation.status).toBe('completed');
    expect(changeAnalysis.analyzeChange).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    expect(security.analyzeChangeSecurity).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
  });

  it('continues deterministic analysis when optional security, history, and AI are unavailable', async () => {
    security.analyzeChangeSecurity.mockRejectedValue(new Error('security unavailable'));
    history.getHistoricalRisk.mockRejectedValue(new Error('history unavailable'));
    investigations.investigateChange.mockRejectedValue(new Error('AI unavailable'));
    const result = await analyzeChange('507f1f77bcf86cd799439011');
    expect(result.risk?.score).toBe(72);
    expect(result.aiInvestigation.status).toBe('unavailable');
    expect(result.historicalLearning.status).toBe('insufficient_evidence');
  });

  it('evaluates reality and returns insufficient evidence without inventing impact', async () => {
    const result = await evaluateChangeReality('507f1f77bcf86cd799439011');
    expect(prediction.evaluateReality).toHaveBeenCalledWith('507f1f77bcf86cd799439011', {});
    expect(historicalOutcome.persistHistoricalOutcome).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      predictionSnapshot,
      observation,
      comparison
    );
    expect(result.reality?.status).toBe('insufficient_evidence');
    expect(result.predictionVsReality?.outcome).toBe('insufficient_evidence');
  });

  it('returns the consolidated view for GET without running mutations', async () => {
    const result = await getChangeIntelligence('507f1f77bcf86cd799439011');
    expect(result.change.id).toBe('507f1f77bcf86cd799439011');
    expect(changeAnalysis.analyzeChange).not.toHaveBeenCalled();
    expect(prediction.evaluateReality).not.toHaveBeenCalled();
  });
});
