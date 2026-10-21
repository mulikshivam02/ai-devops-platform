import { Router } from 'express';
import { authorize } from '../middleware/auth.middleware.js';
import {
  getLokiHealthController,
  importLokiController,
  queryLokiController
} from '../controllers/lokiIntegrationController.js';

export const lokiIntegrationRouter = Router();
lokiIntegrationRouter.get('/health', getLokiHealthController);
lokiIntegrationRouter.get('/query', queryLokiController);
lokiIntegrationRouter.post('/import', authorize('operator'), importLokiController);
