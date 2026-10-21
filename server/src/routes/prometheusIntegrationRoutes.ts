import { Router } from 'express';
import { authorize } from '../middleware/auth.middleware.js';
import {
  getPrometheusHealthController,
  importPrometheusController,
  queryPrometheusController
} from '../controllers/prometheusIntegrationController.js';

export const prometheusIntegrationRouter = Router();
prometheusIntegrationRouter.get('/health', getPrometheusHealthController);
prometheusIntegrationRouter.get('/query', queryPrometheusController);
// Was GET. A GET that writes Evidence documents is reachable by a viewer (the
// global authorizeRequest minimum for GET) and is cacheable/CSRF-able besides.
// See review 1.5.
prometheusIntegrationRouter.post('/import', authorize('operator'), importPrometheusController);
