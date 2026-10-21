import { Router } from 'express';
import { authorize } from '../middleware/auth.middleware.js';
import {
  analyzeChangeController,
  evaluateChangeController,
  getChangeIntelligenceController
} from './changeIntelligence.controller.js';
import { changeAccuracy, historySummary, similarHistory } from './historical.controller.js';
import {
  acknowledgeInsight,
  dismissInsight,
  getChangeHistoryController,
  getDependencyPatternsController,
  getInsightController,
  getInsights,
  getOverview,
  getPatternsController,
  getPredictionAccuracy,
  getPredictionBias,
  getRemediationPerformance,
  getResourceHistory,
  getRiskTrends,
  getSecurityPatternsController,
  getSimilar,
  refreshInsightsController
} from './intelligence.controller.js';
export const intelligenceRouter = Router();
intelligenceRouter.post('/changes/:changeId/analyze', authorize('operator'), analyzeChangeController);
intelligenceRouter.post('/changes/:changeId/evaluate', authorize('operator'), evaluateChangeController);
intelligenceRouter.get('/changes/:changeId', getChangeIntelligenceController);
intelligenceRouter.get('/history/summary', historySummary);
intelligenceRouter.get('/history/similar/:changeId', similarHistory);
intelligenceRouter.get('/history/accuracy/:changeId', changeAccuracy);
intelligenceRouter.get('/overview', getOverview);
intelligenceRouter.post('/insights/refresh', authorize('operator'), refreshInsightsController);
intelligenceRouter.get('/changes/:changeId/similar', getSimilar);
intelligenceRouter.get('/changes/:changeId/history', getChangeHistoryController);
intelligenceRouter.get('/resources/:resourceId/history', getResourceHistory);
intelligenceRouter.get('/resources/:resourceId/risk-trends', getRiskTrends);
intelligenceRouter.get('/resources/:resourceId/prediction-accuracy', getPredictionAccuracy);
intelligenceRouter.get('/resources/:resourceId/prediction-bias', getPredictionBias);
intelligenceRouter.get('/patterns', getPatternsController);
intelligenceRouter.get('/insights', getInsights);
intelligenceRouter.get('/insights/:id', getInsightController);
intelligenceRouter.post('/insights/:id/acknowledge', acknowledgeInsight);
intelligenceRouter.post('/insights/:id/dismiss', dismissInsight);
intelligenceRouter.get('/remediation-performance', getRemediationPerformance);
intelligenceRouter.get('/security-patterns', getSecurityPatternsController);
intelligenceRouter.get('/dependency-patterns', getDependencyPatternsController);
