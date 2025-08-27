"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInternalError = exports.createRateLimitError = exports.createConflictError = exports.createForbiddenError = exports.createUnauthorizedError = exports.createNotFoundError = exports.createValidationError = exports.asyncHandler = exports.notFoundHandler = exports.errorHandler = exports.AppError = void 0;
const logger_1 = __importDefault(require("../../utils/logger"));
class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
const errorHandler = (error, req, res, next) => {
    const statusCode = error.statusCode || 500;
    const code = error.code || 'INTERNAL_ERROR';
    const message = error.message || 'An unexpected error occurred';
    logger_1.default.error('Request error:', {
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
        correlationId: req.correlationId,
    });
    const errorResponse = {
        success: false,
        data: null,
        error: {
            code,
            message,
            details: error.details,
        },
        metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.correlationId || 'unknown',
        },
    };
    if (process.env.NODE_ENV === 'production' && statusCode === 500) {
        errorResponse.error = {
            code: 'INTERNAL_ERROR',
            message: 'An internal server error occurred',
        };
    }
    res.status(statusCode).json(errorResponse);
};
exports.errorHandler = errorHandler;
const notFoundHandler = (req, res) => {
    const response = {
        success: false,
        data: null,
        error: {
            code: 'NOT_FOUND',
            message: `Route ${req.method} ${req.path} not found`,
        },
        metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.correlationId || 'unknown',
        },
    };
    logger_1.default.warn('Route not found:', {
        method: req.method,
        path: req.path,
        correlationId: req.correlationId,
    });
    res.status(404).json(response);
};
exports.notFoundHandler = notFoundHandler;
const asyncHandler = (fn) => {
    return (req, res, next) => {
        return Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
const createValidationError = (message, details) => {
    return new AppError(message, 400, 'VALIDATION_ERROR', details);
};
exports.createValidationError = createValidationError;
const createNotFoundError = (resource) => {
    return new AppError(`${resource} not found`, 404, 'NOT_FOUND');
};
exports.createNotFoundError = createNotFoundError;
const createUnauthorizedError = (message = 'Unauthorized') => {
    return new AppError(message, 401, 'UNAUTHORIZED');
};
exports.createUnauthorizedError = createUnauthorizedError;
const createForbiddenError = (message = 'Forbidden') => {
    return new AppError(message, 403, 'FORBIDDEN');
};
exports.createForbiddenError = createForbiddenError;
const createConflictError = (message) => {
    return new AppError(message, 409, 'CONFLICT');
};
exports.createConflictError = createConflictError;
const createRateLimitError = (message = 'Too many requests') => {
    return new AppError(message, 429, 'RATE_LIMIT_EXCEEDED');
};
exports.createRateLimitError = createRateLimitError;
const createInternalError = (message = 'Internal server error', details) => {
    return new AppError(message, 500, 'INTERNAL_ERROR', details);
};
exports.createInternalError = createInternalError;
//# sourceMappingURL=errorHandler.js.map