import type { RequestHandler } from 'express';
import { getDashboardSummary } from './dashboard.service.js';

export const getDashboardSummaryController: RequestHandler = async (_request, response) => {
  response.status(200).json({ success: true, data: await getDashboardSummary() });
};
