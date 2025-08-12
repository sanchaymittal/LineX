import { createApp } from './app';
import config from './config';
import logger from './utils/logger';
import { redisClient } from './services/redis/client';

async function startServer(): Promise<void> {
  try {
    // Connect to Redis
    logger.info('Connecting to Redis...');
    await redisClient.connect();
    logger.info('✅ Connected to Redis successfully');

    // Create Express app
    const app = createApp();

    // Start the server
    const server = app.listen(config.port, () => {
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

// Start the server
if (require.main === module) {
  startServer();
}

export { startServer };