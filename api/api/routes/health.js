"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("../../services/redis/client");
const provider_1 = require("../../services/blockchain/provider");
const blockchain_1 = require("../../services/blockchain");
const errorHandler_1 = require("../middleware/errorHandler");
const config_1 = __importDefault(require("../../config"));
const logger_1 = __importDefault(require("../../utils/logger"));
const router = (0, express_1.Router)();
router.get('/', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const startTime = Date.now();
    const redisHealth = await checkRedisHealth();
    const blockchainHealth = await checkBlockchainHealth();
    const contractHealth = await checkContractHealth();
    const services = { redis: redisHealth, blockchain: blockchainHealth, contract: contractHealth };
    const overallStatus = determineOverallStatus(services);
    const healthStatus = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config_1.default.nodeEnv,
        services,
        version: '1.0.0',
    };
    const statusCode = overallStatus === 'healthy' ? 200 :
        overallStatus === 'degraded' ? 200 : 503;
    const totalLatency = Date.now() - startTime;
    res.status(statusCode).json({
        success: overallStatus !== 'unhealthy',
        data: {
            ...healthStatus,
            responseTime: `${totalLatency}ms`,
        },
        error: overallStatus === 'unhealthy' ? {
            code: 'SYSTEM_UNHEALTHY',
            message: 'One or more critical services are unhealthy',
        } : null,
        metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.correlationId,
        },
    });
    if (overallStatus !== 'healthy') {
        logger_1.default.warn('🏥 Health check shows degraded or unhealthy status', {
            status: overallStatus,
            services,
            responseTime: totalLatency,
        });
    }
}));
router.get('/detailed', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const startTime = Date.now();
    const [redisHealth, blockchainHealth, contractHealth] = await Promise.allSettled([
        checkRedisHealthDetailed(),
        checkBlockchainHealthDetailed(),
        checkContractHealthDetailed(),
    ]);
    const services = {
        redis: redisHealth.status === 'fulfilled' ? redisHealth.value : {
            status: 'unhealthy',
            error: redisHealth.status === 'rejected' ? redisHealth.reason?.message : 'Unknown error'
        },
        blockchain: blockchainHealth.status === 'fulfilled' ? blockchainHealth.value : {
            status: 'unhealthy',
            error: blockchainHealth.status === 'rejected' ? blockchainHealth.reason?.message : 'Unknown error'
        },
        contract: contractHealth.status === 'fulfilled' ? contractHealth.value : {
            status: 'unhealthy',
            error: contractHealth.status === 'rejected' ? contractHealth.reason?.message : 'Unknown error'
        },
    };
    const overallStatus = determineOverallStatus(services);
    const totalLatency = Date.now() - startTime;
    const statusCode = overallStatus === 'healthy' ? 200 :
        overallStatus === 'degraded' ? 200 : 503;
    res.status(statusCode).json({
        success: overallStatus !== 'unhealthy',
        data: {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: config_1.default.nodeEnv,
            responseTime: `${totalLatency}ms`,
            services,
            system: {
                nodeVersion: process.version,
                platform: process.platform,
                memory: process.memoryUsage(),
                cpuUsage: process.cpuUsage(),
            },
            config: {
                demoMode: config_1.default.demoMode,
                kaiaChainId: config_1.default.kaia.chainId,
                port: config_1.default.port,
            },
        },
        error: null,
        metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.correlationId,
        },
    });
}));
router.get('/ready', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const isReady = await checkSystemReadiness();
    if (isReady) {
        res.status(200).json({
            success: true,
            data: {
                status: 'ready',
                timestamp: new Date().toISOString(),
            },
            error: null,
        });
    }
    else {
        res.status(503).json({
            success: false,
            data: null,
            error: {
                code: 'SYSTEM_NOT_READY',
                message: 'System is not ready to serve requests',
            },
            metadata: {
                timestamp: new Date().toISOString(),
            },
        });
    }
}));
router.get('/live', (req, res) => {
    res.status(200).json({
        success: true,
        data: {
            status: 'alive',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
        },
        error: null,
    });
});
async function checkRedisHealth() {
    const startTime = Date.now();
    try {
        await client_1.redisClient.ping();
        const latency = Date.now() - startTime;
        return {
            status: latency < 100 ? 'healthy' : 'degraded',
            latency,
        };
    }
    catch (error) {
        return {
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Redis connection failed',
        };
    }
}
async function checkBlockchainHealth() {
    const startTime = Date.now();
    try {
        const provider = provider_1.kaiaProvider.getProvider();
        if (!provider) {
            return {
                status: 'unhealthy',
                error: 'Kaia provider not available',
            };
        }
        await provider.getBlockNumber();
        const latency = Date.now() - startTime;
        return {
            status: latency < 2000 ? 'healthy' : 'degraded',
            latency,
        };
    }
    catch (error) {
        return {
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Blockchain connection failed',
        };
    }
}
async function checkContractHealth() {
    const startTime = Date.now();
    try {
        const contractResult = await blockchain_1.simpleContractService.getContractInfo();
        const latency = Date.now() - startTime;
        if (contractResult.success && contractResult.data) {
            return {
                status: latency < 1000 ? 'healthy' : 'degraded',
                latency,
                details: {
                    address: contractResult.data.address,
                    name: contractResult.data.name,
                    symbol: contractResult.data.symbol,
                },
            };
        }
        else {
            return {
                status: 'unhealthy',
                error: contractResult.error || 'Contract call failed',
            };
        }
    }
    catch (error) {
        return {
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Contract interaction failed',
        };
    }
}
async function checkRedisHealthDetailed() {
    const startTime = Date.now();
    try {
        await client_1.redisClient.ping();
        const latency = Date.now() - startTime;
        return {
            status: latency < 100 ? 'healthy' : 'degraded',
            latency,
            details: {
                connected: true,
                responseTime: `${latency}ms`,
            },
        };
    }
    catch (error) {
        return {
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Redis detailed check failed',
        };
    }
}
async function checkBlockchainHealthDetailed() {
    const startTime = Date.now();
    try {
        const provider = provider_1.kaiaProvider.getProvider();
        if (!provider) {
            return {
                status: 'unhealthy',
                error: 'Provider not available',
            };
        }
        const [blockNumber, gasPrice, network] = await Promise.all([
            provider.getBlockNumber(),
            provider.getGasPrice(),
            provider.getNetwork(),
        ]);
        const latency = Date.now() - startTime;
        return {
            status: latency < 2000 ? 'healthy' : 'degraded',
            latency,
            details: {
                chainId: network.chainId,
                blockNumber,
                gasPrice: gasPrice.toString(),
                networkName: network.name,
            },
        };
    }
    catch (error) {
        return {
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Blockchain detailed check failed',
        };
    }
}
async function checkContractHealthDetailed() {
    const startTime = Date.now();
    try {
        const contractResult = await blockchain_1.simpleContractService.getContractInfo();
        const latency = Date.now() - startTime;
        if (contractResult.success && contractResult.data) {
            return {
                status: latency < 1000 ? 'healthy' : 'degraded',
                latency,
                details: {
                    ...contractResult.data,
                    totalSupply: contractResult.data.totalSupply?.formatted || 'Unknown',
                },
            };
        }
        else {
            return {
                status: 'unhealthy',
                error: contractResult.error || 'Contract detailed check failed',
            };
        }
    }
    catch (error) {
        return {
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Contract detailed check failed',
        };
    }
}
async function checkSystemReadiness() {
    try {
        const provider = provider_1.kaiaProvider.getProvider();
        const [redisReady, blockchainReady] = await Promise.allSettled([
            client_1.redisClient.ping(),
            provider ? provider.getBlockNumber() : Promise.reject('Provider not available'),
        ]);
        return redisReady.status === 'fulfilled' && blockchainReady.status === 'fulfilled';
    }
    catch {
        return false;
    }
}
function determineOverallStatus(services) {
    const statuses = Object.values(services).map(service => service.status);
    if (statuses.includes('unhealthy')) {
        return 'unhealthy';
    }
    if (statuses.includes('degraded')) {
        return 'degraded';
    }
    return 'healthy';
}
exports.default = router;
//# sourceMappingURL=health.js.map