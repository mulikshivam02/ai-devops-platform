import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

declare module 'express-serve-static-core' { interface Request { requestId: string; } }
export const requestContext: RequestHandler = (request, response, next) => { const requestId = request.header('X-Request-ID')?.trim() || randomUUID(); request.requestId = requestId; response.setHeader('X-Request-ID', requestId); const started = Date.now(); response.on('finish', () => console.info(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', requestId, route: request.originalUrl, method: request.method, status: response.statusCode, durationMs: Date.now() - started }))); next(); };