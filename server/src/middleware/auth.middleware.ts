import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { verifyToken } from '../services/auth.service.js';
import { AppError } from '../utils/app-error.js';
import type { UserRole } from '../models/User.js';
declare module 'express-serve-static-core' { interface Request { user?: { id: string; email: string; role: UserRole }; } }
export const authenticate: RequestHandler = (request, _response, next) => { if (env.authDisabled) { request.user = { id: 'development-user', email: 'development@localhost', role: 'admin' }; next(); return; } const header = request.header('Authorization'); if (!header?.startsWith('Bearer ')) { next(new AppError(401, 'Authentication is required.', 'AUTH_REQUIRED')); return; } try { request.user = verifyToken(header.slice(7)); next(); } catch (error) { next(error); } };
export function authorize(...roles: UserRole[]): RequestHandler { return (request, _response, next) => { if (!request.user || !roles.includes(request.user.role)) { next(new AppError(403, 'You do not have permission for this operation.', 'FORBIDDEN')); return; } next(); }; }
export const authorizeRequest: RequestHandler = (request, response, next) => authorize(request.method === 'GET' ? 'viewer' : 'operator', 'admin')(request, response, next);