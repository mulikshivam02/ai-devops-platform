import { Router } from 'express';
import { getDependency, getResourceGraph, listDependencies, listResourceDependencies, listResourceDependents, patchDependency, postDependency, removeDependency } from '../controllers/dependencyController.js';

export const dependencyRouter = Router();
export const resourceDependencyRouter = Router({ mergeParams: true });

dependencyRouter.post('/', postDependency);
dependencyRouter.get('/', listDependencies);
dependencyRouter.get('/:id', getDependency);
dependencyRouter.patch('/:id', patchDependency);
dependencyRouter.delete('/:id', removeDependency);

resourceDependencyRouter.get('/dependency-graph', getResourceGraph);
resourceDependencyRouter.get('/dependencies', listResourceDependencies);
resourceDependencyRouter.get('/dependents', listResourceDependents);