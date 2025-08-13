import winston from 'winston';
import config from '../config';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    let logMessage = `${timestamp} [${level}]: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      logMessage += ' ' + JSON.stringify(meta, null, 2);
    }
    
    return logMessage;
  })
);

// Define transports
const transports: winston.transport[] = [
  // Console transport
  new winston.transports.Console({
    format: logFormat,
  }),
];

// Add file transport in production (but not in serverless environments)
if (config.nodeEnv === 'production' && !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  try {
    // Try to create logs directory if it doesn't exist
    const fs = require('fs');
    if (!fs.existsSync('logs')) {
      fs.mkdirSync('logs', { recursive: true });
    }
    
    transports.push(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
      })
    );
  } catch (error) {
    // If file logging fails (e.g., in serverless), just use console
    console.warn('File logging disabled in serverless environment');
  }
}

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  levels,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports,
  exitOnError: false,
});

// Add helper methods for structured logging
(logger as any).logWithCorrelation = function(level: string, message: string, correlationId?: string, meta?: any) {
  this.log(level, message, {
    ...meta,
    correlationId,
    timestamp: new Date().toISOString(),
  });
};

(logger as any).apiLog = function(method: string, url: string, statusCode: number, duration: number, correlationId?: string) {
  this.info('API Request', {
    method,
    url,
    statusCode,
    duration: `${duration}ms`,
    correlationId,
    type: 'api_request',
  });
};

(logger as any).transferLog = function(action: string, transferId: string, status: string, details?: any) {
  this.info(`Transfer ${action}`, {
    transferId,
    status,
    ...details,
    type: 'transfer_event',
  });
};

(logger as any).webhookLog = function(provider: string, event: string, sessionId?: string, success?: boolean) {
  this.info(`Webhook received from ${provider}`, {
    provider,
    event,
    sessionId,
    success,
    type: 'webhook_event',
  });
};

(logger as any).blockchainLog = function(action: string, txHash?: string, details?: any) {
  this.info(`Blockchain ${action}`, {
    txHash,
    ...details,
    type: 'blockchain_event',
  });
};

export default logger;