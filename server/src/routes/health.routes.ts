import { Router } from 'express';
import { getHealth, getLive, getReady } from '../controllers/health.controller.js';

export const healthRouter = Router();

healthRouter.get('/', getHealth);
healthRouter.get('/live', getLive);
healthRouter.get('/ready', getReady);
