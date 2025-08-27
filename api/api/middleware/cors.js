"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.customCorsMiddleware = exports.corsMiddleware = void 0;
const cors_1 = __importDefault(require("cors"));
const config_1 = __importDefault(require("../../config"));
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        if (config_1.default.nodeEnv === 'development') {
            return callback(null, true);
        }
        const allowedOrigins = [
            'https://line.me',
            'https://liff.line.me',
            'https://linex-frontend.vercel.app',
            'https://linex-backend-five.vercel.app',
        ];
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-Correlation-ID',
    ],
    exposedHeaders: ['X-Correlation-ID'],
    maxAge: 86400,
};
exports.corsMiddleware = (0, cors_1.default)(corsOptions);
const customCorsMiddleware = (req, res, next) => {
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Correlation-ID');
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Max-Age', '86400');
        res.status(200).end();
        return;
    }
    next();
};
exports.customCorsMiddleware = customCorsMiddleware;
//# sourceMappingURL=cors.js.map