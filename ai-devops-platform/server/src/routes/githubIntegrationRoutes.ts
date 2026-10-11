import { Router } from 'express';
import { authorize } from '../middleware/auth.middleware.js';
import {
  getGitHubCommitsController,
  getGitHubRepositoryController,
  importGitHubCommitsController
} from '../controllers/githubIntegrationController.js';

export const githubIntegrationRouter = Router();

githubIntegrationRouter.get('/repository', getGitHubRepositoryController);
githubIntegrationRouter.get('/commits', getGitHubCommitsController);
githubIntegrationRouter.post('/import', authorize('operator'), importGitHubCommitsController);
