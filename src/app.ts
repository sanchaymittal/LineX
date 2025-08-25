import express from 'express';
import helmet from 'helmet';
import { corsMiddleware, customCorsMiddleware } from './api/middleware/cors';
import { correlationMiddleware, morganMiddleware, requestTimingMiddleware, requestSizeLimiter } from './api/middleware/requestLogger';
import { errorHandler, notFoundHandler } from './api/middleware/errorHandler';
import { globalRateLimit } from './api/middleware/rateLimit';
import config, { validateConfig } from './config';
import logger from './utils/logger';

// Import routes
import healthRoutes from './api/routes/health';
import quoteRoutes from './api/routes/quote';
import transferRoutes from './api/routes/transfer';
import walletRoutes from './api/routes/wallet';
import webhookRoutes from './api/routes/webhooks';
import docsRoutes from './api/routes/docs';
import defiRoutes from './api/v1/defi';

export function createApp(): express.Application {
  // Validate configuration
  validateConfig();

  const app = express();

  // Trust proxy (for rate limiting and IP detection)
  app.set('trust proxy', 1);

  // Security middleware
  app.use(helmet({
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
    crossOriginEmbedderPolicy: false, // Allow embedding in LINE
  }));

  // CORS middleware
  app.use(corsMiddleware);
  app.use(customCorsMiddleware);

  // Request middleware
  app.use(correlationMiddleware);
  app.use(requestSizeLimiter);
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Logging middleware
  app.use(morganMiddleware);
  app.use(requestTimingMiddleware);

  // Rate limiting
  if (config.nodeEnv !== 'test') {
    app.use(globalRateLimit.middleware());
  }

  // API Documentation (before other routes for proper serving)
  app.use('/api-docs', docsRoutes);
  
  // API routes
  app.use('/health', healthRoutes);
  app.use('/api/v1/quote', quoteRoutes);
  app.use('/api/v1/transfer', transferRoutes);
  app.use('/api/v1/wallet', walletRoutes);
  app.use('/api/v1/webhook', webhookRoutes);
  app.use('/api/v1/defi', defiRoutes);

  // API root endpoint
  app.get('/', (req, res) => {
    res.json({
      success: true,
      data: {
        message: 'LineX Cross-Border Remittance API',
        version: '1.0.0',
        environment: config.nodeEnv,
        timestamp: new Date().toISOString(),
        endpoints: {
          health: '/health',
          healthDetailed: '/health/detailed',
          quote: '/api/v1/quote',
          transfer: '/api/v1/transfer',
          wallet: '/api/v1/wallet',
          webhooks: '/api/v1/webhook',
          defi: '/api/v1/defi',
          documentation: '/api-docs',
        },
        defiEndpoints: {
          vault: '/api/v1/defi/vault',
          split: '/api/v1/defi/split',
          yield: '/api/v1/defi/yield',
          nyt: '/api/v1/defi/nyt',
          portfolio: '/api/v1/defi/portfolio',
          autocompound: '/api/v1/defi/autocompound',
          strategies: '/api/v1/defi/strategies',
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
        requestId: (req as any).correlationId,
      },
    });
  });

  // Error handling middleware (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;