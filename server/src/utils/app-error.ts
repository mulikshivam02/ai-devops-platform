export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = 'APP_ERROR',
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'AppError';
  }
}
