import type { RequestHandler } from 'express';
import {
  createResource,
  deleteResource,
  getResourceById,
  getResources,
  updateResource
} from '../services/resourceService.js';
import {
  resourceStatuses,
  resourceTypes,
  type CreateResourceInput,
  type ResourceFilters,
  type UpdateResourceInput
} from '../types/resource.js';
import { AppError } from '../utils/app-error.js';

const optionalTextFields = ['provider', 'environment', 'description'] as const;
const updateFields = ['name', 'type', 'provider', 'environment', 'status', 'description', 'enabled'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getResourceId(value: string | string[] | undefined): string {
  if (typeof value !== 'string') {
    throw new AppError(400, 'Resource ID must be a valid MongoDB ObjectId.');
  }

  return value;
}

function validateText(
  value: unknown,
  field: string,
  maxLength: number
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.trim().length > maxLength
  ) {
    throw new AppError(
      400,
      `${field} must be a non-empty string of at most ${maxLength} characters.`
    );
  }

  return value.trim();
}

function validateEnum<T extends string>(
  value: unknown,
  field: string,
  values: readonly T[]
): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new AppError(
      400,
      `${field} must be one of: ${values.join(', ')}.`
    );
  }

  return value as T;
}

function validateBoolean(
  value: unknown,
  field: string
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new AppError(400, `${field} must be a boolean.`);
  }

  return value;
}

function parseResourceInput(
  body: unknown,
  partial: boolean
): CreateResourceInput | UpdateResourceInput {
  if (!isRecord(body)) {
    throw new AppError(400, 'Request body must be a JSON object.');
  }

  const unknownFields = Object.keys(body).filter(
    (key) => !updateFields.includes(key as (typeof updateFields)[number])
  );

  if (unknownFields.length > 0) {
    throw new AppError(
      400,
      `Unsupported resource field: ${unknownFields[0]}.`
    );
  }

  if (!partial && body.name === undefined) {
    throw new AppError(400, 'name is required.');
  }

  const name = validateText(body.name, 'name', 120);
  const type = validateEnum(body.type, 'type', resourceTypes);

  if (!partial && type === undefined) {
    throw new AppError(400, 'type is required.');
  }

  const result: CreateResourceInput = {
    name: name ?? '',
    type: type ?? resourceTypes[0]
  };

  for (const field of optionalTextFields) {
    const value = validateText(
      body[field],
      field,
      field === 'description' ? 500 : 80
    );

    if (value !== undefined) {
      result[field] = value;
    }
  }

  const status = validateEnum(
    body.status,
    'status',
    resourceStatuses
  );

  if (status !== undefined) {
    result.status = status;
  }

  const enabled = validateBoolean(body.enabled, 'enabled');

  if (enabled !== undefined) {
    result.enabled = enabled;
  }

  if (partial) {
    const partialResult: UpdateResourceInput = {
      ...result
    };

    if (body.name === undefined) {
      delete partialResult.name;
    }

    if (body.type === undefined) {
      delete partialResult.type;
    }

    return partialResult;
  }

  return result;
}

function parseFilters(
  query: Record<string, unknown>
): ResourceFilters {
  const filters: ResourceFilters = {};

  const type = validateEnum(
    query.type,
    'type',
    resourceTypes
  );

  const status = validateEnum(
    query.status,
    'status',
    resourceStatuses
  );

  const environment = validateText(
    query.environment,
    'environment',
    80
  );

  /*
   * IMPORTANT:
   * Do not add properties with undefined values.
   *
   * Bad:
   * {
   *   type: undefined,
   *   status: undefined,
   *   environment: undefined
   * }
   *
   * Good:
   * {}
   *
   * This allows an unfiltered request to correctly execute:
   * ResourceModel.find({})
   */
  if (type !== undefined) {
    filters.type = type;
  }

  if (status !== undefined) {
    filters.status = status;
  }

  if (environment !== undefined) {
    filters.environment = environment;
  }

  const enabled = query.enabled;

  if (enabled !== undefined) {
    if (enabled !== 'true' && enabled !== 'false') {
      throw new AppError(
        400,
        'enabled must be true or false.'
      );
    }

    filters.enabled = enabled === 'true';
  }

  return filters;
}

export const listResources: RequestHandler = async (
  request,
  response
) => {
  const data = await getResources(
    parseFilters(request.query)
  );

  response.status(200).json({
    success: true,
    data
  });
};

export const getResource: RequestHandler = async (
  request,
  response
) => {
  const data = await getResourceById(
    getResourceId(request.params.id)
  );

  response.status(200).json({
    success: true,
    data
  });
};

export const postResource: RequestHandler = async (
  request,
  response
) => {
  const data = await createResource(
    parseResourceInput(
      request.body,
      false
    ) as CreateResourceInput
  );

  response.status(201).json({
    success: true,
    data
  });
};

export const patchResource: RequestHandler = async (
  request,
  response
) => {
  const input = parseResourceInput(
    request.body,
    true
  ) as UpdateResourceInput;

  if (Object.keys(input).length === 0) {
    throw new AppError(
      400,
      'At least one supported field is required.'
    );
  }

  const data = await updateResource(
    getResourceId(request.params.id),
    input
  );

  response.status(200).json({
    success: true,
    data
  });
};

export const removeResource: RequestHandler = async (
  request,
  response
) => {
  await deleteResource(
    getResourceId(request.params.id)
  );

  response.status(200).json({
    success: true,
    data: null
  });
};