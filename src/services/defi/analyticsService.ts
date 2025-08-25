/**
 * Analytics Service
 * Handles DeFi analytics, TVL tracking, and user statistics
 */

import { Contract, formatUnits, parseUnits } from 'ethers';
import { KaiaProviderManager } from '../blockchain/provider';
import { RedisService } from '../redis/redisService';
import logger from '../../utils/logger';

export interface TVLData {
  totalValueLocked: string;
  syVaultTVL: string;
  portfolioTVL: string;
  autoCompoundTVL: string;
  breakdown: Array<{
    vault: string;
    tvl: string;
    percentage: number;
  }>;
}

export interface GlobalYieldStats {
  totalYieldGenerated: string;
  averageAPY: number;
  totalUsers: number;
  activeUsers: number; // Users with activity in last 30 days
  totalTransactions: number;
  volumeLastMonth: string;
}

export interface UserStats {
  totalUsers: number;
  newUsersLastMonth: number;
  activeUsers: number;
  userGrowthRate: number; // Monthly growth percentage
  averagePositionSize: string;
  retentionRate: number; // 30-day retention
}

export interface PerformanceMetrics {
  systemAPY: number;
  bestPerformingStrategy: {
    address: string;
    apy: number;
    name: string;
  };
  riskMetrics: {
    averageVolatility: number;
    maxDrawdown: number;
    sharpeRatio: number;
  };
}

export class AnalyticsService {
  private kaiaProvider: KaiaProviderManager;
  private redis: RedisService;
  private syVaultAddress: string;
  private yieldSetAddress: string;
  private autoCompoundAddress: string;

  constructor(kaiaProvider: KaiaProviderManager, redis: RedisService) {
    this.kaiaProvider = kaiaProvider;
    this.redis = redis;
    this.syVaultAddress = process.env.SY_VAULT_ADDRESS || '';
    this.yieldSetAddress = process.env.YIELD_SET_ADDRESS || '';
    this.autoCompoundAddress = process.env.AUTO_COMPOUND_ADDRESS || '';
  }

  /**
   * Get total value locked across all vaults
   */
  async getTVLData(): Promise<TVLData> {
    try {
      // Check Redis cache first (5-minute TTL)
      const cacheKey = 'defi:analytics:tvl';
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const tvlData = JSON.parse(cached);
        if (Date.now() - tvlData.lastUpdate < 300000) {
          return tvlData.data;
        }
      }

      const provider = await this.kaiaProvider.getProvider();

      // Get TVL from each vault
      const [syVaultTVL, portfolioTVL, autoCompoundTVL] = await Promise.all([
        this.getVaultTVL(this.syVaultAddress),
        this.getVaultTVL(this.yieldSetAddress),
        this.getVaultTVL(this.autoCompoundAddress)
      ]);

      const totalTVL = BigInt(syVaultTVL)
        + portfolioTVL
        + autoCompoundTVL;

      const breakdown = [
        {
          vault: this.syVaultAddress,
          tvl: syVaultTVL,
          percentage: this.calculatePercentage(syVaultTVL, totalTVL.toString())
        },
        {
          vault: this.yieldSetAddress,
          tvl: portfolioTVL,
          percentage: this.calculatePercentage(portfolioTVL, totalTVL.toString())
        },
        {
          vault: this.autoCompoundAddress,
          tvl: autoCompoundTVL,
          percentage: this.calculatePercentage(autoCompoundTVL, totalTVL.toString())
        }
      ];

      const tvlData: TVLData = {
        totalValueLocked: totalTVL.toString(),
        syVaultTVL,
        portfolioTVL,
        autoCompoundTVL,
        breakdown
      };

      // Cache for 5 minutes
      await this.redis.setWithTTL(cacheKey, JSON.stringify({
        data: tvlData,
        lastUpdate: Date.now()
      }), 300);

      return tvlData;

    } catch (error) {
      logger.error('Failed to get TVL data:', error);
      throw new Error('Failed to fetch TVL data');
    }
  }

  /**
   * Get global yield statistics
   */
  async getGlobalYieldStats(): Promise<GlobalYieldStats> {
    try {
      // Check Redis cache first (10-minute TTL)
      const cacheKey = 'defi:analytics:global-yield';
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const stats = JSON.parse(cached);
        if (Date.now() - stats.lastUpdate < 600000) {
          return stats.data;
        }
      }

      // Get data from Redis tracking
      const [yieldData, userStats, transactionStats] = await Promise.all([
        this.redis.get('defi:yield:global:distributions'),
        this.getUserCountStats(),
        this.getTransactionStats()
      ]);

      const yieldTracking = yieldData ? JSON.parse(yieldData) : {
        totalDistributed: '0',
        distributionCount: 0,
        distributions: []
      };

      // Calculate average APY from recent distributions
      let averageAPY = 0;
      if (yieldTracking.distributions.length > 0) {
        const recentDistributions = yieldTracking.distributions.slice(-30); // Last 30 distributions
        const totalYield = recentDistributions.reduce((sum: number, dist: any) => {
          return sum + parseFloat(formatUnits(dist.amount, 6));
        }, 0);
        
        // Estimate APY based on distribution frequency and amounts
        if (recentDistributions.length > 1) {
          const timeSpan = recentDistributions[recentDistributions.length - 1].timestamp - recentDistributions[0].timestamp;
          const annualizedYield = (totalYield * 365 * 24 * 60 * 60 * 1000) / timeSpan;
          
          // Get current TVL for APY calculation
          const tvlData = await this.getTVLData();
          const currentTVL = parseFloat(formatUnits(tvlData.totalValueLocked, 6));
          
          if (currentTVL > 0) {
            averageAPY = (annualizedYield / currentTVL) * 100;
          }
        }
      }

      // Get volume for last month
      const volumeLastMonth = await this.getVolumeLastMonth();

      const globalStats: GlobalYieldStats = {
        totalYieldGenerated: yieldTracking.totalDistributed,
        averageAPY: Math.round(averageAPY * 100) / 100,
        totalUsers: userStats.total,
        activeUsers: userStats.active,
        totalTransactions: transactionStats.total,
        volumeLastMonth
      };

      // Cache for 10 minutes
      await this.redis.setWithTTL(cacheKey, JSON.stringify({
        data: globalStats,
        lastUpdate: Date.now()
      }), 600);

      return globalStats;

    } catch (error) {
      logger.error('Failed to get global yield stats:', error);
      throw new Error('Failed to fetch global yield statistics');
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(): Promise<UserStats> {
    try {
      // Check Redis cache first (15-minute TTL)
      const cacheKey = 'defi:analytics:user-stats';
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const stats = JSON.parse(cached);
        if (Date.now() - stats.lastUpdate < 900000) {
          return stats.data;
        }
      }

      const userCounts = await this.getUserCountStats();
      const retentionData = await this.getUserRetentionStats();
      const positionData = await this.getAveragePositionSize();

      // Calculate growth rate (month over month)
      const lastMonthUsers = await this.getUserCountLastMonth();
      const growthRate = lastMonthUsers > 0 ? 
        ((userCounts.total - lastMonthUsers) / lastMonthUsers) * 100 : 0;

      const userStats: UserStats = {
        totalUsers: userCounts.total,
        newUsersLastMonth: userCounts.newLastMonth,
        activeUsers: userCounts.active,
        userGrowthRate: Math.round(growthRate * 100) / 100,
        averagePositionSize: positionData.averageSize,
        retentionRate: retentionData.thirtyDayRetention
      };

      // Cache for 15 minutes
      await this.redis.setWithTTL(cacheKey, JSON.stringify({
        data: userStats,
        lastUpdate: Date.now()
      }), 900);

      return userStats;

    } catch (error) {
      logger.error('Failed to get user stats:', error);
      throw new Error('Failed to fetch user statistics');
    }
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    try {
      // Check Redis cache first (10-minute TTL)
      const cacheKey = 'defi:analytics:performance';
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const metrics = JSON.parse(cached);
        if (Date.now() - metrics.lastUpdate < 600000) {
          return metrics.data;
        }
      }

      // Get system-wide APY
      const tvlData = await this.getTVLData();
      const globalStats = await this.getGlobalYieldStats();
      const systemAPY = globalStats.averageAPY;

      // Get best performing strategy
      const bestStrategy = await this.getBestPerformingStrategy();

      // Calculate risk metrics
      const riskMetrics = await this.calculateRiskMetrics();

      const performance: PerformanceMetrics = {
        systemAPY,
        bestPerformingStrategy: bestStrategy,
        riskMetrics
      };

      // Cache for 10 minutes
      await this.redis.setWithTTL(cacheKey, JSON.stringify({
        data: performance,
        lastUpdate: Date.now()
      }), 600);

      return performance;

    } catch (error) {
      logger.error('Failed to get performance metrics:', error);
      throw new Error('Failed to fetch performance metrics');
    }
  }

  /**
   * Update analytics tracking data
   */
  async updateAnalyticsTracking(type: string, data: any): Promise<void> {
    try {
      const key = `defi:analytics:tracking:${type}`;
      const timestamp = Date.now();
      
      // Get existing tracking data
      const existing = await this.redis.get(key);
      const tracking = existing ? JSON.parse(existing) : { entries: [] };
      
      // Add new entry
      tracking.entries.push({
        ...data,
        timestamp
      });
      
      // Keep only recent entries (last 1000 or 30 days)
      const cutoff = timestamp - (30 * 24 * 60 * 60 * 1000); // 30 days ago
      tracking.entries = tracking.entries
        .filter((entry: any) => entry.timestamp > cutoff)
        .slice(-1000); // Keep last 1000 entries
      
      await this.redis.set(key, JSON.stringify(tracking));
      
    } catch (error) {
      logger.error(`Failed to update analytics tracking for ${type}:`, error);
    }
  }

  /**
   * Get vault TVL helper function
   */
  private async getVaultTVL(vaultAddress: string): Promise<string> {
    try {
      if (!vaultAddress) return '0';

      const provider = await this.kaiaProvider.getProvider();
      const vaultContract = new Contract(
        vaultAddress,
        ['function totalAssets() view returns (uint256)'],
        provider
      );

      const totalAssets = await vaultContract.totalAssets();
      return totalAssets.toString();

    } catch (error) {
      logger.error(`Failed to get TVL for vault ${vaultAddress}:`, error);
      return '0';
    }
  }

  /**
   * Calculate percentage helper
   */
  private calculatePercentage(part: string, total: string): number {
    try {
      const partBN = BigInt(part);
      const totalBN = BigInt(total);
      
      if (totalBN === 0n) return 0;
      
      return parseFloat((partBN * BigInt(10000) / totalBN).toString()) / 100; // 2 decimal places
    } catch {
      return 0;
    }
  }

  /**
   * Get user count statistics
   */
  private async getUserCountStats(): Promise<{
    total: number;
    active: number;
    newLastMonth: number;
  }> {
    try {
      // This would need to scan through user position keys
      // For now, return mock data - in production would scan Redis keys
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      
      // Mock implementation - would scan defi:positions:* keys
      return {
        total: 150,
        active: 45,
        newLastMonth: 23
      };
    } catch (error) {
      logger.error('Failed to get user count stats:', error);
      return { total: 0, active: 0, newLastMonth: 0 };
    }
  }

  /**
   * Get transaction statistics
   */
  private async getTransactionStats(): Promise<{ total: number }> {
    try {
      // Mock implementation - would track all transactions
      return { total: 1250 };
    } catch (error) {
      logger.error('Failed to get transaction stats:', error);
      return { total: 0 };
    }
  }

  /**
   * Get volume for last month
   */
  private async getVolumeLastMonth(): Promise<string> {
    try {
      // Mock implementation - would sum all transaction volumes from last month
      return parseUnits('250000', 6).toString(); // $250K mock volume
    } catch (error) {
      logger.error('Failed to get monthly volume:', error);
      return '0';
    }
  }

  /**
   * Get user count from last month
   */
  private async getUserCountLastMonth(): Promise<number> {
    try {
      // Mock implementation
      return 127;
    } catch (error) {
      logger.error('Failed to get last month user count:', error);
      return 0;
    }
  }

  /**
   * Get user retention statistics
   */
  private async getUserRetentionStats(): Promise<{ thirtyDayRetention: number }> {
    try {
      // Mock implementation - would analyze user activity patterns
      return { thirtyDayRetention: 68.5 }; // 68.5% retention rate
    } catch (error) {
      logger.error('Failed to get retention stats:', error);
      return { thirtyDayRetention: 0 };
    }
  }

  /**
   * Get average position size
   */
  private async getAveragePositionSize(): Promise<{ averageSize: string }> {
    try {
      // Mock implementation - would analyze user positions
      return { 
        averageSize: parseUnits('1250', 6).toString() // $1,250 average
      };
    } catch (error) {
      logger.error('Failed to get average position size:', error);
      return { averageSize: '0' };
    }
  }

  /**
   * Get best performing strategy
   */
  private async getBestPerformingStrategy(): Promise<{
    address: string;
    apy: number;
    name: string;
  }> {
    try {
      // This would query all strategies and find the best performer
      // Mock implementation for now
      return {
        address: process.env.MOCK_STAKING_STRATEGY || '0x123...',
        apy: 12.5,
        name: 'Mock Staking Strategy'
      };
    } catch (error) {
      logger.error('Failed to get best performing strategy:', error);
      return {
        address: '',
        apy: 0,
        name: 'Unknown'
      };
    }
  }

  /**
   * Calculate system risk metrics
   */
  private async calculateRiskMetrics(): Promise<{
    averageVolatility: number;
    maxDrawdown: number;
    sharpeRatio: number;
  }> {
    try {
      // Mock implementation - would analyze historical performance data
      return {
        averageVolatility: 8.2,
        maxDrawdown: 3.1,
        sharpeRatio: 1.8
      };
    } catch (error) {
      logger.error('Failed to calculate risk metrics:', error);
      return {
        averageVolatility: 0,
        maxDrawdown: 0,
        sharpeRatio: 0
      };
    }
  }
}