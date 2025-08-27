"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.faucetRateLimit = exports.webhookRateLimit = exports.apiRateLimit = exports.authRateLimit = exports.globalRateLimit = exports.RedisRateLimiter = void 0;
const client_1 = require("../../services/redis/client");
const logger_1 = __importDefault(require("../../utils/logger"));
const config_1 = __importDefault(require("../../config"));
class RedisRateLimiter {
    constructor(options) {
        this.windowMs = options.windowMs;
        this.maxRequests = options.maxRequests;
        this.keyGenerator = options.keyGenerator || this.defaultKeyGenerator;
        this.skipSuccessfulRequests = options.skipSuccessfulRequests || false;
        this.skipFailedRequests = options.skipFailedRequests || false;
        this.message = options.message || 'Too many requests, please try again later';
    }
    defaultKeyGenerator(req) {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const userId = req.user?.lineUserId || 'anonymous';
        return `rate_limit:${ip}:${userId}`;
    }
    getRateLimitKey(req) {
        const baseKey = this.keyGenerator(req);
        const windowStart = Math.floor(Date.now() / this.windowMs) * this.windowMs;
        return `${baseKey}:${windowStart}`;
    }
    async checkRateLimit(req) {
        const key = this.getRateLimitKey(req);
        const client = client_1.redisClient.getClient();
        try {
            const pipeline = client.multi();
            pipeline.incr(key);
            pipeline.expire(key, Math.ceil(this.windowMs / 1000));
            const results = await pipeline.exec();
            const totalHits = results?.[0] || 0;
            const allowed = totalHits <= this.maxRequests;
            const remaining = Math.max(0, this.maxRequests - totalHits);
            const resetTime = Math.floor(Date.now() / this.windowMs) * this.windowMs + this.windowMs;
            return {
                allowed,
                remaining,
                resetTime,
                totalHits,
            };
        }
        catch (error) {
            logger_1.default.error('Rate limit check failed:', error);
            return {
                allowed: true,
                remaining: this.maxRequests,
                resetTime: Date.now() + this.windowMs,
                totalHits: 0,
            };
        }
    }
    middleware() {
        return async (req, res, next) => {
            try {
                const { allowed, remaining, resetTime, totalHits } = await this.checkRateLimit(req);
                res.setHeader('X-RateLimit-Limit', this.maxRequests);
                res.setHeader('X-RateLimit-Remaining', remaining);
                res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000));
                if (!allowed) {
                    logger_1.default.warn('Rate limit exceeded:', {
                        key: this.getRateLimitKey(req),
                        totalHits,
                        maxRequests: this.maxRequests,
                        ip: req.ip,
                        userId: req.user?.lineUserId,
                        correlationId: req.correlationId,
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
                if (this.skipSuccessfulRequests || this.skipFailedRequests) {
                    const rateLimiter = this;
                    const originalSend = res.send;
                    res.send = function (body) {
                        const statusCode = res.statusCode;
                        const shouldSkip = (rateLimiter.skipSuccessfulRequests && statusCode < 400) ||
                            (rateLimiter.skipFailedRequests && statusCode >= 400);
                        if (shouldSkip) {
                            const key = rateLimiter.getRateLimitKey(req);
                            client_1.redisClient.getClient().decr(key).catch((err) => {
                                logger_1.default.error('Failed to decrement rate limit counter:', err);
                            });
                        }
                        return originalSend.call(this, body);
                    };
                }
                next();
            }
            catch (error) {
                logger_1.default.error('Rate limit middleware error:', error);
                next();
            }
        };
    }
}
exports.RedisRateLimiter = RedisRateLimiter;
exports.globalRateLimit = new RedisRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 1000,
    message: 'Too many requests from this IP, please try again later',
});
exports.authRateLimit = new RedisRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
    keyGenerator: (req) => `auth_limit:${req.ip}`,
    message: 'Too many authentication attempts, please try again later',
});
exports.apiRateLimit = new RedisRateLimiter({
    windowMs: 1 * 60 * 1000,
    maxRequests: 100,
    message: 'API rate limit exceeded, please slow down',
});
exports.webhookRateLimit = new RedisRateLimiter({
    windowMs: 1 * 60 * 1000,
    maxRequests: 50,
    keyGenerator: (req) => `webhook_limit:${req.ip}`,
    message: 'Webhook rate limit exceeded',
});
exports.faucetRateLimit = new RedisRateLimiter({
    windowMs: 60 * 60 * 1000,
    maxRequests: 5,
    keyGenerator: (req) => `faucet_limit:${req.ip}`,
    message: 'Faucet rate limit exceeded, please try again later',
});
if (config_1.default.nodeEnv === 'development') {
    exports.globalRateLimit.maxRequests = 10000;
    exports.apiRateLimit.maxRequests = 1000;
    exports.webhookRateLimit.maxRequests = 500;
}
//# sourceMappingURL=rateLimit.js.map