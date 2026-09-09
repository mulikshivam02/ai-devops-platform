import type { ErrorRequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', requestId: request.requestId, code: error instanceof AppError ? error.code : 'INTERNAL_ERROR', message: error instanceof AppError ? error.message : 'Unhandled server error' }));

  if (error?.type === 'entity.too.large') {
    response.status(413).json({ success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request payload is too large.', requestId: request.requestId } });
    return;
  }
  if (error instanceof AppError) {
    response.status(error.statusCode).json({ success: false, error: { code: error.code, message: error.message, requestId: request.requestId } });
    return;
  }

  response.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId: request.requestId } });
};
