/**
 * Health Check Routes
 * 
 * Provides comprehensive health monitoring for all system components
 * including Redis, Kaia blockchain, and service availability.
 */

import { Router, Request, Response } from 'express';
import { redisClient } from '../../services/redis/client';
import { kaiaProvider } from '../../services/blockchain/provider';
import { simpleContractService } from '../../services/blockchain';
import { asyncHandler } from '../middleware/errorHandler';
import config from '../../config';
import logger from '../../utils/logger';

const router: Router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  environment: string;
  services: {
    redis: ServiceHealth;
    blockchain: ServiceHealth;
    contract: ServiceHealth;
  };
  version: string;
}

interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  details?: any;
  error?: string;
}

/**
 * Basic health check endpoint
 * GET /health
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  // Check Redis health
  const redisHealth = await checkRedisHealth();
  
  // Check Kaia blockchain health
  const blockchainHealth = await checkBlockchainHealth();
  
  // Check contract health
  const contractHealth = await checkContractHealth();
  
  // Determine overall system health
  const services = { redis: redisHealth, blockchain: blockchainHealth, contract: contractHealth };
  const overallStatus = determineOverallStatus(services);
  
  const healthStatus: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv,
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
      requestId: (req as any).correlationId,
    },
  });

  // Log health check results
  if (overallStatus !== 'healthy') {
    logger.warn('🏥 Health check shows degraded or unhealthy status', {
      status: overallStatus,
      services,
      responseTime: totalLatency,
    });
  }
}));

/**
 * Detailed health check endpoint
 * GET /health/detailed
 */
router.get('/detailed', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  const [redisHealth, blockchainHealth, contractHealth] = await Promise.allSettled([
    checkRedisHealthDetailed(),
    checkBlockchainHealthDetailed(),
    checkContractHealthDetailed(),
  ]);

  const services = {
    redis: redisHealth.status === 'fulfilled' ? redisHealth.value : { 
      status: 'unhealthy' as const, 
      error: redisHealth.status === 'rejected' ? redisHealth.reason?.message : 'Unknown error' 
    },
    blockchain: blockchainHealth.status === 'fulfilled' ? blockchainHealth.value : { 
      status: 'unhealthy' as const, 
      error: blockchainHealth.status === 'rejected' ? blockchainHealth.reason?.message : 'Unknown error' 
    },
    contract: contractHealth.status === 'fulfilled' ? contractHealth.value : { 
      status: 'unhealthy' as const, 
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
      environment: config.nodeEnv,
      responseTime: `${totalLatency}ms`,
      services,
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      },
      config: {
        demoMode: config.demoMode,
        kaiaChainId: config.kaia.chainId,
        port: config.port,
      },
    },
    error: null,
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: (req as any).correlationId,
    },
  });
}));

/**
 * Readiness probe endpoint
 * GET /health/ready
 */
router.get('/ready', asyncHandler(async (req: Request, res: Response) => {
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
  } else {
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

/**
 * Liveness probe endpoint
 * GET /health/live
 */
router.get('/live', (req: Request, res: Response) => {
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

// Helper functions

async function checkRedisHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  try {
    await redisClient.ping();
    const latency = Date.now() - startTime;
    return {
      status: latency < 100 ? 'healthy' : 'degraded',
      latency,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Redis connection failed',
    };
  }
}

async function checkBlockchainHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  try {
    const provider = kaiaProvider.getProvider();
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
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Blockchain connection failed',
    };
  }
}

async function checkContractHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  try {
    const contractResult = await simpleContractService.getContractInfo();
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
    } else {
      return {
        status: 'unhealthy',
        error: contractResult.error || 'Contract call failed',
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Contract interaction failed',
    };
  }
}

async function checkRedisHealthDetailed(): Promise<ServiceHealth> {
  const startTime = Date.now();
  try {
    // Use ping for basic connectivity
    await redisClient.ping();
    const latency = Date.now() - startTime;
    
    return {
      status: latency < 100 ? 'healthy' : 'degraded',
      latency,
      details: {
        connected: true,
        responseTime: `${latency}ms`,
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Redis detailed check failed',
    };
  }
}

async function checkBlockchainHealthDetailed(): Promise<ServiceHealth> {
  const startTime = Date.now();
  try {
    const provider = kaiaProvider.getProvider();
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
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Blockchain detailed check failed',
    };
  }
}

async function checkContractHealthDetailed(): Promise<ServiceHealth> {
  const startTime = Date.now();
  try {
    const contractResult = await simpleContractService.getContractInfo();
    const latency = Date.now() - startTime;
    
    if (contractResult.success && contractResult.data) {
      return {
        status: latency < 1000 ? 'healthy' : 'degraded',
        latency,
        details: {
          ...contractResult.data,
          // Convert totalSupply to serializable format
          totalSupply: contractResult.data.totalSupply?.formatted || 'Unknown',
        },
      };
    } else {
      return {
        status: 'unhealthy',
        error: contractResult.error || 'Contract detailed check failed',
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Contract detailed check failed',
    };
  }
}

async function checkSystemReadiness(): Promise<boolean> {
  try {
    // Check critical services
    const provider = kaiaProvider.getProvider();
    const [redisReady, blockchainReady] = await Promise.allSettled([
      redisClient.ping(),
      provider ? provider.getBlockNumber() : Promise.reject('Provider not available'),
    ]);

    return redisReady.status === 'fulfilled' && blockchainReady.status === 'fulfilled';
  } catch {
    return false;
  }
}

function determineOverallStatus(services: { [key: string]: ServiceHealth }): 'healthy' | 'degraded' | 'unhealthy' {
  const statuses = Object.values(services).map(service => service.status);
  
  if (statuses.includes('unhealthy')) {
    return 'unhealthy';
  }
  
  if (statuses.includes('degraded')) {
    return 'degraded';
  }
  
  return 'healthy';
}

export default router;