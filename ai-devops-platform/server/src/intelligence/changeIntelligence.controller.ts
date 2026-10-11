import type { RequestHandler } from 'express';
import { evaluateChangeReality, analyzeChange, getChangeIntelligence } from './changeIntelligence.service.js';
import { parseObject, pathString } from '../utils/request-validation.js';

export const analyzeChangeController: RequestHandler = async (request, response) => {
  response
    .status(200)
    .json({ success: true, data: await analyzeChange(pathString(request.params.changeId, 'changeId')) });
};

export const evaluateChangeController: RequestHandler = async (request, response) => {
  const body = parseObject(request.body, 'Request body') ?? {};
  const start = typeof body.start === 'string' ? body.start : undefined;
  const end = typeof body.end === 'string' ? body.end : undefined;
  response.status(200).json({
    success: true,
    data: await evaluateChangeReality(pathString(request.params.changeId, 'changeId'), {
      ...(start ? { start } : {}),
      ...(end ? { end } : {})
    })
  });
};

export const getChangeIntelligenceController: RequestHandler = async (request, response) => {
  response
    .status(200)
    .json({ success: true, data: await getChangeIntelligence(pathString(request.params.changeId, 'changeId')) });
};
