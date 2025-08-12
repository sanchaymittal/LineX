import { Request, Response, NextFunction } from 'express';
import { redisClient } from '../../services/redis/client';
import logger from '../../utils/logger';
import config from '../../config';

export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (req: Request) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
  message?: string; // Custom error message
}

export class RedisRateLimiter {
  private windowMs: number;
  private maxRequests: number;
  private keyGenerator: (req: Request) => string;
  private skipSuccessfulRequests: boolean;
  private skipFailedRequests: boolean;
  private message: string;

  constructor(options: RateLimitOptions) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
    this.keyGenerator = options.keyGenerator || this.defaultKeyGenerator;
    this.skipSuccessfulRequests = options.skipSuccessfulRequests || false;
    this.skipFailedRequests = options.skipFailedRequests || false;
    this.message = options.message || 'Too many requests, please try again later';
  }

  private defaultKeyGenerator(req: Request): string {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userId = (req as any).user?.lineUserId || 'anonymous';
    return `rate_limit:${ip}:${userId}`;
  }

  private getRateLimitKey(req: Request): string {
    const baseKey = this.keyGenerator(req);
    const windowStart = Math.floor(Date.now() / this.windowMs) * this.windowMs;
    return `${baseKey}:${windowStart}`;
  }

  async checkRateLimit(req: Request): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
    totalHits: number;
  }> {
    const key = this.getRateLimitKey(req);
    const client = redisClient.getClient();

    try {
      // Use pipeline for atomic operations
      const pipeline = client.multi();
      pipeline.incr(key);
      pipeline.expire(key, Math.ceil(this.windowMs / 1000));
      
      const results = await pipeline.exec();
      const totalHits = (results?.[0] as unknown as number) || 0;

      const allowed = totalHits <= this.maxRequests;
      const remaining = Math.max(0, this.maxRequests - totalHits);
      const resetTime = Math.floor(Date.now() / this.windowMs) * this.windowMs + this.windowMs;

      return {
        allowed,
        remaining,
        resetTime,
        totalHits,
      };
    } catch (error) {
      logger.error('Rate limit check failed:', error);
      // Fail open - allow request if Redis is down
      return {
        allowed: true,
        remaining: this.maxRequests,
        resetTime: Date.now() + this.windowMs,
        totalHits: 0,
      };
    }
  }

  middleware() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { allowed, remaining, resetTime, totalHits } = await this.checkRateLimit(req);

        // Add rate limit headers
        res.setHeader('X-RateLimit-Limit', this.maxRequests);
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000));

        if (!allowed) {
          logger.warn('Rate limit exceeded:', {
            key: this.getRateLimitKey(req),
            totalHits,
            maxRequests: this.maxRequests,
            ip: req.ip,
            userId: (req as any).user?.lineUserId,
            correlationId: (req as any).correlationId,
          });

          res.status(429).json({
            success: false,
            data: null,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: this.message,
              details: {
                limit: this.maxRequests,
                remaining: 0,
                resetTime: Math.ceil(resetTime / 1000),
              },
            },
          });
          return;
        }

        // Handle response-based counting
        if (this.skipSuccessfulRequests || this.skipFailedRequests) {
          const rateLimiter = this;
          const originalSend = res.send;
          res.send = function(body: any) {
            const statusCode = res.statusCode;
            const shouldSkip = 
              (rateLimiter.skipSuccessfulRequests && statusCode < 400) ||
              (rateLimiter.skipFailedRequests && statusCode >= 400);

            if (shouldSkip) {
              // Decrement counter if we should skip this request
              const key = rateLimiter.getRateLimitKey(req);
              redisClient.getClient().decr(key).catch((err: any) => {
                logger.error('Failed to decrement rate limit counter:', err);
              });
            }

            return originalSend.call(this, body);
          };
        }

        next();
      } catch (error) {
        logger.error('Rate limit middleware error:', error);
        // Fail open - continue with request
        next();
      }
    };
  }
}

// Predefined rate limiters
export const globalRateLimit = new RedisRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 1000, // 1000 requests per 15 minutes
  message: 'Too many requests from this IP, please try again later',
});

export const authRateLimit = new RedisRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 auth attempts per 15 minutes
  keyGenerator: (req: Request) => `auth_limit:${req.ip}`,
  message: 'Too many authentication attempts, please try again later',
});

export const apiRateLimit = new RedisRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  maxRequests: 100, // 100 API requests per minute per user
  message: 'API rate limit exceeded, please slow down',
});

export const webhookRateLimit = new RedisRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  maxRequests: 50, // 50 webhook calls per minute
  keyGenerator: (req: Request) => `webhook_limit:${req.ip}`,
  message: 'Webhook rate limit exceeded',
});

export const faucetRateLimit = new RedisRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5, // 5 faucet requests per hour per IP
  keyGenerator: (req: Request) => `faucet_limit:${req.ip}`,
  message: 'Faucet rate limit exceeded, please try again later',
});

// Development rate limits (more permissive)
if (config.nodeEnv === 'development') {
  (globalRateLimit as any).maxRequests = 10000;
  (apiRateLimit as any).maxRequests = 1000;
  (webhookRateLimit as any).maxRequests = 500;
}