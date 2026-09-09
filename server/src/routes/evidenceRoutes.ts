import { Router } from 'express';
import { getEvidenceItem, listEvidence, listResourceEvidence, postEvidence, removeEvidence } from '../controllers/evidenceController.js';

export const evidenceRouter = Router();
export const resourceEvidenceRouter = Router({ mergeParams: true });

evidenceRouter.post('/', postEvidence);
evidenceRouter.get('/', listEvidence);
evidenceRouter.get('/:id', getEvidenceItem);
evidenceRouter.delete('/:id', removeEvidence);
resourceEvidenceRouter.get('/', listResourceEvidence);