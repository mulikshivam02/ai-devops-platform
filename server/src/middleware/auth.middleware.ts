import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { verifyToken } from '../services/auth.service.js';
import { UserModel, type UserRole } from '../models/User.js';
import { AppError } from '../utils/app-error.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: string; email: string; role: UserRole };
  }
}

/**
 * A token that passes verifyToken() is only proof it was issued by us and hasn't
 * expired -- it says nothing about whether the account behind it is still active or
 * still has the role it had at login. This live lookup closes that gap: a logout
 * (tokenVersion bumped) or a role change is enforced on the very next request,
 * instead of remaining valid for the rest of the token's 8-hour life. See review 1.6.
 *
 * Role is read fresh from the database rather than trusted from the token, so a
 * demotion takes effect immediately even without a tokenVersion bump.
 */
export const authenticate: RequestHandler = async (request, _response, next) => {
  if (env.authDisabled) {
    request.user = { id: 'development-user', email: 'development@localhost', role: 'admin' };
    next();
    return;
  }
  const header = request.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    next(new AppError(401, 'Authentication is required.', 'AUTH_REQUIRED'));
    return;
  }
  try {
    const claims = verifyToken(header.slice(7));
    const user = await UserModel.findById(claims.id).select({ role: 1, active: 1, tokenVersion: 1 }).lean();
    if (!user || !user.active || user.tokenVersion !== claims.tokenVersion) {
      next(new AppError(401, 'Session is no longer valid. Please sign in again.', 'AUTH_REVOKED'));
      return;
    }
    request.user = { id: claims.id, email: claims.email, role: user.role };
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * viewer < operator < admin.
 *
 * `authorize(minimum)` allows the given role AND every role above it.
 *
 * The previous signature, `authorize(...roles)`, took an explicit allow-list. Every
 * call site happened to list roles in ascending order (e.g. `authorize('operator', 'admin')`),
 * which is exactly a "minimum role" in disguise -- except authorizeRequest below built its
 * list as `[minimumForMethod, 'admin']`, which silently drops every role in between the
 * two named roles. For a GET that resolved to `authorize('viewer', 'admin')`, 'operator' --
 * an allowed role for every other purpose -- could not read anything. See review 1.1.
 */
const roleRank: Record<UserRole, number> = { viewer: 1, operator: 2, admin: 3 };

export function authorize(minimum: UserRole): RequestHandler {
  return (request, _response, next) => {
    const role = request.user?.role;
    if (!role || roleRank[role] < roleRank[minimum]) {
      next(new AppError(403, 'You do not have permission for this operation.', 'FORBIDDEN'));
      return;
    }
    next();
  };
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const authorizeRequest: RequestHandler = (request, response, next) =>
  authorize(READ_METHODS.has(request.method) ? 'viewer' : 'operator')(request, response, next);
