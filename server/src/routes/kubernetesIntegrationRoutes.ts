import { Router } from 'express';
import { authorize } from '../middleware/auth.middleware.js';
import {
  getKubernetesHealthController,
  importKubernetesWorkloadsController,
  listKubernetesNamespacesController,
  listKubernetesWorkloadsController
} from '../controllers/kubernetesIntegrationController.js';

export const kubernetesIntegrationRouter = Router();

kubernetesIntegrationRouter.get('/health', getKubernetesHealthController);
kubernetesIntegrationRouter.get('/namespaces', listKubernetesNamespacesController);
kubernetesIntegrationRouter.get('/workloads', listKubernetesWorkloadsController);
kubernetesIntegrationRouter.post('/import', authorize('operator'), importKubernetesWorkloadsController);
