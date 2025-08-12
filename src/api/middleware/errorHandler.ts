import { Request, Response, NextFunction } from 'express';
import logger from '../../utils/logger';
import { ApiResponse } from '../../types';

export interface CustomError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export class AppError extends Error implements CustomError {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: any;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR', details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  error: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const statusCode = error.statusCode || 500;
  const code = error.code || 'INTERNAL_ERROR';
  const message = error.message || 'An unexpected error occurred';

  // Log the error
  logger.error('Request error:', {
    error: {
      message: error.message,
      stack: error.stack,
      code,
      statusCode,
      details: error.details,
    },
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      params: req.params,
      query: req.query,
    },
    correlationId: (req as any).correlationId,
  });

  // Prepare error response
  const errorResponse: ApiResponse = {
    success: false,
    data: null,
    error: {
      code,
      message,
      details: error.details,
    },
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: (req as any).correlationId || 'unknown',
    },
  };

  // Don't expose sensitive error details in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    errorResponse.error = {
      code: 'INTERNAL_ERROR',
      message: 'An internal server error occurred',
    };
  }

  res.status(statusCode).json(errorResponse);
};

export const notFoundHandler = (req: Request, res: Response): void => {
  const response: ApiResponse = {
    success: false,
    data: null,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: (req as any).correlationId || 'unknown',
    },
  };

  logger.warn('Route not found:', {
    method: req.method,
    path: req.path,
    correlationId: (req as any).correlationId,
  });

  res.status(404).json(response);
};

// Async error wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction): Promise<void> => {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Common error creators
export const createValidationError = (message: string, details?: any): AppError => {
  return new AppError(message, 400, 'VALIDATION_ERROR', details);
};

export const createNotFoundError = (resource: string): AppError => {
  return new AppError(`${resource} not found`, 404, 'NOT_FOUND');
};

export const createUnauthorizedError = (message: string = 'Unauthorized'): AppError => {
  return new AppError(message, 401, 'UNAUTHORIZED');
};

export const createForbiddenError = (message: string = 'Forbidden'): AppError => {
  return new AppError(message, 403, 'FORBIDDEN');
};

export const createConflictError = (message: string): AppError => {
  return new AppError(message, 409, 'CONFLICT');
};

export const createRateLimitError = (message: string = 'Too many requests'): AppError => {
  return new AppError(message, 429, 'RATE_LIMIT_EXCEEDED');
};

export const createInternalError = (message: string = 'Internal server error', details?: any): AppError => {
  return new AppError(message, 500, 'INTERNAL_ERROR', details);
};