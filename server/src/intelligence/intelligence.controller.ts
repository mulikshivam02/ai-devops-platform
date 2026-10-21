import type { RequestHandler } from 'express';
import {
  countHistoricalOutcomes,
  getChangeHistory,
  getDependencyPatterns,
  getHistoricalOutcomes,
  getHistoricalRisk,
  getInsight,
  getPatterns,
  getPredictionAccuracyHistory,
  getSecurityPatterns,
  getSimilarHistory,
  listInsights,
  overview,
  predictionBias,
  refreshInsights,
  remediationPerformance,
  updateInsightStatus
} from './historical-intelligence.service.js';
import { parsePagination, parseQueryString, pathString } from '../utils/request-validation.js';
import { AppError } from '../utils/app-error.js';

function windowDays(value: unknown): number | undefined {
  const parsed = parseQueryString(value, 'window');
  if (!parsed || parsed === 'all') return undefined;
  if (!['7', '30', '90'].includes(parsed)) throw new AppError(400, 'window must be 7, 30, 90, or all.');
  return Number(parsed);
}
export const getOverview: RequestHandler = async (_request, response) =>
  response.status(200).json({ success: true, data: await overview() });
// Was a side effect of the GET above -- writes AdvancedInsight documents, so it now
// needs its own operator-gated endpoint. See review 1.6.
export const refreshInsightsController: RequestHandler = async (_request, response) =>
  response.status(200).json({ success: true, data: await refreshInsights() });
export const getSimilar: RequestHandler = async (request, response) =>
  response
    .status(200)
    .json({ success: true, data: await getSimilarHistory(pathString(request.params.changeId, 'changeId')) });
export const getChangeHistoryController: RequestHandler = async (request, response) =>
  response
    .status(200)
    .json({ success: true, data: await getChangeHistory(pathString(request.params.changeId, 'changeId')) });
export const getResourceHistory: RequestHandler = async (request, response) => {
  const { page, limit } = parsePagination(request.query);
  const resourceId = pathString(request.params.resourceId, 'resourceId');
  const [data, total] = await Promise.all([
    getHistoricalOutcomes(resourceId, page * limit),
    countHistoricalOutcomes(resourceId)
  ]);
  response.status(200).json({
    success: true,
    data: data.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
};
export const getRiskTrends: RequestHandler = async (request, response) =>
  response.status(200).json({
    success: true,
    data: await getHistoricalRisk(pathString(request.params.resourceId, 'resourceId'), windowDays(request.query.window))
  });
export const getPredictionAccuracy: RequestHandler = async (request, response) =>
  response.status(200).json({
    success: true,
    data: await getPredictionAccuracyHistory(pathString(request.params.resourceId, 'resourceId'))
  });
export const getPatternsController: RequestHandler = async (request, response) =>
  response
    .status(200)
    .json({ success: true, data: await getPatterns(parseQueryString(request.query.resourceId, 'resourceId')) });
export const getInsights: RequestHandler = async (request, response) => {
  const { page, limit } = parsePagination(request.query);
  const result = await listInsights(page, limit, parseQueryString(request.query.status, 'status'));
  response.status(200).json({ success: true, data: result.data, pagination: result.pagination });
};
export const getInsightController: RequestHandler = async (request, response) =>
  response.status(200).json({ success: true, data: await getInsight(pathString(request.params.id, 'id')) });
export const acknowledgeInsight: RequestHandler = async (request, response) =>
  response
    .status(200)
    .json({ success: true, data: await updateInsightStatus(pathString(request.params.id, 'id'), 'acknowledged') });
export const dismissInsight: RequestHandler = async (request, response) =>
  response
    .status(200)
    .json({ success: true, data: await updateInsightStatus(pathString(request.params.id, 'id'), 'dismissed') });
export const getRemediationPerformance: RequestHandler = async (_request, response) =>
  response.status(200).json({ success: true, data: await remediationPerformance() });
export const getSecurityPatternsController: RequestHandler = async (_request, response) =>
  response.status(200).json({ success: true, data: await getSecurityPatterns() });
export const getDependencyPatternsController: RequestHandler = async (_request, response) =>
  response.status(200).json({ success: true, data: await getDependencyPatterns() });
export const getPredictionBias: RequestHandler = async (request, response) =>
  response
    .status(200)
    .json({ success: true, data: await predictionBias(pathString(request.params.resourceId, 'resourceId')) });
