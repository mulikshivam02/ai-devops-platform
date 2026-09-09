import type { ErrorRequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  console.error(error);

  if (error instanceof AppError) {
    response.status(error.statusCode).json({ success: false, error: error.message });
    return;
  }

  response.status(500).json({ success: false, error: 'Internal server error' });
};
