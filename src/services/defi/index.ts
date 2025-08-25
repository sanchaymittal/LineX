/**
 * DeFi Services Index
 * Initializes and exports all DeFi services
 */

import { KaiaProviderManager } from '../blockchain/provider';
import { FeeDelegationService } from '../blockchain/feeDelegationService';
import { RedisService } from '../redis/redisService';
import { SYVaultService } from './syVaultService';
import { PYTNYTService } from './pytNytService';
import { YieldService } from './yieldService';
import { PortfolioService } from './portfolioService';
import { StrategyService } from './strategyService';
import { AnalyticsService } from './analyticsService';
import logger from '../../utils/logger';

export interface DeFiServices {
  syVaultService: SYVaultService;
  pytNytService: PYTNYTService;
  yieldService: YieldService;
  portfolioService: PortfolioService;
  strategyService: StrategyService;
  analyticsService: AnalyticsService;
}

/**
 * Initialize all DeFi services with their dependencies
 */
export async function initializeDeFiServices(): Promise<DeFiServices> {
  try {
    logger.info('🔄 Initializing DeFi services...');

    // Initialize core dependencies
    const kaiaProvider = new KaiaProviderManager();
    const redisService = new RedisService();
    const feeDelegation = new FeeDelegationService(kaiaProvider);

    // Connect to Kaia provider
    await kaiaProvider.connect();
    logger.info('✅ Kaia provider connected for DeFi services');

    // Initialize DeFi services
    const syVaultService = new SYVaultService(kaiaProvider, feeDelegation, redisService);
    const pytNytService = new PYTNYTService(kaiaProvider, feeDelegation, redisService);
    const yieldService = new YieldService(kaiaProvider, feeDelegation, redisService);
    const portfolioService = new PortfolioService(kaiaProvider, feeDelegation, redisService);
    const strategyService = new StrategyService(kaiaProvider, redisService);
    const analyticsService = new AnalyticsService(kaiaProvider, redisService);

    logger.info('✅ All DeFi services initialized successfully');

    return {
      syVaultService,
      pytNytService,
      yieldService,
      portfolioService,
      strategyService,
      analyticsService
    };

  } catch (error) {
    logger.error('❌ Failed to initialize DeFi services:', error);
    throw new Error(`DeFi services initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Attach DeFi services to Express app locals for use in routes
 */
export function attachDeFiServices(app: any, services: DeFiServices): void {
  if (!app.locals.services) {
    app.locals.services = {};
  }

  // Attach each service to app.locals for route access
  Object.assign(app.locals.services, services);

  logger.info('✅ DeFi services attached to Express app');
}