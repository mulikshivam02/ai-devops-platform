import { Router } from 'express';
import {
  getResource,
  listResources,
  patchResource,
  postResource,
  removeResource
} from '../controllers/resourceController.js';

export const resourceRouter = Router();

resourceRouter.get('/', listResources);
resourceRouter.get('/:id', getResource);
resourceRouter.post('/', postResource);
resourceRouter.patch('/:id', patchResource);
resourceRouter.delete('/:id', removeResource);