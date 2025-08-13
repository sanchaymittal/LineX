"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
const app_1 = require("./app");
const config_1 = __importDefault(require("./config"));
const logger_1 = __importDefault(require("./utils/logger"));
const client_1 = require("./services/redis/client");
const provider_1 = require("./services/blockchain/provider");
let isInitialized = false;
let app = null;
async function initializeServices() {
    if (isInitialized) {
        return;
    }
    try {
        if (!client_1.redisClient.getClient().isOpen) {
            console.log('🔗 Connecting to Redis...');
            const redisTimeout = setTimeout(() => {
                throw new Error('Redis connection timeout');
            }, 10000);
            await client_1.redisClient.connect();
            clearTimeout(redisTimeout);
            console.log('✅ Connected to Redis successfully');
        }
        console.log('🔗 Connecting to Kaia blockchain...');
        const kaiaTimeout = setTimeout(() => {
            throw new Error('Kaia connection timeout');
        }, 10000);
        await provider_1.kaiaProvider.connect();
        clearTimeout(kaiaTimeout);
        console.log('✅ Connected to Kaia blockchain successfully');
        isInitialized = true;
        console.log('🚀 LineX services initialized');
    }
    catch (error) {
        console.error('❌ Failed to initialize services:', error);
        if (process.env.NODE_ENV === 'production') {
            console.warn('⚠️ Continuing with partial service initialization in production');
            isInitialized = true;
        }
        else {
            throw error;
        }
    }
}
async function createInitializedApp() {
    await initializeServices();
    if (!app) {
        app = (0, app_1.createApp)();
        logger_1.default.info('📡 Express app created');
    }
    return app;
}
async function startServer() {
    try {
        const expressApp = await createInitializedApp();
        const server = expressApp.listen(config_1.default.port, () => {
            logger_1.default.info(`🚀 LineX server started successfully`);
            logger_1.default.info(`📡 Server running on port ${config_1.default.port}`);
            logger_1.default.info(`🌍 Environment: ${config_1.default.nodeEnv}`);
            logger_1.default.info(`🔄 Demo mode: ${config_1.default.demoMode ? 'enabled' : 'disabled'}`);
            if (config_1.default.demoMode) {
                logger_1.default.info('🎯 Demo endpoints available:');
                logger_1.default.info(`   • Health check: http://localhost:${config_1.default.port}/health`);
                logger_1.default.info(`   • API root: http://localhost:${config_1.default.port}/`);
            }
        });
        const gracefulShutdown = async (signal) => {
            logger_1.default.info(`🛑 Received ${signal}, starting graceful shutdown...`);
            server.close(() => {
                logger_1.default.info('✅ HTTP server closed');
            });
            try {
                await provider_1.kaiaProvider.disconnect();
                logger_1.default.info('✅ Kaia connection closed');
                await client_1.redisClient.disconnect();
                logger_1.default.info('✅ Redis connection closed');
                logger_1.default.info('✅ Graceful shutdown completed');
                process.exit(0);
            }
            catch (error) {
                logger_1.default.error('❌ Error during shutdown:', error);
                process.exit(1);
            }
        };
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('uncaughtException', (error) => {
            logger_1.default.error('💥 Uncaught Exception:', error);
            gracefulShutdown('uncaughtException');
        });
        process.on('unhandledRejection', (reason, promise) => {
            logger_1.default.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
            gracefulShutdown('unhandledRejection');
        });
    }
    catch (error) {
        logger_1.default.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}
if (require.main === module) {
    startServer();
}
exports.default = async (req, res) => {
    try {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization, X-Webhook-Signature');
        if (req.method === 'OPTIONS') {
            res.status(200).end();
            return;
        }
        const expressApp = await createInitializedApp();
        expressApp(req, res);
    }
    catch (error) {
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
//# sourceMappingURL=index.js.map