import type { RequestHandler } from 'express';
import { getHealthStatus, getLiveness, getReadiness } from '../services/health.service.js';

export const getHealth: RequestHandler = (_request, response) => {
  response.status(200).json(getHealthStatus());
};
export const getLive: RequestHandler = (_request, response) => response.status(200).json(getLiveness());
export const getReady: RequestHandler = (_request, response) => { const data = getReadiness(); response.status(data.status === 'ready' ? 200 : 503).json(data); };
