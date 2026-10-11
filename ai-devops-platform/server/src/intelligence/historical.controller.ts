import type { RequestHandler } from 'express';
import { pathString } from '../utils/request-validation.js';
import { findSimilarChanges } from './historical-intelligence.service.js';
import {
  getHistoricalAccuracy,
  getHistoricalOutcomeForChange,
  getHistoricalSummary
} from './historical-outcome.service.js';
import { HistoricalOutcomeModel, toHistoricalOutcomeDTO } from '../models/HistoricalOutcome.js';

export const historySummary: RequestHandler = async (_request, response) =>
  response.status(200).json({ success: true, data: await getHistoricalSummary() });
export const similarHistory: RequestHandler = async (request, response) => {
  const similar = await findSimilarChanges(pathString(request.params.changeId, 'changeId'), 10);
  const outcomes = await HistoricalOutcomeModel.find({ changeId: { $in: similar.map((item) => item.changeId) } })
    .sort({ evaluatedAt: -1 })
    .limit(10);
  const outcomeMap = new Map(outcomes.map((item) => [item.changeId.toString(), toHistoricalOutcomeDTO(item)]));
  response.status(200).json({
    success: true,
    data: similar.map((item) => ({ ...item, historicalOutcome: outcomeMap.get(item.changeId) }))
  });
};
export const changeAccuracy: RequestHandler = async (request, response) =>
  response
    .status(200)
    .json({ success: true, data: await getHistoricalAccuracy(pathString(request.params.changeId, 'changeId')) });
export const changeHistoricalOutcome: RequestHandler = async (request, response) =>
  response.status(200).json({
    success: true,
    data: await getHistoricalOutcomeForChange(pathString(request.params.changeId, 'changeId'))
  });
