"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeLogData = exports.requestSizeLimiter = exports.requestTimingMiddleware = exports.morganMiddleware = exports.correlationMiddleware = void 0;
const morgan_1 = __importDefault(require("morgan"));
const utils_1 = require("../../utils");
const logger_1 = __importDefault(require("../../utils/logger"));
const config_1 = __importDefault(require("../../config"));
const correlationMiddleware = (req, res, next) => {
    const correlationId = req.headers['x-correlation-id'] || (0, utils_1.generateCorrelationId)();
    req.correlationId = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);
    next();
};
exports.correlationMiddleware = correlationMiddleware;
morgan_1.default.token('correlation-id', (req) => req.correlationId || 'unknown');
morgan_1.default.token('user-id', (req) => req.user?.lineUserId || 'anonymous');
const morganFormat = config_1.default.nodeEnv === 'production'
    ? ':remote-addr - :user-id [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :correlation-id :response-time ms'
    : ':method :url :status :response-time ms - :res[content-length] [:correlation-id]';
exports.morganMiddleware = (0, morgan_1.default)(morganFormat, {
    stream: {
        write: (message) => {
            logger_1.default.http(message.trim());
        },
    },
    skip: (req) => {
        if (config_1.default.nodeEnv === 'production' && req.path === '/health') {
            return true;
        }
        return false;
    },
});
const requestTimingMiddleware = (req, res, next) => {
    const startTime = Date.now();
    const originalEnd = res.end;
    res.end = function (chunk, encoding) {
        const duration = Date.now() - startTime;
        logger_1.default.apiLog(req.method, req.originalUrl, res.statusCode, duration, req.correlationId);
        return originalEnd.call(this, chunk, encoding);
    };
    next();
};
exports.requestTimingMiddleware = requestTimingMiddleware;
const requestSizeLimiter = (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    const maxSize = 10 * 1024 * 1024;
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
exports.requestSizeLimiter = requestSizeLimiter;
const sanitizeLogData = (data) => {
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
exports.sanitizeLogData = sanitizeLogData;
//# sourceMappingURL=requestLogger.js.map