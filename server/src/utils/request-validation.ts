import mongoose from 'mongoose';
import { AppError } from './app-error.js';

export function asString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(400, `${field} must be a non-empty string.`);
  }
  return value.trim();
}

export function requiredString(value: unknown, field: string, maxLength: number): string {
  const result = asString(value, field);
  if (!result || result.length > maxLength) {
    throw new AppError(400, `${field} is required and must be at most ${maxLength} characters.`);
  }
  return result;
}

export function optionalString(value: unknown, field: string, maxLength: number): string | undefined {
  const result = asString(value, field);
  if (result && result.length > maxLength) throw new AppError(400, `${field} must be at most ${maxLength} characters.`);
  return result;
}

export function assertObjectId(value: unknown, field: string): string {
  const result = requiredString(value, field, 24);
  if (!mongoose.isValidObjectId(result)) throw new AppError(400, `${field} must be a valid MongoDB ObjectId.`);
  return result;
}

export function parseDate(value: unknown, field: string, required = false): Date | undefined {
  if (value === undefined) {
    if (required) throw new AppError(400, `${field} is required.`);
    return undefined;
  }
  const stringValue = requiredString(value, field, 64);
  const result = new Date(stringValue);
  if (Number.isNaN(result.getTime())) throw new AppError(400, `${field} must be a valid date.`);
  return result;
}

export function parseObject(value: unknown, field: string, required = false): Record<string, unknown> | undefined {
  if (value === undefined) {
    if (required) throw new AppError(400, `${field} is required.`);
    return undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AppError(400, `${field} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

export function parsePagination(query: Record<string, unknown>): { page: number; limit: number } {
  const page = parsePositiveInteger(query.page, 'page', 1);
  const limit = parsePositiveInteger(query.limit, 'limit', 25);
  if (limit > 100) throw new AppError(400, 'limit must be between 1 and 100.');
  return { page, limit };
}

function parsePositiveInteger(value: unknown, field: string, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new AppError(400, `${field} must be a positive integer.`);
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new AppError(400, `${field} must be a positive integer.`);
  return result;
}

export function parseQueryString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) throw new AppError(400, `${field} must be supplied once.`);
  return asString(value, field);
}

export function pathString(value: string | string[] | undefined, field: string): string {
  if (typeof value !== 'string') throw new AppError(400, `${field} must be supplied once.`);
  return value;
}