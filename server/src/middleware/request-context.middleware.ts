import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
  }
}
export const requestContext: RequestHandler = (request, response, next) => {
  // Client-supplied and echoed straight back into every log line and response
  // header with no validation -- an attacker could inject arbitrary length/content
  // (log pollution, header injection via control characters). Accept it only if it
  // looks like a real request id; otherwise mint our own. See review 1.9.
  const supplied = request.header('X-Request-ID')?.trim();
  const requestId = supplied && /^[A-Za-z0-9._-]{1,64}$/.test(supplied) ? supplied : randomUUID();
  request.requestId = requestId;
  response.setHeader('X-Request-ID', requestId);
  const started = Date.now();
  response.on('finish', () =>
    console.info(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        requestId,
        route: request.originalUrl,
        method: request.method,
        status: response.statusCode,
        durationMs: Date.now() - started
      })
    )
  );
  next();
};
