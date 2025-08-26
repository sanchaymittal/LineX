/**
 * DeFi Services Index
 * Initializes and exports all DeFi services
 */

import { KaiaProviderManager } from '../blockchain/provider';
import { FeeDelegationService } from '../blockchain/feeDelegationService';
import { RedisService } from '../redis/redisService';
import { SYVaultService } from './syVaultService';
import { AutoCompoundVaultService } from './autoCompoundVaultService';
import logger from '../../utils/logger';

export interface DeFiServices {
  standardizedYieldService: SYVaultService;
  autoCompoundVaultService: AutoCompoundVaultService;
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
    const feeDelegation = new FeeDelegationService();

    // Connect to Kaia provider
    await kaiaProvider.connect();
    logger.info('✅ Kaia provider connected for DeFi services');

    // Initialize DeFi services - 1:1 mapping to contracts
    const standardizedYieldService = new SYVaultService(kaiaProvider, feeDelegation, redisService);
    const autoCompoundVaultService = new AutoCompoundVaultService(kaiaProvider, feeDelegation, redisService);

    logger.info('✅ All DeFi services initialized successfully');

    return {
      standardizedYieldService,
      autoCompoundVaultService
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
  // Create defiServices object with the correct property names
  app.locals.defiServices = {
    vault: services.standardizedYieldService,
    autoCompoundVault: services.autoCompoundVaultService
  };

  // Also keep the original services for backward compatibility
  if (!app.locals.services) {
    app.locals.services = {};
  }
  Object.assign(app.locals.services, services);
}