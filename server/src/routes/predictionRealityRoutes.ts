import { Router } from 'express';
import { postPrediction, postObservation, postComparison, readPrediction, readObservations, readComparison, readPredictionById, readObservationById, readComparisonById } from '../controllers/predictionRealityController.js';

export const predictionRealityRouter = Router({ mergeParams: true });
predictionRealityRouter.post('/prediction', postPrediction);
predictionRealityRouter.get('/prediction', readPrediction);
predictionRealityRouter.post('/observations', postObservation);
predictionRealityRouter.get('/observations', readObservations);
predictionRealityRouter.post('/compare', postComparison);
predictionRealityRouter.get('/comparison', readComparison);

export const predictionRouter = Router();
export const observationRouter = Router();
export const comparisonRouter = Router();
predictionRouter.get('/:id', readPredictionById);
observationRouter.get('/:id', readObservationById);
comparisonRouter.get('/:id', readComparisonById);