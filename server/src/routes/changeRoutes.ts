import { Router } from 'express';
import { getChange, listChanges, listResourceChanges, patchChangeStatus, postChange } from '../controllers/changeController.js';

export const changeRouter = Router();
export const resourceChangeRouter = Router({ mergeParams: true });

changeRouter.post('/', postChange);
changeRouter.get('/', listChanges);
changeRouter.get('/:id', getChange);
changeRouter.patch('/:id/status', patchChangeStatus);
resourceChangeRouter.get('/', listResourceChanges);