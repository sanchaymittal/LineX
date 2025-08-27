import { Request, Response, NextFunction } from 'express';
export interface RateLimitOptions {
    windowMs: number;
    maxRequests: number;
    keyGenerator?: (req: Request) => string;
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
    message?: string;
}
export declare class RedisRateLimiter {
    private windowMs;
    private maxRequests;
    private keyGenerator;
    private skipSuccessfulRequests;
    private skipFailedRequests;
    private message;
    constructor(options: RateLimitOptions);
    private defaultKeyGenerator;
    private getRateLimitKey;
    checkRateLimit(req: Request): Promise<{
        allowed: boolean;
        remaining: number;
        resetTime: number;
        totalHits: number;
    }>;
    middleware(): (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
export declare const globalRateLimit: RedisRateLimiter;
export declare const authRateLimit: RedisRateLimiter;
export declare const apiRateLimit: RedisRateLimiter;
export declare const webhookRateLimit: RedisRateLimiter;
export declare const faucetRateLimit: RedisRateLimiter;
//# sourceMappingURL=rateLimit.d.ts.map