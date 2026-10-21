import { Router } from 'express';
import { getDashboardSummaryController } from './dashboard.controller.js';

export const dashboardRouter = Router();
dashboardRouter.get('/summary', getDashboardSummaryController);
