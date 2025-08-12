import express from 'express';
import helmet from 'helmet';
import { corsMiddleware, customCorsMiddleware } from './api/middleware/cors';
import { correlationMiddleware, morganMiddleware, requestTimingMiddleware, requestSizeLimiter } from './api/middleware/requestLogger';
import { errorHandler, notFoundHandler } from './api/middleware/errorHandler';
import { globalRateLimit } from './api/middleware/rateLimit';
import config, { validateConfig } from './config';
import logger from './utils/logger';

// Import routes (will create these next)
// import healthRoutes from './api/routes/health';
// import quoteRoutes from './api/routes/quote';
// import transferRoutes from './api/routes/transfer';
// import webhookRoutes from './api/routes/webhook';
// import faucetRoutes from './api/routes/faucet';

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
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
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

  // API routes
  // app.use('/health', healthRoutes);
  // app.use('/api/v1/quote', quoteRoutes);
  // app.use('/api/v1/transfer', transferRoutes);
  // app.use('/api/v1/webhook', webhookRoutes);
  // app.use('/api/v1/faucet', faucetRoutes);

  // Temporary basic route for testing
  app.get('/', (req, res) => {
    res.json({
      success: true,
      data: {
        message: 'LineX API is running',
        version: '1.0.0',
        environment: config.nodeEnv,
        timestamp: new Date().toISOString(),
      },
      error: null,
    });
  });

  // Basic health check route
  app.get('/health', (req, res) => {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.nodeEnv,
      },
      error: null,
    });
  });

  // Error handling middleware (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;