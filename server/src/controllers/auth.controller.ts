import type { RequestHandler } from 'express';
import { getUser, loginUser, logoutUser, registerUser, updateUserRole } from '../services/auth.service.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';
import type { UserRole } from '../models/User.js';

function body(request: { body: unknown }): Record<string, unknown> {
  if (typeof request.body !== 'object' || request.body === null || Array.isArray(request.body))
    throw new AppError(400, 'Request body must be an object.', 'INVALID_BODY');
  return request.body as Record<string, unknown>;
}
function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new AppError(400, `${field} is invalid.`, 'INVALID_INPUT');
  return value.trim();
}

// Registration no longer accepts a role from the caller. Every new account is a
// viewer; use PATCH /api/auth/users/:id/role (admin only) to change it afterward.
// See review 1.3.
export const register: RequestHandler = async (request, response) => {
  const value = body(request);
  const result = await registerUser(text(value.email, 'email', 254), text(value.password, 'password', 200));
  response.status(201).json({ success: true, data: result });
};

export const login: RequestHandler = async (request, response) => {
  const value = body(request);
  const result = await loginUser(text(value.email, 'email', 254), text(value.password, 'password', 200));
  response.status(200).json({ success: true, data: result });
};

// Previously a no-op that told the client to discard its token while the token
// itself stayed valid for the rest of its 8-hour life. Now revokes it server-side.
// See review 1.6.
export const logout: RequestHandler = async (request, response) => {
  await logoutUser(request.user!.id);
  response.status(200).json({ success: true, data: { loggedOut: true } });
};

export const me: RequestHandler = async (request, response) => {
  // Under AUTH_DISABLED, request.user.id is the literal string 'development-user',
  // not a Mongo ObjectId -- getUser's findById would throw a CastError and this
  // route would 500 in every local/dev setup. Short-circuit with the same synthetic
  // identity authenticate() already attached. See review 1.11.
  if (env.authDisabled) {
    response.status(200).json({
      success: true,
      data: { id: request.user!.id, email: request.user!.email, role: request.user!.role, active: true }
    });
    return;
  }
  response.status(200).json({ success: true, data: await getUser(request.user!.id) });
};

const VALID_ROLES: UserRole[] = ['viewer', 'operator', 'admin'];

export const updateRole: RequestHandler = async (request, response) => {
  const value = body(request);
  const targetId = request.params.id;
  if (!targetId || Array.isArray(targetId)) throw new AppError(400, 'User id is required.', 'INVALID_INPUT');
  if (typeof value.role !== 'string' || !VALID_ROLES.includes(value.role as UserRole))
    throw new AppError(400, 'role must be one of viewer, operator, admin.', 'INVALID_ROLE');
  const result = await updateUserRole(targetId, value.role as UserRole);
  response.status(200).json({ success: true, data: result });
};
