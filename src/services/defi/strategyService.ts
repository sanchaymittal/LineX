/**
 * Strategy Service
 * Handles multi-strategy allocation and management
 */

import { Contract, formatUnits } from 'ethers';
import { KaiaProviderManager } from '../blockchain/provider';
import { RedisService } from '../redis/redisService';
import logger from '../../utils/logger';

export interface Strategy {
  address: string;
  name: string;
  type: 'lending' | 'staking' | 'lp' | 'custom';
  apy: number;
  tvl: string;
  allocation: number; // Percentage of vault allocated to this strategy
  risk: 'low' | 'medium' | 'high';
  active: boolean;
}

export interface StrategyAPY {
  address: string;
  currentAPY: number;
  averageAPY: number; // 30-day average
  volatility: number;
  lastUpdate: number;
}

export interface AllocationSuggestion {
  strategy: string;
  suggestedAllocation: number;
  currentAllocation: number;
  reasoning: string;
  expectedAPYImprovement: number;
}

export class StrategyService {
  private kaiaProvider: KaiaProviderManager;
  private redis: RedisService;
  private syVaultAddress: string;

  constructor(kaiaProvider: KaiaProviderManager, redis: RedisService) {
    this.kaiaProvider = kaiaProvider;
    this.redis = redis;
    this.syVaultAddress = process.env.SY_VAULT_ADDRESS || '';
  }

  /**
   * Get all available strategies
   */
  async getAllStrategies(): Promise<Strategy[]> {
    try {
      // Check Redis cache first (10-minute TTL)
      const cacheKey = 'defi:strategies:all';
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const strategies = JSON.parse(cached);
        if (Date.now() - strategies.lastUpdate < 600000) {
          return strategies.data;
        }
      }

      const provider = await this.kaiaProvider.getProvider();
      const syVaultContract = new Contract(
        this.syVaultAddress,
        [
          'function getStrategies() view returns (address[], uint256[])',
          'function strategyInfo(address) view returns (string, bool, uint256)'
        ],
        provider
      );

      const [addresses, allocations] = await syVaultContract.getStrategies();

      const strategies: Strategy[] = await Promise.all(
        addresses.map(async (address: string, index: number) => {
          try {
            const [name, active, tvl] = await syVaultContract.strategyInfo(address);
            
            // Get strategy type from address or name
            const type = this.determineStrategyType(name, address);
            
            // Get current APY
            const apy = await this.getStrategyAPY(address);
            
            // Calculate allocation percentage
            const allocation = parseFloat(formatUnits(allocations[index], 4)) * 100;
            
            // Determine risk level based on strategy type
            const risk = this.determineRiskLevel(type);

            return {
              address,
              name: name || `Strategy ${index + 1}`,
              type,
              apy: apy.currentAPY,
              tvl: tvl.toString(),
              allocation,
              risk,
              active
            };
          } catch (error) {
            logger.error(`Failed to get info for strategy ${address}:`, error);
            return {
              address,
              name: `Strategy ${index + 1}`,
              type: 'custom' as const,
              apy: 0,
              tvl: '0',
              allocation: 0,
              risk: 'medium' as const,
              active: false
            };
          }
        })
      );

      // Cache for 10 minutes
      await this.redis.setWithTTL(cacheKey, JSON.stringify({
        data: strategies,
        lastUpdate: Date.now()
      }), 600);

      return strategies;

    } catch (error) {
      logger.error('Failed to get all strategies:', error);
      throw new Error('Failed to fetch strategies');
    }
  }

  /**
   * Get current APY for each strategy
   */
  async getStrategyAPYs(): Promise<StrategyAPY[]> {
    try {
      // Check Redis cache first (5-minute TTL)
      const cacheKey = 'defi:strategies:apys';
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const apys = JSON.parse(cached);
        if (Date.now() - apys.lastUpdate < 300000) {
          return apys.data;
        }
      }

      const strategies = await this.getAllStrategies();
      
      const apys: StrategyAPY[] = await Promise.all(
        strategies.map(async (strategy) => {
          const apyData = await this.getStrategyAPY(strategy.address);
          return {
            address: strategy.address,
            ...apyData
          };
        })
      );

      // Cache for 5 minutes
      await this.redis.setWithTTL(cacheKey, JSON.stringify({
        data: apys,
        lastUpdate: Date.now()
      }), 300);

      return apys;

    } catch (error) {
      logger.error('Failed to get strategy APYs:', error);
      throw new Error('Failed to fetch strategy APYs');
    }
  }

  /**
   * Get allocation suggestions based on current performance
   */
  async getAllocationSuggestions(): Promise<AllocationSuggestion[]> {
    try {
      // Check Redis cache first (30-minute TTL)
      const cacheKey = 'defi:strategies:allocation-suggestions';
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const suggestions = JSON.parse(cached);
        if (Date.now() - suggestions.lastUpdate < 1800000) {
          return suggestions.data;
        }
      }

      const [strategies, apys] = await Promise.all([
        this.getAllStrategies(),
        this.getStrategyAPYs()
      ]);

      // Create a map for easy lookup
      const apyMap = new Map(apys.map(apy => [apy.address, apy]));

      const suggestions: AllocationSuggestion[] = [];

      // Simple allocation optimization logic
      for (const strategy of strategies) {
        if (!strategy.active) continue;

        const apyData = apyMap.get(strategy.address);
        if (!apyData) continue;

        const currentAPY = apyData.currentAPY;
        const volatility = apyData.volatility;
        const currentAllocation = strategy.allocation;

        // Calculate risk-adjusted return
        const riskAdjustedReturn = volatility > 0 ? currentAPY / volatility : currentAPY;

        // Simple suggestion logic based on performance
        let suggestedAllocation = currentAllocation;
        let reasoning = '';
        let expectedImprovement = 0;

        if (riskAdjustedReturn > 1.5 && currentAllocation < 50) {
          // Suggest increasing allocation for high-performing strategies
          suggestedAllocation = Math.min(currentAllocation + 10, 50);
          reasoning = 'High risk-adjusted returns suggest increasing allocation';
          expectedImprovement = (suggestedAllocation - currentAllocation) * currentAPY / 100;
        } else if (riskAdjustedReturn < 0.5 && currentAllocation > 10) {
          // Suggest decreasing allocation for underperforming strategies
          suggestedAllocation = Math.max(currentAllocation - 10, 10);
          reasoning = 'Poor risk-adjusted returns suggest reducing allocation';
          expectedImprovement = (currentAllocation - suggestedAllocation) * (-2) / 100; // Positive improvement from reducing bad allocation
        } else if (volatility > 20 && strategy.risk === 'high') {
          // Suggest reducing high-volatility strategies
          suggestedAllocation = Math.max(currentAllocation - 5, 5);
          reasoning = 'High volatility suggests reducing exposure for stability';
          expectedImprovement = 0.5; // Stability improvement
        } else {
          reasoning = 'Current allocation appears optimal';
        }

        if (Math.abs(suggestedAllocation - currentAllocation) > 1) {
          suggestions.push({
            strategy: strategy.address,
            suggestedAllocation,
            currentAllocation,
            reasoning,
            expectedAPYImprovement: Math.round(expectedImprovement * 100) / 100
          });
        }
      }

      // Cache for 30 minutes
      await this.redis.setWithTTL(cacheKey, JSON.stringify({
        data: suggestions,
        lastUpdate: Date.now()
      }), 1800);

      return suggestions;

    } catch (error) {
      logger.error('Failed to get allocation suggestions:', error);
      throw new Error('Failed to generate allocation suggestions');
    }
  }

  /**
   * Update strategy APY tracking
   */
  async updateStrategyAPYTracking(strategyAddress: string, apy: number): Promise<void> {
    try {
      const key = `defi:strategy:apy:history:${strategyAddress}`;
      const existing = await this.redis.get(key);
      const history = existing ? JSON.parse(existing) : { entries: [] };

      // Add new entry
      history.entries.push({
        apy,
        timestamp: Date.now()
      });

      // Keep only last 30 days of data (assuming 4 updates per day)
      if (history.entries.length > 120) {
        history.entries = history.entries.slice(-120);
      }

      await this.redis.set(key, JSON.stringify(history));

    } catch (error) {
      logger.error(`Failed to update APY tracking for strategy ${strategyAddress}:`, error);
    }
  }

  /**
   * Get strategy APY with historical data
   */
  private async getStrategyAPY(strategyAddress: string): Promise<{
    currentAPY: number;
    averageAPY: number;
    volatility: number;
    lastUpdate: number;
  }> {
    try {
      // Get current APY from contract
      const provider = await this.kaiaProvider.getProvider();
      
      // Check if it's a mock strategy (for testing)
      if (await this.isMockStrategy(strategyAddress)) {
        return this.getMockStrategyAPY(strategyAddress);
      }

      // For real strategies, query the contract
      const strategyContract = new Contract(
        strategyAddress,
        ['function getAPY() view returns (uint256)'],
        provider
      );

      const currentAPYBN = await strategyContract.getAPY();
      const currentAPY = parseFloat(formatUnits(currentAPYBN, 18)) * 100;

      // Get historical data for averages and volatility
      const historyKey = `defi:strategy:apy:history:${strategyAddress}`;
      const historyData = await this.redis.get(historyKey);
      const history = historyData ? JSON.parse(historyData) : { entries: [] };

      let averageAPY = currentAPY;
      let volatility = 0;

      if (history.entries.length > 1) {
        // Calculate 30-day average
        const apys = history.entries.map((entry: any) => entry.apy);
        averageAPY = apys.reduce((sum: number, apy: number) => sum + apy, 0) / apys.length;

        // Calculate volatility (standard deviation)
        const variance = apys.reduce((sum: number, apy: number) => sum + Math.pow(apy - averageAPY, 2), 0) / apys.length;
        volatility = Math.sqrt(variance);
      }

      // Update tracking
      await this.updateStrategyAPYTracking(strategyAddress, currentAPY);

      return {
        currentAPY: Math.round(currentAPY * 100) / 100,
        averageAPY: Math.round(averageAPY * 100) / 100,
        volatility: Math.round(volatility * 100) / 100,
        lastUpdate: Date.now()
      };

    } catch (error) {
      logger.error(`Failed to get APY for strategy ${strategyAddress}:`, error);
      // Return default values
      return {
        currentAPY: 0,
        averageAPY: 0,
        volatility: 0,
        lastUpdate: Date.now()
      };
    }
  }

  /**
   * Check if strategy is a mock strategy
   */
  private async isMockStrategy(strategyAddress: string): Promise<boolean> {
    try {
      const provider = await this.kaiaProvider.getProvider();
      const contract = new Contract(
        strategyAddress,
        ['function name() view returns (string)'],
        provider
      );
      
      const name = await contract.name();
      return name.toLowerCase().includes('mock');
    } catch {
      return false;
    }
  }

  /**
   * Get mock strategy APY (for testing)
   */
  private getMockStrategyAPY(strategyAddress: string): {
    currentAPY: number;
    averageAPY: number;
    volatility: number;
    lastUpdate: number;
  } {
    // Generate pseudo-random but consistent APYs based on address
    const hash = parseInt(strategyAddress.slice(-8), 16);
    const baseAPY = 5 + (hash % 15); // 5-20% base APY
    const variation = Math.sin(Date.now() / 86400000 + hash) * 2; // Daily variation
    
    return {
      currentAPY: Math.round((baseAPY + variation) * 100) / 100,
      averageAPY: baseAPY,
      volatility: 2 + (hash % 5), // 2-7% volatility
      lastUpdate: Date.now()
    };
  }

  /**
   * Determine strategy type from name or address
   */
  private determineStrategyType(name: string, address: string): Strategy['type'] {
    const lowerName = name.toLowerCase();
    
    if (lowerName.includes('lend') || lowerName.includes('compound') || lowerName.includes('aave')) {
      return 'lending';
    }
    if (lowerName.includes('stak') || lowerName.includes('validator')) {
      return 'staking';
    }
    if (lowerName.includes('lp') || lowerName.includes('liquidity') || lowerName.includes('dex')) {
      return 'lp';
    }
    
    return 'custom';
  }

  /**
   * Determine risk level based on strategy type
   */
  private determineRiskLevel(type: Strategy['type']): Strategy['risk'] {
    switch (type) {
      case 'lending':
        return 'low';
      case 'staking':
        return 'medium';
      case 'lp':
        return 'high';
      default:
        return 'medium';
    }
  }
}