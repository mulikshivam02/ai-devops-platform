import type { ErrorRequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const expected = error instanceof AppError;

  // Expected errors (AppError) are business outcomes: log them at warn with no stack.
  // Everything else is a bug, and the stack is the only thing that makes it diagnosable.
  // The previous version logged a fixed string for unexpected errors, which meant every
  // 500 produced a log line containing a request ID and nothing else. See review 6.6.
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: expected ? 'warn' : 'error',
      requestId: request.requestId,
      method: request.method,
      route: request.originalUrl,
      code: expected ? error.code : 'INTERNAL_ERROR',
      message: expected ? error.message : error instanceof Error ? error.message : String(error),
      ...(expected
        ? {}
        : {
            name: error instanceof Error ? error.name : typeof error,
            stack: error instanceof Error ? error.stack : undefined,
            cause: error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined
          })
    })
  );

  if (error?.type === 'entity.too.large') {
    response.status(413).json({
      success: false,
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request payload is too large.', requestId: request.requestId }
    });
    return;
  }
  if (error instanceof AppError) {
    response
      .status(error.statusCode)
      .json({ success: false, error: { code: error.code, message: error.message, requestId: request.requestId } });
    return;
  }

  response.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId: request.requestId }
  });
};
