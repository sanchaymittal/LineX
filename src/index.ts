import { createApp } from './app';
import config from './config';
import logger from './utils/logger';
import { redisClient } from './services/redis/client';
import { kaiaProvider } from './services/blockchain/provider';

// Global state for Vercel deployment
let isInitialized = false;
let app: any = null;

async function initializeServices(): Promise<void> {
  if (isInitialized) {
    return;
  }

  try {
    // Connect to Redis
    if (!redisClient.getClient().isOpen) {
      logger.info('🔗 Connecting to Redis...');
      await redisClient.connect();
      logger.info('✅ Connected to Redis successfully');
    }

    // Connect to Kaia blockchain
    logger.info('🔗 Connecting to Kaia blockchain...');
    await kaiaProvider.connect();
    logger.info('✅ Connected to Kaia blockchain successfully');

    isInitialized = true;
    logger.info('🚀 LineX services initialized');
  } catch (error) {
    logger.error('❌ Failed to initialize services:', error);
    throw error;
  }
}

async function createInitializedApp() {
  await initializeServices();
  
  if (!app) {
    app = createApp();
    logger.info('📡 Express app created');
  }
  
  return app;
}

async function startServer(): Promise<void> {
  try {
    // Initialize services and create app
    const expressApp = await createInitializedApp();

    // Start the server (local development only)
    const server = expressApp.listen(config.port, () => {
      logger.info(`🚀 LineX server started successfully`);
      logger.info(`📡 Server running on port ${config.port}`);
      logger.info(`🌍 Environment: ${config.nodeEnv}`);
      logger.info(`🔄 Demo mode: ${config.demoMode ? 'enabled' : 'disabled'}`);
      
      if (config.demoMode) {
        logger.info('🎯 Demo endpoints available:');
        logger.info(`   • Health check: http://localhost:${config.port}/health`);
        logger.info(`   • API root: http://localhost:${config.port}/`);
      }
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.info(`🛑 Received ${signal}, starting graceful shutdown...`);
      
      // Close HTTP server
      server.close(() => {
        logger.info('✅ HTTP server closed');
      });

      try {
        // Disconnect from Kaia
        await kaiaProvider.disconnect();
        logger.info('✅ Kaia connection closed');
        
        // Disconnect from Redis
        await redisClient.disconnect();
        logger.info('✅ Redis connection closed');
        
        logger.info('✅ Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };

    // Listen for termination signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('unhandledRejection');
    });

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// For local development
if (require.main === module) {
  startServer();
}

// For Vercel deployment - export the initialized Express app
export default async (req: any, res: any) => {
  try {
    const expressApp = await createInitializedApp();
    return expressApp(req, res);
  } catch (error) {
    logger.error('💥 Vercel deployment error:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: {
        code: 'DEPLOYMENT_ERROR',
        message: 'Internal server error during deployment',
      },
      metadata: {
        timestamp: new Date().toISOString(),
      }
    });
  }
};

export { startServer };