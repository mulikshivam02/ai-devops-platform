import type { RequestHandler } from 'express';
import { getAIHealth, getInvestigation, investigateChange, listInvestigations } from '../services/investigationService.js';
import { pathString } from '../utils/request-validation.js';
export const investigate: RequestHandler = async (request, response) => { response.status(201).json({ success: true, data: await investigateChange(pathString(request.params.changeId, 'changeId')) }); };
export const listInvestigation: RequestHandler = async (request, response) => { response.status(200).json({ success: true, data: await listInvestigations(pathString(request.params.changeId, 'changeId')) }); };
export const readInvestigation: RequestHandler = async (request, response) => { response.status(200).json({ success: true, data: await getInvestigation(pathString(request.params.id, 'investigationId')) }); };
export const aiHealth: RequestHandler = async (_request, response) => { response.status(200).json({ success: true, data: await getAIHealth() }); };