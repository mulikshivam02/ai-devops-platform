import { Router } from 'express';
import { aiHealth, investigate, listInvestigation, readInvestigation } from '../controllers/investigationController.js';
export const investigationRouter = Router({ mergeParams: true });
investigationRouter.post('/investigate', investigate);
investigationRouter.get('/investigations', listInvestigation);
export const investigationByIdRouter = Router(); investigationByIdRouter.get('/:id', readInvestigation);
export const aiHealthRouter = Router(); aiHealthRouter.get('/', aiHealth);