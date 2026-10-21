import type { ErrorRequestHandler, RequestHandler } from 'express';
import { logger } from '../observability/logger';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  let details: unknown;

  if (err instanceof AppError) {
    status = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) {
    // e.g. malformed JSON body
    status = err.status;
    code = 'BAD_REQUEST';
    message = 'Bad request';
  }

  if (status >= 500) {
    logger.error({ err, method: req.method, path: req.path }, 'unhandled error');
  }

  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
};
