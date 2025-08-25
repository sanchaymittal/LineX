import { createApp } from './app';
import config from './config';
import logger from './utils/logger';
import { redisClient } from './services/redis/client';
import { kaiaProvider } from './services/blockchain/provider';
import { initializeDeFiServices, attachDeFiServices } from './services/defi';

// Global state for Vercel deployment
let isInitialized = false;
let app: any = null;

async function initializeServices(): Promise<void> {
  if (isInitialized) {
    return;
  }

  try {
    // Connect to Redis with timeout
    if (!redisClient.getClient().isOpen) {
      console.log('🔗 Connecting to Redis...');
      const redisTimeout = setTimeout(() => {
        throw new Error('Redis connection timeout');
      }, 10000); // 10 second timeout
      
      await redisClient.connect();
      clearTimeout(redisTimeout);
      console.log('✅ Connected to Redis successfully');
    }

    // Connect to Kaia blockchain with timeout
    console.log('🔗 Connecting to Kaia blockchain...');
    const kaiaTimeout = setTimeout(() => {
      throw new Error('Kaia connection timeout');
    }, 10000); // 10 second timeout
    
    await kaiaProvider.connect();
    clearTimeout(kaiaTimeout);
    console.log('✅ Connected to Kaia blockchain successfully');

    isInitialized = true;
    console.log('🚀 LineX services initialized');
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
    // In serverless, we might want to continue with partial functionality
    if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️ Continuing with partial service initialization in production');
      isInitialized = true; // Allow app to start even with service failures
    } else {
      throw error;
    }
  }
}

async function createInitializedApp() {
  await initializeServices();
  
  if (!app) {
    app = createApp();
    
    // TODO: Initialize and attach DeFi services once TypeScript issues are resolved
    // try {
    //   const defiServices = await initializeDeFiServices();
    //   attachDeFiServices(app, defiServices);
    //   logger.info('✅ DeFi services attached to Express app');
    // } catch (error) {
    //   logger.error('❌ Failed to initialize DeFi services:', error);
    //   // Continue without DeFi services in case of failure
    // }
    
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
    // Add CORS headers immediately
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization, X-Webhook-Signature');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    const expressApp = await createInitializedApp();
    // Properly handle the Express app in serverless environment
    expressApp(req, res);
  } catch (error) {
    console.error('💥 Vercel deployment error:', error);
    res.status(500).json({
      success: false,
      data: null,
      error: {
        code: 'DEPLOYMENT_ERROR',
        message: 'Internal server error during deployment',
        details: error instanceof Error ? error.message : String(error)
      },
      metadata: {
        timestamp: new Date().toISOString(),
      }
    });
  }
};

export { startServer };