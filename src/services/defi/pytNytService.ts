/**
 * PYT/NYT Service
 * Handles yield splitting and recombination operations
 */

import { Contract, verifyTypedData, Interface } from 'ethers';
import { KaiaProviderManager } from '../blockchain/provider';
import { FeeDelegationService } from '../blockchain/feeDelegationService';
import { RedisService } from '../redis/redisService';
import logger from '../../utils/logger';

export interface SplitParams {
  user: string;
  syShares: string;
  signature: string;
  nonce: number;
  deadline: number;
}

export interface RecombineParams {
  user: string;
  pytAmount: string;
  nytAmount: string;
  signature: string;
  nonce: number;
  deadline: number;
}

export interface UserPositions {
  syShares: string;
  pytBalance: string;
  nytBalance: string;
  portfolioTokens: string;
  pytMaturity?: number;
  nytMaturity?: number;
  principalProtected: string;
  liquidationProtection: boolean;
}

export interface YieldForecast {
  projectedPYTYield: string;
  confidenceScore: number;
  minExpected: string;
  maxExpected: string;
  timeframe: number; // days
}

export class PYTNYTService {
  private kaiaProvider: KaiaProviderManager;
  private feeDelegation: FeeDelegationService;
  private redis: RedisService;
  private orchestratorAddress: string;
  private pytTokenAddress: string;
  private nytTokenAddress: string;

  constructor(
    kaiaProvider: KaiaProviderManager,
    feeDelegation: FeeDelegationService,
    redis: RedisService
  ) {
    this.kaiaProvider = kaiaProvider;
    this.feeDelegation = feeDelegation;
    this.redis = redis;
    this.orchestratorAddress = process.env.ORCHESTRATOR_ADDRESS || '';
    this.pytTokenAddress = process.env.PYT_TOKEN_ADDRESS || '';
    this.nytTokenAddress = process.env.NYT_TOKEN_ADDRESS || '';
  }

  /**
   * Split SY shares into PYT + NYT tokens (1:1 economics)
   */
  async splitYield(params: SplitParams): Promise<{ txHash: string; pytAmount: string; nytAmount: string }> {
    try {
      logger.info(`Yield splitting initiated for user ${params.user}, SY shares: ${params.syShares}`);

      // Verify EIP-712 signature for splitting authorization
      await this.verifySplitSignature(params);

      // Execute gasless splitting via fee delegation
      const txHash = await this.feeDelegation.executeSplit({
        user: params.user,
        syShares: params.syShares,
        orchestrator: this.orchestratorAddress,
        signature: params.signature,
        nonce: params.nonce,
        deadline: params.deadline
      });

      // Get minted PYT/NYT amounts from transaction receipt
      const { pytAmount, nytAmount } = await this.getSplitAmounts(txHash);

      // Update user position in Redis
      await this.updateUserPositionAfterSplit(params.user, params.syShares, pytAmount, nytAmount);

      logger.info(`Yield splitting completed. TxHash: ${txHash}, PYT: ${pytAmount}, NYT: ${nytAmount}`);
      return { txHash, pytAmount, nytAmount };

    } catch (error) {
      logger.error('Yield splitting failed:', error);
      throw new Error(`Split failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Recombine PYT + NYT tokens back into SY shares
   */
  async recombineYield(params: RecombineParams): Promise<{ txHash: string; syShares: string }> {
    try {
      logger.info(`Yield recombination initiated for user ${params.user}, PYT: ${params.pytAmount}, NYT: ${params.nytAmount}`);

      // Verify EIP-712 signature for recombination authorization
      await this.verifyRecombineSignature(params);

      // Execute gasless recombination via fee delegation
      const txHash = await this.feeDelegation.executeRecombine({
        user: params.user,
        pytAmount: params.pytAmount,
        nytAmount: params.nytAmount,
        orchestrator: this.orchestratorAddress,
        signature: params.signature,
        nonce: params.nonce,
        deadline: params.deadline
      });

      // Get recovered SY shares from transaction receipt
      const syShares = await this.getRecombinedShares(txHash);

      // Update user position in Redis
      await this.updateUserPositionAfterRecombine(params.user, params.pytAmount, params.nytAmount, syShares);

      logger.info(`Yield recombination completed. TxHash: ${txHash}, SY shares: ${syShares}`);
      return { txHash, syShares };

    } catch (error) {
      logger.error('Yield recombination failed:', error);
      throw new Error(`Recombine failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user's PYT/NYT positions
   */
  async getUserPositions(userAddress: string): Promise<UserPositions> {
    try {
      // Get from Redis cache first
      const cached = await this.redis.get(`defi:positions:${userAddress}`);
      if (cached) {
        const position = JSON.parse(cached);
        
        // Refresh with on-chain data if cache is old (> 5 minutes)
        if (Date.now() - position.lastUpdate < 300000) {
          return position;
        }
      }

      // Fetch fresh data from contracts
      const provider = await this.kaiaProvider.getProvider();
      
      const [pytContract, nytContract, orchestratorContract] = [
        new Contract(this.pytTokenAddress, [
          'function balanceOf(address) view returns (uint256)',
          'function pendingYield(address) view returns (uint256)'
        ], provider),
        new Contract(this.nytTokenAddress, [
          'function balanceOf(address) view returns (uint256)',
          'function getUserInfo(address) view returns (uint256, uint256, uint256, bool, bool, uint256)'
        ], provider),
        new Contract(this.orchestratorAddress, [
          'function getUserPosition(address) view returns (uint256, uint256, uint256, uint256, bool)'
        ], provider)
      ];

      const [pytBalance, nytBalance] = await Promise.all([
        pytContract.balanceOf(userAddress),
        nytContract.balanceOf(userAddress)
      ]);

      // Get NYT info (maturity, principal protection, etc.)
      const [, principal, maturity, protected, , currentValue] = await nytContract.getUserInfo(userAddress);

      // Get orchestrator position summary
      const [, , , principalProtected, liquidationProtection] = await orchestratorContract.getUserPosition(userAddress);

      const positions: UserPositions = {
        syShares: '0', // This would come from separate SY vault query
        pytBalance: pytBalance.toString(),
        nytBalance: nytBalance.toString(),
        portfolioTokens: '0', // Portfolio tokens from YieldSet
        nytMaturity: Number(maturity),
        principalProtected: principalProtected.toString(),
        liquidationProtection
      };

      // Cache the result
      await this.redis.setWithTTL(`defi:positions:${userAddress}`, JSON.stringify({
        ...positions,
        lastUpdate: Date.now()
      }), 300); // 5-minute cache

      return positions;

    } catch (error) {
      logger.error(`Failed to get positions for ${userAddress}:`, error);
      throw new Error('Failed to fetch user positions');
    }
  }

  /**
   * Get yield forecast for user's position
   */
  async getYieldForecast(userAddress: string, timeframeDays: number = 30): Promise<YieldForecast> {
    try {
      // Check cache first (1-hour TTL for forecasts)
      const cacheKey = `defi:forecast:${userAddress}:${timeframeDays}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const provider = await this.kaiaProvider.getProvider();
      const orchestratorContract = new Contract(
        this.orchestratorAddress,
        ['function getYieldForecast(uint256) view returns (uint256, uint256, uint256, uint256)'],
        provider
      );

      const timeframeSeconds = timeframeDays * 24 * 60 * 60;
      const [projectedYield, confidence, minExpected, maxExpected] = 
        await orchestratorContract.getYieldForecast(timeframeSeconds);

      const forecast: YieldForecast = {
        projectedPYTYield: projectedYield.toString(),
        confidenceScore: Number(confidence),
        minExpected: minExpected.toString(),
        maxExpected: maxExpected.toString(),
        timeframe: timeframeDays
      };

      // Cache for 1 hour
      await this.redis.setWithTTL(cacheKey, JSON.stringify(forecast), 3600);

      return forecast;

    } catch (error) {
      logger.error(`Failed to get yield forecast for ${userAddress}:`, error);
      throw new Error('Failed to generate yield forecast');
    }
  }

  /**
   * Verify EIP-712 signature for splitting
   */
  private async verifySplitSignature(params: SplitParams): Promise<void> {
    const domain = {
      name: 'LineX',
      version: '1',
      chainId: parseInt(process.env.KAIA_CHAIN_ID || '1001'),
      verifyingContract: this.orchestratorAddress
    };

    const types = {
      YieldSplit: [
        { name: 'user', type: 'address' },
        { name: 'syShares', type: 'uint256' },
        { name: 'orchestrator', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
      ]
    };

    const value = {
      user: params.user,
      syShares: params.syShares,
      orchestrator: this.orchestratorAddress,
      nonce: params.nonce,
      deadline: params.deadline
    };

    const recoveredAddress = verifyTypedData(domain, types, value, params.signature);
    
    if (recoveredAddress.toLowerCase() !== params.user.toLowerCase()) {
      throw new Error('Invalid signature');
    }

    if (Date.now() > params.deadline * 1000) {
      throw new Error('Signature expired');
    }
  }

  /**
   * Verify EIP-712 signature for recombination
   */
  private async verifyRecombineSignature(params: RecombineParams): Promise<void> {
    const domain = {
      name: 'LineX',
      version: '1',
      chainId: parseInt(process.env.KAIA_CHAIN_ID || '1001'),
      verifyingContract: this.orchestratorAddress
    };

    const types = {
      YieldRecombine: [
        { name: 'user', type: 'address' },
        { name: 'pytAmount', type: 'uint256' },
        { name: 'nytAmount', type: 'uint256' },
        { name: 'orchestrator', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
      ]
    };

    const value = {
      user: params.user,
      pytAmount: params.pytAmount,
      nytAmount: params.nytAmount,
      orchestrator: this.orchestratorAddress,
      nonce: params.nonce,
      deadline: params.deadline
    };

    const recoveredAddress = verifyTypedData(domain, types, value, params.signature);
    
    if (recoveredAddress.toLowerCase() !== params.user.toLowerCase()) {
      throw new Error('Invalid signature');
    }

    if (Date.now() > params.deadline * 1000) {
      throw new Error('Signature expired');
    }
  }

  /**
   * Extract PYT/NYT amounts from split transaction
   */
  private async getSplitAmounts(txHash: string): Promise<{ pytAmount: string; nytAmount: string }> {
    try {
      const provider = await this.kaiaProvider.getProvider();
      const receipt = await provider.getTransactionReceipt(txHash);
      
      const orchestratorInterface = new Interface([
        'event YieldSplit(address indexed user, uint256 syShares, uint256 pytAmount, uint256 nytAmount)'
      ]);

      for (const log of receipt.logs) {
        try {
          if (log.address.toLowerCase() === this.orchestratorAddress.toLowerCase()) {
            const parsed = orchestratorInterface.parseLog(log);
            if (parsed.name === 'YieldSplit') {
              return {
                pytAmount: parsed.args.pytAmount.toString(),
                nytAmount: parsed.args.nytAmount.toString()
              };
            }
          }
        } catch (e) {
          // Skip non-matching logs
        }
      }

      throw new Error('YieldSplit event not found in transaction');
    } catch (error) {
      logger.error(`Failed to get split amounts from tx ${txHash}:`, error);
      throw error;
    }
  }

  /**
   * Extract SY shares from recombine transaction
   */
  private async getRecombinedShares(txHash: string): Promise<string> {
    try {
      const provider = await this.kaiaProvider.getProvider();
      const receipt = await provider.getTransactionReceipt(txHash);
      
      const orchestratorInterface = new Interface([
        'event YieldRecombined(address indexed user, uint256 pytAmount, uint256 nytAmount, uint256 syShares)'
      ]);

      for (const log of receipt.logs) {
        try {
          if (log.address.toLowerCase() === this.orchestratorAddress.toLowerCase()) {
            const parsed = orchestratorInterface.parseLog(log);
            if (parsed.name === 'YieldRecombined') {
              return parsed.args.syShares.toString();
            }
          }
        } catch (e) {
          // Skip non-matching logs
        }
      }

      throw new Error('YieldRecombined event not found in transaction');
    } catch (error) {
      logger.error(`Failed to get recombined shares from tx ${txHash}:`, error);
      throw error;
    }
  }

  /**
   * Update user position after splitting
   */
  private async updateUserPositionAfterSplit(
    userAddress: string, 
    syShares: string, 
    pytAmount: string, 
    nytAmount: string
  ): Promise<void> {
    try {
      const key = `defi:positions:${userAddress}`;
      const existing = await this.redis.get(key);
      const position = existing ? JSON.parse(existing) : {
        syShares: '0',
        pytBalance: '0',
        nytBalance: '0',
        portfolioTokens: '0',
        lastUpdate: Date.now()
      };

      // Update balances - SY shares are consumed, PYT/NYT are minted
      const currentSY = BigInt(position.syShares || '0');
      const currentPYT = BigInt(position.pytBalance || '0');
      const currentNYT = BigInt(position.nytBalance || '0');

      position.syShares = (currentSY - syShares).toString();
      position.pytBalance = (currentPYT + pytAmount).toString();
      position.nytBalance = (currentNYT + nytAmount).toString();
      position.lastUpdate = Date.now();

      await this.redis.set(key, JSON.stringify(position));

    } catch (error) {
      logger.error(`Failed to update position after split for ${userAddress}:`, error);
    }
  }

  /**
   * Update user position after recombination
   */
  private async updateUserPositionAfterRecombine(
    userAddress: string,
    pytAmount: string,
    nytAmount: string,
    syShares: string
  ): Promise<void> {
    try {
      const key = `defi:positions:${userAddress}`;
      const existing = await this.redis.get(key);
      const position = existing ? JSON.parse(existing) : {
        syShares: '0',
        pytBalance: '0',
        nytBalance: '0',
        portfolioTokens: '0',
        lastUpdate: Date.now()
      };

      // Update balances - PYT/NYT are burned, SY shares are minted
      const currentSY = BigInt(position.syShares || '0');
      const currentPYT = BigInt(position.pytBalance || '0');
      const currentNYT = BigInt(position.nytBalance || '0');

      position.syShares = (currentSY + syShares).toString();
      position.pytBalance = (currentPYT - pytAmount).toString();
      position.nytBalance = (currentNYT - nytAmount).toString();
      position.lastUpdate = Date.now();

      await this.redis.set(key, JSON.stringify(position));

    } catch (error) {
      logger.error(`Failed to update position after recombine for ${userAddress}:`, error);
    }
  }
}