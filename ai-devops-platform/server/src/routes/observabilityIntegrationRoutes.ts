import { Router } from 'express';
import { authorize } from '../middleware/auth.middleware.js';
import { importObservabilityController } from '../controllers/observabilityIntegrationController.js';

export const observabilityIntegrationRouter = Router();
observabilityIntegrationRouter.post('/import', authorize('operator'), importObservabilityController);
