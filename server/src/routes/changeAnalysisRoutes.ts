import { Router } from 'express';
import { analyzeChangeController, getAnalysis, getChangeAnalysis, listChangeAnalyses } from '../controllers/changeAnalysisController.js';

export const changeAnalysisRouter = Router();
export const changeRouterAnalysis = Router({ mergeParams: true });

changeAnalysisRouter.get('/', listChangeAnalyses);
changeAnalysisRouter.get('/:id', getAnalysis);
changeRouterAnalysis.post('/analyze', analyzeChangeController);
changeRouterAnalysis.get('/analysis', getChangeAnalysis);