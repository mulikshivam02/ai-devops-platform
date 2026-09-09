import type { RequestHandler } from 'express';
import { analyzeChange, getAnalysisById, getLatestAnalysis, listAnalyses } from '../services/changeAnalysisService.js';
import { parsePagination, parseQueryString, pathString } from '../utils/request-validation.js';

export const analyzeChangeController: RequestHandler = async (request, response) => {
  const data = await analyzeChange(pathString(request.params.changeId, 'changeId'));
  response.status(200).json({ success: true, data });
};

export const getChangeAnalysis: RequestHandler = async (request, response) => {
  const data = await getLatestAnalysis(pathString(request.params.changeId, 'changeId'));
  response.status(200).json({ success: true, data });
};

export const listChangeAnalyses: RequestHandler = async (request, response) => {
  const { page, limit } = parsePagination(request.query as Record<string, unknown>);
  const data = await listAnalyses(parseQueryString(request.query.changeId, 'changeId'), parseQueryString(request.query.resourceId, 'resourceId'), page, limit);
  response.status(200).json({ success: true, data: data.data, pagination: data.pagination });
};

export const getAnalysis: RequestHandler = async (request, response) => {
  const data = await getAnalysisById(pathString(request.params.id, 'analysisId'));
  response.status(200).json({ success: true, data });
};