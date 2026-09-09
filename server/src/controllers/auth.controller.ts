import type { RequestHandler } from 'express';
import { getUser, loginUser, registerUser } from '../services/auth.service.js';
import { AppError } from '../utils/app-error.js';
function body(request: { body: unknown }): Record<string, unknown> { if (typeof request.body !== 'object' || request.body === null || Array.isArray(request.body)) throw new AppError(400, 'Request body must be an object.', 'INVALID_BODY'); return request.body as Record<string, unknown>; }
function text(value: unknown, field: string, max: number): string { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new AppError(400, `${field} is invalid.`, 'INVALID_INPUT'); return value.trim(); }
export const register: RequestHandler = async (request, response) => { const value = body(request); const result = await registerUser(text(value.email, 'email', 254), text(value.password, 'password', 200), value.role === 'operator' ? 'operator' : undefined); response.status(201).json({ success: true, data: result }); };
export const login: RequestHandler = async (request, response) => { const value = body(request); const result = await loginUser(text(value.email, 'email', 254), text(value.password, 'password', 200)); response.status(200).json({ success: true, data: result }); };
export const logout: RequestHandler = async (_request, response) => response.status(200).json({ success: true, data: { loggedOut: true } });
export const me: RequestHandler = async (request, response) => response.status(200).json({ success: true, data: await getUser(request.user!.id) });