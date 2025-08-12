// Kaia blockchain configuration
import config from './index';
import logger from '../utils/logger';

export interface KaiaConfig {
  rpcUrl: string;
  chainId: number;
  networkName: string;
  blockTime: number;
  finality: number;
}

export const KAIA_NETWORKS = {
  MAINNET: {
    rpcUrl: 'https://public-en.node.kaia.io',
    chainId: 8217,
    networkName: 'Kaia Mainnet',
    blockTime: 1000, // 1 second
    finality: 1, // Immediate finality
  },
  TESTNET: {
    rpcUrl: 'https://public-en-kairos.node.kaia.io',
    chainId: 1001,
    networkName: 'Kaia Testnet (Kairos)',
    blockTime: 1000, // 1 second
    finality: 1, // Immediate finality
  },
} as const;

export function getKaiaConfig(): KaiaConfig {
  const isTestnet = config.kaia.chainId === 1001;
  return isTestnet ? KAIA_NETWORKS.TESTNET : KAIA_NETWORKS.MAINNET;
}

export function validateKaiaConfig(): void {
  const errors: string[] = [];

  if (!config.kaia.rpcUrl) {
    errors.push('KAIA_RPC_URL is required');
  }

  if (!config.kaia.chainId || ![8217, 1001].includes(config.kaia.chainId)) {
    errors.push('KAIA_CHAIN_ID must be 8217 (mainnet) or 1001 (testnet)');
  }

  if (config.nodeEnv === 'production' && config.kaia.chainId === 1001) {
    logger.warn('⚠️  Using Kaia testnet in production environment');
  }

  if (errors.length > 0) {
    throw new Error(`Kaia configuration errors: ${errors.join(', ')}`);
  }

  logger.info(`🔗 Kaia network configured: ${getKaiaConfig().networkName}`);
}