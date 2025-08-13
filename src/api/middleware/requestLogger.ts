import { Request, Response, NextFunction, RequestHandler } from 'express';
import morgan from 'morgan';
import { generateCorrelationId } from '../../utils';
import logger from '../../utils/logger';
import config from '../../config';

// Add correlation ID to requests
export const correlationMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Get correlation ID from header or generate new one
  const correlationId = (req.headers['x-correlation-id'] as string) || generateCorrelationId();
  
  // Add to request object
  (req as any).correlationId = correlationId;
  
  // Add to response headers
  res.setHeader('X-Correlation-ID', correlationId);
  
  next();
};

// Custom morgan tokens
morgan.token('correlation-id', (req: Request) => (req as any).correlationId || 'unknown');
morgan.token('user-id', (req: Request) => (req as any).user?.lineUserId || 'anonymous');

// Custom morgan format
const morganFormat = config.nodeEnv === 'production'
  ? ':remote-addr - :user-id [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :correlation-id :response-time ms'
  : ':method :url :status :response-time ms - :res[content-length] [:correlation-id]';

// Morgan middleware with custom stream
export const morganMiddleware: RequestHandler = morgan(morganFormat, {
  stream: {
    write: (message: string) => {
      // Remove trailing newline and log through winston
      logger.http(message.trim());
    },
  },
  skip: (req: Request) => {
    // Skip health check logs in production
    if (config.nodeEnv === 'production' && req.path === '/health') {
      return true;
    }
    return false;
  },
});

// Request timing middleware
export const requestTimingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  
  // Override res.end to capture timing
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any): any {
    const duration = Date.now() - startTime;
    
    // Log API request details
    (logger as any).apiLog(
      req.method,
      req.originalUrl,
      res.statusCode,
      duration,
      (req as any).correlationId
    );
    
    // Call original end method
    return originalEnd.call(this, chunk, encoding);
  };
  
  next();
};

// Request size limiter
export const requestSizeLimiter = (req: Request, res: Response, next: NextFunction): void => {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  if (contentLength > maxSize) {
    res.status(413).json({
      success: false,
      data: null,
      error: {
        code: 'REQUEST_TOO_LARGE',
        message: 'Request body too large',
      },
    });
    return;
  }
  
  next();
};

// Sanitize sensitive data from logs
export const sanitizeLogData = (data: any): any => {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  const sensitiveFields = [
    'password',
    'token',
    'authorization',
    'secret',
    'key',
    'privateKey',
    'sessionToken',
  ];
  
  const sanitized = { ...data };
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
};