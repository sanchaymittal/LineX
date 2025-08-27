"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const winston_1 = __importDefault(require("winston"));
const config_1 = __importDefault(require("../config"));
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
};
winston_1.default.addColors(colors);
const logFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }), winston_1.default.format.colorize({ all: true }), winston_1.default.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    let logMessage = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
        logMessage += ' ' + JSON.stringify(meta, null, 2);
    }
    return logMessage;
}));
const transports = [
    new winston_1.default.transports.Console({
        format: logFormat,
    }),
];
if (config_1.default.nodeEnv === 'production' && !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
    try {
        const fs = require('fs');
        if (!fs.existsSync('logs')) {
            fs.mkdirSync('logs', { recursive: true });
        }
        transports.push(new winston_1.default.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
        }), new winston_1.default.transports.File({
            filename: 'logs/combined.log',
            format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
        }));
    }
    catch (error) {
        console.warn('File logging disabled in serverless environment');
    }
}
const logger = winston_1.default.createLogger({
    level: config_1.default.logging.level,
    levels,
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
    transports,
    exitOnError: false,
});
logger.logWithCorrelation = function (level, message, correlationId, meta) {
    this.log(level, message, {
        ...meta,
        correlationId,
        timestamp: new Date().toISOString(),
    });
};
logger.apiLog = function (method, url, statusCode, duration, correlationId) {
    this.info('API Request', {
        method,
        url,
        statusCode,
        duration: `${duration}ms`,
        correlationId,
        type: 'api_request',
    });
};
logger.transferLog = function (action, transferId, status, details) {
    this.info(`Transfer ${action}`, {
        transferId,
        status,
        ...details,
        type: 'transfer_event',
    });
};
logger.webhookLog = function (provider, event, sessionId, success) {
    this.info(`Webhook received from ${provider}`, {
        provider,
        event,
        sessionId,
        success,
        type: 'webhook_event',
    });
};
logger.blockchainLog = function (action, txHash, details) {
    this.info(`Blockchain ${action}`, {
        txHash,
        ...details,
        type: 'blockchain_event',
    });
};
exports.default = logger;
//# sourceMappingURL=logger.js.map