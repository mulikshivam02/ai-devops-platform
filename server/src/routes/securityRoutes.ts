import { Router } from 'express';
import { analyzeChangeSecurityController, getSecurity, listChangeSecurity, listResourceSecurity, listSecurity, patchSecurity, postSecurityFinding, removeSecurity, securitySummary } from '../controllers/securityController.js';
export const securityRouter = Router();
export const changeSecurityRouter = Router({ mergeParams: true });
export const resourceSecurityRouter = Router({ mergeParams: true });
securityRouter.post('/findings', postSecurityFinding); securityRouter.get('/findings', listSecurity); securityRouter.get('/findings/:id', getSecurity); securityRouter.patch('/findings/:id', patchSecurity); securityRouter.delete('/findings/:id', removeSecurity); securityRouter.get('/summary', securitySummary);
changeSecurityRouter.get('/security-findings', listChangeSecurity); changeSecurityRouter.post('/security-analysis', analyzeChangeSecurityController);
resourceSecurityRouter.get('/security-findings', listResourceSecurity);