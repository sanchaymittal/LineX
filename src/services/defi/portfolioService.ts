/**
 * Portfolio Service
 * Handles YieldSet portfolio management operations
 */

import { Contract, formatUnits, verifyTypedData, Interface } from 'ethers';
import { KaiaProviderManager } from '../blockchain/provider';
import { FeeDelegationService } from '../blockchain/feeDelegationService';
import { RedisService } from '../redis/redisService';
import logger from '../../utils/logger';

export interface PortfolioCreateParams {
  user: string;
  assets: string[];
  allocations: number[];
  totalAmount: string;
  signature: string;
  nonce: number;
  deadline: number;
}

export interface PortfolioRedeemParams {
  user: string;
  portfolioTokens: string;
  signature: string;
  nonce: number;
  deadline: number;
}

export interface RebalanceParams {
  user: string;
  newAllocations: number[];
  signature: string;
  nonce: number;
  deadline: number;
}

export interface PortfolioComposition {
  totalValue: string;
  positions: Array<{
    vault: string;
    allocation: number;
    value: string;
    apy: number;
  }>;
  portfolioTokens: string;
  lastRebalance: number;
}

export interface PortfolioPerformance {
  totalReturn: string;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  performanceHistory: Array<{
    timestamp: number;
    value: string;
    apy: number;
  }>;
}

export class PortfolioService {
  private kaiaProvider: KaiaProviderManager;
  private feeDelegation: FeeDelegationService;
  private redis: RedisService;
  private yieldSetAddress: string;

  constructor(
    kaiaProvider: KaiaProviderManager,
    feeDelegation: FeeDelegationService,
    redis: RedisService
  ) {
    this.kaiaProvider = kaiaProvider;
    this.feeDelegation = feeDelegation;
    this.redis = redis;
    this.yieldSetAddress = process.env.YIELD_SET_ADDRESS || '';
  }

  /**
   * Create diversified portfolio position
   */
  async createPortfolio(params: PortfolioCreateParams): Promise<{ txHash: string; portfolioTokens: string }> {
    try {
      logger.info(`Portfolio creation initiated for user ${params.user}, amount: ${params.totalAmount}`);

      // Verify EIP-712 signature for portfolio creation
      await this.verifyPortfolioSignature(params, 'create');

      // Validate allocations sum to 100%
      const totalAllocation = params.allocations.reduce((sum, alloc) => sum + alloc, 0);
      if (Math.abs(totalAllocation - 100) > 0.01) {
        throw new Error('Allocations must sum to 100%');
      }

      // Execute gasless portfolio creation via fee delegation
      const txHash = await this.feeDelegation.executePortfolioCreate({
        user: params.user,
        assets: params.assets,
        allocations: params.allocations,
        totalAmount: params.totalAmount,
        yieldSet: this.yieldSetAddress,
        signature: params.signature,
        nonce: params.nonce,
        deadline: params.deadline
      });

      // Get portfolio tokens minted from transaction receipt
      const portfolioTokens = await this.getPortfolioTokensMinted(txHash);

      // Update user portfolio position in Redis
      await this.updatePortfolioPosition(params.user, portfolioTokens, 'create');

      logger.info(`Portfolio creation completed. TxHash: ${txHash}, Tokens: ${portfolioTokens}`);
      return { txHash, portfolioTokens };

    } catch (error) {
      logger.error('Portfolio creation failed:', error);
      throw new Error(`Portfolio creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Redeem portfolio position
   */
  async redeemPortfolio(params: PortfolioRedeemParams): Promise<{ txHash: string; assets: string[] }> {
    try {
      logger.info(`Portfolio redemption initiated for user ${params.user}, tokens: ${params.portfolioTokens}`);

      // Verify EIP-712 signature for portfolio redemption
      await this.verifyPortfolioSignature(params, 'redeem');

      // Execute gasless portfolio redemption via fee delegation
      const txHash = await this.feeDelegation.executePortfolioRedeem({
        user: params.user,
        portfolioTokens: params.portfolioTokens,
        yieldSet: this.yieldSetAddress,
        signature: params.signature,
        nonce: params.nonce,
        deadline: params.deadline
      });

      // Get redeemed assets from transaction receipt
      const assets = await this.getRedeemedAssets(txHash);

      // Update user portfolio position in Redis
      await this.updatePortfolioPosition(params.user, params.portfolioTokens, 'redeem');

      logger.info(`Portfolio redemption completed. TxHash: ${txHash}`);
      return { txHash, assets };

    } catch (error) {
      logger.error('Portfolio redemption failed:', error);
      throw new Error(`Portfolio redemption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Trigger portfolio rebalancing
   */
  async rebalancePortfolio(params: RebalanceParams): Promise<{ txHash: string; newComposition: PortfolioComposition }> {
    try {
      logger.info(`Portfolio rebalancing initiated for user ${params.user}`);

      // Verify EIP-712 signature for rebalancing
      await this.verifyPortfolioSignature(params, 'rebalance');

      // Validate new allocations sum to 100%
      const totalAllocation = params.newAllocations.reduce((sum, alloc) => sum + alloc, 0);
      if (Math.abs(totalAllocation - 100) > 0.01) {
        throw new Error('New allocations must sum to 100%');
      }

      // Execute gasless rebalancing via fee delegation
      const txHash = await this.feeDelegation.executePortfolioRebalance({
        user: params.user,
        newAllocations: params.newAllocations,
        yieldSet: this.yieldSetAddress,
        signature: params.signature,
        nonce: params.nonce,
        deadline: params.deadline
      });

      // Get new portfolio composition
      const newComposition = await this.getPortfolioComposition(params.user);

      // Update rebalance timestamp in Redis
      await this.updateRebalanceTimestamp(params.user);

      logger.info(`Portfolio rebalancing completed. TxHash: ${txHash}`);
      return { txHash, newComposition };

    } catch (error) {
      logger.error('Portfolio rebalancing failed:', error);
      throw new Error(`Portfolio rebalancing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get portfolio composition and value
   */
  async getPortfolioComposition(userAddress: string): Promise<PortfolioComposition> {
    try {
      // Check Redis cache first (5-minute TTL)
      const cacheKey = `defi:portfolio:composition:${userAddress}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const composition = JSON.parse(cached);
        if (Date.now() - composition.lastUpdate < 300000) {
          return composition;
        }
      }

      const provider = await this.kaiaProvider.getProvider();
      const yieldSetContract = new Contract(
        this.yieldSetAddress,
        [
          'function balanceOf(address) view returns (uint256)',
          'function getUserPortfolio(address) view returns (address[], uint256[], uint256)',
          'function getPortfolioValue(address) view returns (uint256)'
        ],
        provider
      );

      const [portfolioTokens, portfolioValue] = await Promise.all([
        yieldSetContract.balanceOf(userAddress),
        yieldSetContract.getPortfolioValue(userAddress)
      ]);

      const [vaults, allocations] = await yieldSetContract.getUserPortfolio(userAddress);

      // Get individual vault APYs and values
      const positions = await Promise.all(
        vaults.map(async (vault: string, index: number) => {
          const allocation = parseFloat(formatUnits(allocations[index], 4)) * 100;
          const value = portfolioValue * allocations[index] / BigInt(10000); // Convert basis points
          
          // Get vault APY (would need to query individual vault contracts)
          const apy = await this.getVaultAPY(vault);
          
          return {
            vault,
            allocation,
            value: value.toString(),
            apy
          };
        })
      );

      // Get last rebalance timestamp from Redis
      const portfolioData = await this.redis.get(`defi:portfolio:${userAddress}`);
      const lastRebalance = portfolioData ? JSON.parse(portfolioData).lastRebalance || 0 : 0;

      const composition: PortfolioComposition = {
        totalValue: portfolioValue.toString(),
        positions,
        portfolioTokens: portfolioTokens.toString(),
        lastRebalance
      };

      // Cache for 5 minutes
      await this.redis.setWithTTL(cacheKey, JSON.stringify({
        ...composition,
        lastUpdate: Date.now()
      }), 300);

      return composition;

    } catch (error) {
      logger.error(`Failed to get portfolio composition for ${userAddress}:`, error);
      throw new Error('Failed to fetch portfolio composition');
    }
  }

  /**
   * Get portfolio performance analytics
   */
  async getPortfolioPerformance(userAddress: string): Promise<PortfolioPerformance> {
    try {
      // Check Redis cache first (1-hour TTL for performance data)
      const cacheKey = `defi:portfolio:performance:${userAddress}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const performance = JSON.parse(cached);
        if (Date.now() - performance.lastUpdate < 3600000) {
          return performance;
        }
      }

      // Get historical performance data from Redis
      const historyKey = `defi:portfolio:history:${userAddress}`;
      const historyData = await this.redis.get(historyKey);
      const history = historyData ? JSON.parse(historyData) : { entries: [] };

      let totalReturn = '0';
      let annualizedReturn = 0;
      let volatility = 0;
      let sharpeRatio = 0;
      let maxDrawdown = 0;

      if (history.entries.length > 1) {
        // Calculate performance metrics
        const entries = history.entries;
        const firstValue = parseFloat(formatUnits(entries[0].value, 6));
        const lastValue = parseFloat(formatUnits(entries[entries.length - 1].value, 6));
        
        totalReturn = ((lastValue - firstValue) / firstValue * 100).toFixed(2);
        
        // Calculate annualized return
        const timeRange = entries[entries.length - 1].timestamp - entries[0].timestamp;
        const years = timeRange / (365 * 24 * 60 * 60 * 1000);
        annualizedReturn = years > 0 ? Math.pow(lastValue / firstValue, 1 / years) - 1 : 0;
        annualizedReturn *= 100;

        // Calculate volatility (standard deviation of returns)
        if (entries.length > 2) {
          const returns = [];
          for (let i = 1; i < entries.length; i++) {
            const prevValue = parseFloat(formatUnits(entries[i - 1].value, 6));
            const currValue = parseFloat(formatUnits(entries[i].value, 6));
            returns.push((currValue - prevValue) / prevValue);
          }
          
          const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
          const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
          volatility = Math.sqrt(variance) * Math.sqrt(365) * 100; // Annualized volatility
          
          // Calculate Sharpe ratio (assuming 0% risk-free rate)
          sharpeRatio = volatility > 0 ? annualizedReturn / volatility : 0;
        }

        // Calculate max drawdown
        let peak = firstValue;
        for (const entry of entries) {
          const value = parseFloat(formatUnits(entry.value, 6));
          if (value > peak) {
            peak = value;
          } else {
            const drawdown = (peak - value) / peak * 100;
            if (drawdown > maxDrawdown) {
              maxDrawdown = drawdown;
            }
          }
        }
      }

      const performance: PortfolioPerformance = {
        totalReturn,
        annualizedReturn: Math.round(annualizedReturn * 100) / 100,
        volatility: Math.round(volatility * 100) / 100,
        sharpeRatio: Math.round(sharpeRatio * 100) / 100,
        maxDrawdown: Math.round(maxDrawdown * 100) / 100,
        performanceHistory: history.entries.slice(-100) // Return last 100 data points
      };

      // Cache for 1 hour
      await this.redis.setWithTTL(cacheKey, JSON.stringify({
        ...performance,
        lastUpdate: Date.now()
      }), 3600);

      return performance;

    } catch (error) {
      logger.error(`Failed to get portfolio performance for ${userAddress}:`, error);
      throw new Error('Failed to fetch portfolio performance');
    }
  }

  /**
   * Get vault APY (helper function)
   */
  private async getVaultAPY(vaultAddress: string): Promise<number> {
    try {
      // Check if it's a known vault type
      if (vaultAddress.toLowerCase() === process.env.SY_VAULT_ADDRESS?.toLowerCase()) {
        // Get from SY vault
        const provider = await this.kaiaProvider.getProvider();
        const vaultContract = new Contract(
          vaultAddress,
          ['function getAPY() view returns (uint256)'],
          provider
        );
        const apy = await vaultContract.getAPY();
        return parseFloat(formatUnits(apy, 18)) * 100;
      }

      // Mock APY for other vaults - would query individual contracts
      return 8.5; // Default mock APY

    } catch (error) {
      logger.error(`Failed to get APY for vault ${vaultAddress}:`, error);
      return 0;
    }
  }

  /**
   * Verify EIP-712 signatures for portfolio operations
   */
  private async verifyPortfolioSignature(params: any, operation: string): Promise<void> {
    const domain = {
      name: 'LineX',
      version: '1',
      chainId: parseInt(process.env.KAIA_CHAIN_ID || '1001'),
      verifyingContract: this.yieldSetAddress
    };

    let types: any;
    let value: any;

    switch (operation) {
      case 'create':
        types = {
          PortfolioCreate: [
            { name: 'user', type: 'address' },
            { name: 'assets', type: 'address[]' },
            { name: 'allocations', type: 'uint256[]' },
            { name: 'totalAmount', type: 'uint256' },
            { name: 'yieldSet', type: 'address' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' }
          ]
        };
        value = {
          user: params.user,
          assets: params.assets,
          allocations: params.allocations,
          totalAmount: params.totalAmount,
          yieldSet: this.yieldSetAddress,
          nonce: params.nonce,
          deadline: params.deadline
        };
        break;
      case 'redeem':
        types = {
          PortfolioRedeem: [
            { name: 'user', type: 'address' },
            { name: 'portfolioTokens', type: 'uint256' },
            { name: 'yieldSet', type: 'address' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' }
          ]
        };
        value = {
          user: params.user,
          portfolioTokens: params.portfolioTokens,
          yieldSet: this.yieldSetAddress,
          nonce: params.nonce,
          deadline: params.deadline
        };
        break;
      case 'rebalance':
        types = {
          PortfolioRebalance: [
            { name: 'user', type: 'address' },
            { name: 'newAllocations', type: 'uint256[]' },
            { name: 'yieldSet', type: 'address' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' }
          ]
        };
        value = {
          user: params.user,
          newAllocations: params.newAllocations,
          yieldSet: this.yieldSetAddress,
          nonce: params.nonce,
          deadline: params.deadline
        };
        break;
      default:
        throw new Error('Invalid operation type');
    }

    const recoveredAddress = verifyTypedData(domain, types, value, params.signature);
    
    if (recoveredAddress.toLowerCase() !== params.user.toLowerCase()) {
      throw new Error('Invalid signature');
    }

    if (Date.now() > params.deadline * 1000) {
      throw new Error('Signature expired');
    }
  }

  /**
   * Extract portfolio tokens minted from transaction
   */
  private async getPortfolioTokensMinted(txHash: string): Promise<string> {
    try {
      const provider = await this.kaiaProvider.getProvider();
      const receipt = await provider.getTransactionReceipt(txHash);
      
      const yieldSetInterface = new Interface([
        'event PortfolioCreated(address indexed user, uint256 portfolioTokens, uint256 totalValue)'
      ]);

      for (const log of receipt.logs) {
        try {
          if (log.address.toLowerCase() === this.yieldSetAddress.toLowerCase()) {
            const parsed = yieldSetInterface.parseLog(log);
            if (parsed.name === 'PortfolioCreated') {
              return parsed.args.portfolioTokens.toString();
            }
          }
        } catch (e) {
          // Skip non-matching logs
        }
      }

      throw new Error('PortfolioCreated event not found in transaction');
    } catch (error) {
      logger.error(`Failed to get portfolio tokens from tx ${txHash}:`, error);
      throw error;
    }
  }

  /**
   * Extract redeemed assets from transaction
   */
  private async getRedeemedAssets(txHash: string): Promise<string[]> {
    try {
      const provider = await this.kaiaProvider.getProvider();
      const receipt = await provider.getTransactionReceipt(txHash);
      
      const yieldSetInterface = new Interface([
        'event PortfolioRedeemed(address indexed user, uint256 portfolioTokens, uint256[] amounts)'
      ]);

      for (const log of receipt.logs) {
        try {
          if (log.address.toLowerCase() === this.yieldSetAddress.toLowerCase()) {
            const parsed = yieldSetInterface.parseLog(log);
            if (parsed.name === 'PortfolioRedeemed') {
              return parsed.args.amounts.map((amount: bigint) => amount.toString());
            }
          }
        } catch (e) {
          // Skip non-matching logs
        }
      }

      throw new Error('PortfolioRedeemed event not found in transaction');
    } catch (error) {
      logger.error(`Failed to get redeemed assets from tx ${txHash}:`, error);
      throw error;
    }
  }

  /**
   * Update portfolio position in Redis
   */
  private async updatePortfolioPosition(userAddress: string, amount: string, operation: string): Promise<void> {
    try {
      const key = `defi:portfolio:${userAddress}`;
      const existing = await this.redis.get(key);
      const position = existing ? JSON.parse(existing) : {
        portfolioTokens: '0',
        totalValue: '0',
        lastRebalance: 0,
        lastUpdate: Date.now()
      };

      const currentTokens = BigInt(position.portfolioTokens || '0');
      const changeAmount = BigInt(amount);
      
      if (operation === 'create') {
        position.portfolioTokens = (currentTokens + changeAmount).toString();
      } else if (operation === 'redeem') {
        position.portfolioTokens = (currentTokens - changeAmount).toString();
      }

      position.lastUpdate = Date.now();

      await this.redis.set(key, JSON.stringify(position));

    } catch (error) {
      logger.error(`Failed to update portfolio position for ${userAddress}:`, error);
    }
  }

  /**
   * Update rebalance timestamp
   */
  private async updateRebalanceTimestamp(userAddress: string): Promise<void> {
    try {
      const key = `defi:portfolio:${userAddress}`;
      const existing = await this.redis.get(key);
      if (existing) {
        const position = JSON.parse(existing);
        position.lastRebalance = Date.now();
        await this.redis.set(key, JSON.stringify(position));
      }
    } catch (error) {
      logger.error(`Failed to update rebalance timestamp for ${userAddress}:`, error);
    }
  }
}