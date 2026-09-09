import mongoose, { Types } from 'mongoose';
import { DependencyModel, toDependencyDTO, type DependencyHydratedDocument } from '../models/Dependency.js';
import { EvidenceModel } from '../models/Evidence.js';
import { ResourceModel } from '../models/Resource.js';
import type { DependencyDTO, DependencyFilters, DependencyGraph, CreateDependencyInput, GraphEdge, GraphNode, UpdateDependencyInput } from '../types/dependency.js';
import type { PaginatedResult } from '../types/pagination.js';
import { AppError } from '../utils/app-error.js';
import { sanitizeObject } from '../utils/sensitive-data.js';

const MAX_DEPTH = 10;

function assertObjectId(id: string, field: string): Types.ObjectId {
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, `${field} must be a valid MongoDB ObjectId.`);
  return new Types.ObjectId(id);
}

async function assertResource(id: string, field: string): Promise<Types.ObjectId> {
  const objectId = assertObjectId(id, field);
  if (!(await ResourceModel.exists({ _id: objectId }))) throw new AppError(404, 'Resource not found.');
  return objectId;
}

async function validateEvidenceIds(ids: string[] = []): Promise<Types.ObjectId[]> {
  const uniqueIds = [...new Set(ids)];
  const objectIds = uniqueIds.map((id) => assertObjectId(id, 'evidenceIds'));
  if (objectIds.length !== await EvidenceModel.countDocuments({ _id: { $in: objectIds } })) {
    throw new AppError(404, 'One or more evidence records were not found.');
  }
  return objectIds;
}

function assertConfidence(confidence: number | undefined): number {
  const value = confidence ?? 1;
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new AppError(400, 'confidence must be between 0 and 1.');
  return value;
}

function assertDepth(depth: number): number {
  if (!Number.isInteger(depth) || depth < 1 || depth > MAX_DEPTH) throw new AppError(400, `depth must be between 1 and ${MAX_DEPTH}.`);
  return depth;
}

function handleDuplicate(error: unknown): never {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
    throw new AppError(409, 'This dependency relationship already exists.');
  }
  throw error;
}

export async function createDependency(input: CreateDependencyInput): Promise<DependencyDTO> {
  const sourceResourceId = await assertResource(input.sourceResourceId, 'sourceResourceId');
  const targetResourceId = await assertResource(input.targetResourceId, 'targetResourceId');
  if (sourceResourceId.equals(targetResourceId)) throw new AppError(400, 'A resource cannot depend on itself.');
  const evidenceIds = await validateEvidenceIds(input.evidenceIds);
  try {
    const dependency = await DependencyModel.create({
      ...input,
      sourceResourceId,
      targetResourceId,
      evidenceIds,
      confidence: assertConfidence(input.confidence),
      direction: 'source_to_target',
      metadata: sanitizeObject(input.metadata)
    });
    return toDependencyDTO(dependency);
  } catch (error: unknown) {
    return handleDuplicate(error);
  }
}

export async function getDependencies(filters: DependencyFilters, page: number, limit: number): Promise<PaginatedResult<DependencyDTO>> {
  const query: Record<string, unknown> = {};
  if (filters.sourceResourceId) query.sourceResourceId = assertObjectId(filters.sourceResourceId, 'sourceResourceId');
  if (filters.targetResourceId) query.targetResourceId = assertObjectId(filters.targetResourceId, 'targetResourceId');
  if (filters.relationshipType) query.relationshipType = filters.relationshipType;
  if (filters.origin) query.origin = filters.origin;
  const [records, total] = await Promise.all([
    DependencyModel.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    DependencyModel.countDocuments(query)
  ]);
  return { data: records.map((record) => toDependencyDTO(record as DependencyHydratedDocument)), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function getDependencyById(id: string): Promise<DependencyDTO> {
  assertObjectId(id, 'dependencyId');
  const dependency = await DependencyModel.findById(id);
  if (!dependency) throw new AppError(404, 'Dependency not found.');
  return toDependencyDTO(dependency);
}

export async function updateDependency(id: string, input: UpdateDependencyInput): Promise<DependencyDTO> {
  assertObjectId(id, 'dependencyId');
  const update: Record<string, unknown> = {};
  if (input.relationshipType !== undefined) update.relationshipType = input.relationshipType;
  if (input.origin !== undefined) update.origin = input.origin;
  if (input.confidence !== undefined) update.confidence = assertConfidence(input.confidence);
  if (input.evidenceIds !== undefined) update.evidenceIds = await validateEvidenceIds(input.evidenceIds);
  if (input.metadata !== undefined) update.metadata = sanitizeObject(input.metadata);
  try {
    const dependency = await DependencyModel.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    if (!dependency) throw new AppError(404, 'Dependency not found.');
    return toDependencyDTO(dependency);
  } catch (error: unknown) {
    return handleDuplicate(error);
  }
}

export async function deleteDependency(id: string): Promise<void> {
  assertObjectId(id, 'dependencyId');
  if (!(await DependencyModel.findByIdAndDelete(id))) throw new AppError(404, 'Dependency not found.');
}

export function getResourceDependencies(resourceId: string, depth: number): Promise<DependencyDTO[]> {
  return traverse(resourceId, depth, 'dependencies');
}

export function getResourceDependents(resourceId: string, depth: number): Promise<DependencyDTO[]> {
  return traverse(resourceId, depth, 'dependents');
}

async function traverse(resourceId: string, depth: number, direction: 'dependencies' | 'dependents'): Promise<DependencyDTO[]> {
  const root = await assertResource(resourceId, 'resourceId');
  assertDepth(depth);
  const visited = new Set<string>([root.toString()]);
  const resultIds = new Set<string>();
  const result: DependencyDTO[] = [];
  let frontier = [root.toString()];
  for (let level = 0; level < depth && frontier.length > 0; level += 1) {
    const query = direction === 'dependencies' ? { sourceResourceId: { $in: frontier } } : { targetResourceId: { $in: frontier } };
    const edges = await DependencyModel.find(query).sort({ createdAt: 1, _id: 1 });
    const next: string[] = [];
    for (const edge of edges) {
      const nextId = direction === 'dependencies' ? edge.targetResourceId.toString() : edge.sourceResourceId.toString();
      if (!resultIds.has(edge._id.toString())) {
        resultIds.add(edge._id.toString());
        result.push(toDependencyDTO(edge));
      }
      if (!visited.has(nextId)) {
        visited.add(nextId);
        next.push(nextId);
      }
    }
    frontier = next;
  }
  return result;
}

export async function getDependencyGraph(resourceId: string, depth: number, direction: 'dependencies' | 'dependents' = 'dependencies'): Promise<DependencyGraph> {
  const root = await assertResource(resourceId, 'resourceId');
  assertDepth(depth);
  const traversed = direction === 'dependencies' ? await getResourceDependencies(resourceId, depth) : await getResourceDependents(resourceId, depth);
  const edgeMap = new Map<string, DependencyDTO>();
  traversed.forEach((edge) => edgeMap.set(edge.id, edge));
  const ids = new Set<string>([root.toString()]);
  traversed.forEach((edge) => { ids.add(edge.sourceResourceId); ids.add(edge.targetResourceId); });
  const resources = await ResourceModel.find({ _id: { $in: [...ids].map((id) => new Types.ObjectId(id)) } }).select({ name: 1, type: 1 }).lean();
  const resourceMap = new Map(resources.map((resource) => [resource._id.toString(), resource]));
  const nodes: GraphNode[] = [...ids].map((id) => {
    const resource = resourceMap.get(id);
    return { id, name: resource?.name ?? 'Unknown resource', type: resource?.type ?? 'unknown' };
  });
  const edges: GraphEdge[] = [...edgeMap.values()].map((edge) => ({ id: edge.id, source: edge.sourceResourceId, target: edge.targetResourceId, relationshipType: edge.relationshipType, origin: edge.origin, confidence: edge.confidence }));
  return { rootResourceId: root.toString(), depth, direction, nodes, edges };
}