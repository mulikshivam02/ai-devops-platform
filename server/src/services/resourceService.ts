import mongoose from 'mongoose';
import { ResourceModel, toResourceRecord, type ResourceHydratedDocument } from '../models/Resource.js';
import type { CreateResourceInput, ResourceFilters, ResourceRecord, UpdateResourceInput } from '../types/resource.js';
import { AppError } from '../utils/app-error.js';

function assertResourceId(id: string): void {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(400, 'Resource ID must be a valid MongoDB ObjectId.');
  }
}

function isDuplicateError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function handleDatabaseError(error: unknown): never {
  if (isDuplicateError(error)) {
    throw new AppError(409, 'A resource with the same name, type, and environment already exists.');
  }
  throw error;
}

export async function createResource(input: CreateResourceInput): Promise<ResourceRecord> {
  try {
    const resource = await ResourceModel.create(input);
    return toResourceRecord(resource);
  } catch (error: unknown) {
    return handleDatabaseError(error);
  }
}

export async function getResources(filters: ResourceFilters): Promise<ResourceRecord[]> {
  const resources = await ResourceModel.find(filters).sort({ createdAt: -1 });
  return resources.map((resource) => toResourceRecord(resource));
}

export async function getResourceById(id: string): Promise<ResourceRecord> {
  assertResourceId(id);
  const resource = await ResourceModel.findById(id);
  if (!resource) {
    throw new AppError(404, 'Resource not found.');
  }
  return toResourceRecord(resource);
}

export async function updateResource(id: string, input: UpdateResourceInput): Promise<ResourceRecord> {
  assertResourceId(id);
  try {
    const resource = await ResourceModel.findByIdAndUpdate(id, input, { new: true, runValidators: true });
    if (!resource) {
      throw new AppError(404, 'Resource not found.');
    }
    return toResourceRecord(resource as ResourceHydratedDocument);
  } catch (error: unknown) {
    return handleDatabaseError(error);
  }
}

export async function deleteResource(id: string): Promise<void> {
  assertResourceId(id);
  const result = await ResourceModel.findByIdAndDelete(id);
  if (!result) {
    throw new AppError(404, 'Resource not found.');
  }
}