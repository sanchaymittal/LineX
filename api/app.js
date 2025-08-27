"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = require("./api/middleware/cors");
const requestLogger_1 = require("./api/middleware/requestLogger");
const errorHandler_1 = require("./api/middleware/errorHandler");
const rateLimit_1 = require("./api/middleware/rateLimit");
const config_1 = __importStar(require("./config"));
const health_1 = __importDefault(require("./api/routes/health"));
const quote_1 = __importDefault(require("./api/routes/quote"));
const transfer_1 = __importDefault(require("./api/routes/transfer"));
const wallet_1 = __importDefault(require("./api/routes/wallet"));
const webhooks_1 = __importDefault(require("./api/routes/webhooks"));
const docs_1 = __importDefault(require("./api/routes/docs"));
const signatures_1 = __importDefault(require("./api/routes/signatures"));
const defi_1 = __importDefault(require("./api/v1/defi"));
function createApp() {
    (0, config_1.validateConfig)();
    const app = (0, express_1.default)();
    app.set('trust proxy', 1);
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: ["'self'"],
                fontSrc: ["'self'", "https://unpkg.com"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'none'"],
            },
        },
        crossOriginEmbedderPolicy: false,
    }));
    app.use(cors_1.corsMiddleware);
    app.use(cors_1.customCorsMiddleware);
    app.use(requestLogger_1.correlationMiddleware);
    app.use(requestLogger_1.requestSizeLimiter);
    app.use(express_1.default.json({ limit: '10mb' }));
    app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
    app.use(requestLogger_1.morganMiddleware);
    app.use(requestLogger_1.requestTimingMiddleware);
    if (config_1.default.nodeEnv !== 'test') {
        app.use(rateLimit_1.globalRateLimit.middleware());
    }
    app.use('/api-docs', docs_1.default);
    app.use('/health', health_1.default);
    app.use('/api/v1/quote', quote_1.default);
    app.use('/api/v1/transfer', transfer_1.default);
    app.use('/api/v1/wallet', wallet_1.default);
    app.use('/api/v1/webhook', webhooks_1.default);
    app.use('/api/v1/signatures', signatures_1.default);
    app.use('/api/v1/defi', defi_1.default);
    app.get('/', (req, res) => {
        res.json({
            success: true,
            data: {
                message: 'LineX Cross-Border Remittance API',
                version: '1.0.0',
                environment: config_1.default.nodeEnv,
                timestamp: new Date().toISOString(),
                endpoints: {
                    health: '/health',
                    healthDetailed: '/health/detailed',
                    quote: '/api/v1/quote',
                    transfer: '/api/v1/transfer',
                    wallet: '/api/v1/wallet',
                    webhooks: '/api/v1/webhook',
                    signatures: '/api/v1/signatures',
                    defi: '/api/v1/defi',
                    documentation: '/api-docs',
                },
                defiEndpoints: {
                    vault: '/api/v1/defi/vault',
                    autocompound: '/api/v1/defi/autocompound',
                    analytics: '/api/v1/defi/analytics',
                },
                documentation: {
                    swagger: '/api-docs',
                    openapi: '/api-docs/openapi.yaml',
                    github: 'https://github.com/lineX/backend',
                },
            },
            error: null,
            metadata: {
                timestamp: new Date().toISOString(),
                requestId: req.correlationId,
            },
        });
    });
    app.use(errorHandler_1.notFoundHandler);
    app.use(errorHandler_1.errorHandler);
    return app;
}
exports.default = createApp;
//# sourceMappingURL=app.js.map