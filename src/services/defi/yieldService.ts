/**
 * Yield Service
 * Handles PYT yield claiming, distribution, and tracking
 */

import { Contract, formatUnits, verifyTypedData, isAddress, Interface } from 'ethers';
import { KaiaProviderManager } from '../blockchain/provider';
import { FeeDelegationService } from '../blockchain/feeDelegationService';
import { RedisService } from '../redis/redisService';
import logger from '../../utils/logger';

export interface YieldClaimParams {
  user: string;
  amount: string;
  signature: string;
  nonce: number;
  deadline: number;
}

export interface YieldDistributionParams {
  signature: string;
  nonce: number;
  deadline: number;
}

export interface PendingYield {
  amount: string;
  accumulatedSince: number;
  estimatedAPY: number;
  nextDistribution: number;
}

export interface YieldHistory {
  claims: Array<{
    amount: string;
    timestamp: number;
    txHash: string;
  }>;
  totalClaimed: string;
  averageAPY: number;
}

export class YieldService {
  private kaiaProvider: KaiaProviderManager;
  private feeDelegation: FeeDelegationService;
  private redis: RedisService;
  private pytTokenAddress: string;
  private orchestratorAddress: string;

  constructor(
    kaiaProvider: KaiaProviderManager,
    feeDelegation: FeeDelegationService,
    redis: RedisService
  ) {
    this.kaiaProvider = kaiaProvider;
    this.feeDelegation = feeDelegation;
    this.redis = redis;
    this.pytTokenAddress = process.env.PYT_TOKEN_ADDRESS || '';
    this.orchestratorAddress = process.env.ORCHESTRATOR_ADDRESS || '';
  }

  /**
   * Claim accumulated PYT yield with user authorization
   */
  async claimYield(params: YieldClaimParams): Promise<{ txHash: string; claimed: string }> {
    try {
      logger.info(`Yield claim initiated for user ${params.user}, amount: ${params.amount}`);

      // Verify EIP-712 signature for yield claim authorization
      await this.verifyClaimSignature(params);

      // Check if user has sufficient pending yield
      const pendingYield = await this.getPendingYield(params.user);
      const claimAmount = BigInt(params.amount);
      const availableAmount = BigInt(pendingYield.amount);

      if (claimAmount > availableAmount) {
        throw new Error(`Insufficient yield available. Requested: ${params.amount}, Available: ${pendingYield.amount}`);
      }

      // Execute gasless yield claim via fee delegation
      const txHash = await this.feeDelegation.executeYieldClaim({
        user: params.user,
        amount: params.amount,
        token: this.pytTokenAddress,
        signature: params.signature,
        nonce: params.nonce,
        deadline: params.deadline
      });

      // Update yield tracking in Redis
      await this.updateYieldTracking(params.user, params.amount, txHash, 'claim');

      logger.info(`Yield claim completed. TxHash: ${txHash}, Claimed: ${params.amount}`);
      return { txHash, claimed: params.amount };

    } catch (error) {
      logger.error('Yield claim failed:', error);
      throw new Error(`Claim failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get pending yield for user
   */
  async getPendingYield(userAddress: string): Promise<PendingYield> {
    try {
      const provider = await this.kaiaProvider.getProvider();
      const pytContract = new Contract(
        this.pytTokenAddress,
        [
          'function pendingYield(address) view returns (uint256)',
          'function lastClaimTime(address) view returns (uint256)',
          'function getCurrentAPY() view returns (uint256)'
        ],
        provider
      );

      const orchestratorContract = new Contract(
        this.orchestratorAddress,
        [
          'function distributionInterval() view returns (uint256)',
          'function lastDistribution() view returns (uint256)'
        ],
        provider
      );

      const [pendingAmount, lastClaim, apy, distributionInterval, lastDistribution] = await Promise.all([
        pytContract.pendingYield(userAddress),
        pytContract.lastClaimTime(userAddress),
        pytContract.getCurrentAPY(),
        orchestratorContract.distributionInterval(),
        orchestratorContract.lastDistribution()
      ]);

      // Calculate next distribution time
      const nextDistribution = Number(lastDistribution + distributionInterval);

      return {
        amount: pendingAmount.toString(),
        accumulatedSince: Number(lastClaim),
        estimatedAPY: parseFloat(formatUnits(apy, 18)) * 100,
        nextDistribution
      };

    } catch (error) {
      logger.error(`Failed to get pending yield for ${userAddress}:`, error);
      throw new Error('Failed to fetch pending yield');
    }
  }

  /**
   * Trigger yield distribution (time-gated)
   */
  async distributeYield(params: YieldDistributionParams): Promise<{ txHash: string; distributed: string }> {
    try {
      logger.info('Yield distribution initiated');

      // Verify EIP-712 signature for distribution authorization
      await this.verifyDistributionSignature(params);

      // Check if distribution interval has passed
      await this.checkDistributionEligibility();

      // Execute gasless yield distribution via fee delegation
      const txHash = await this.feeDelegation.executeYieldDistribution({
        orchestrator: this.orchestratorAddress,
        signature: params.signature,
        nonce: params.nonce,
        deadline: params.deadline
      });

      // Get distributed amount from transaction receipt
      const distributed = await this.getDistributedAmount(txHash);

      // Update global distribution tracking
      await this.updateGlobalDistributionTracking(distributed, txHash);

      logger.info(`Yield distribution completed. TxHash: ${txHash}, Distributed: ${distributed}`);
      return { txHash, distributed };

    } catch (error) {
      logger.error('Yield distribution failed:', error);
      throw new Error(`Distribution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get yield claim history for user
   */
  async getYieldHistory(userAddress: string): Promise<YieldHistory> {
    try {
      // Get from Redis cache first
      const cacheKey = `defi:yield:history:${userAddress}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const history = JSON.parse(cached);
        // Refresh if cache is older than 10 minutes
        if (Date.now() - history.lastUpdate < 600000) {
          return history;
        }
      }

      // Get yield tracking data from Redis
      const trackingKey = `defi:yield:${userAddress}`;
      const tracking = await this.redis.get(trackingKey);
      
      let claims: Array<{ amount: string; timestamp: number; txHash: string }> = [];
      let totalClaimed = '0';

      if (tracking) {
        const data = JSON.parse(tracking);
        claims = data.claims || [];
        totalClaimed = data.claimedTotal || '0';
      }

      // Calculate average APY from claims
      let averageAPY = 0;
      if (claims.length > 0) {
        const timeRange = Math.max(Date.now() - claims[0].timestamp, 86400000); // At least 1 day
        const totalClaimedNum = parseFloat(formatUnits(totalClaimed, 6));
        averageAPY = (totalClaimedNum * 365 * 24 * 60 * 60 * 1000) / timeRange;
      }

      const history: YieldHistory = {
        claims: claims.slice(-50), // Return last 50 claims
        totalClaimed,
        averageAPY
      };

      // Cache for 10 minutes
      await this.redis.setWithTTL(cacheKey, JSON.stringify({
        ...history,
        lastUpdate: Date.now()
      }), 600);

      return history;

    } catch (error) {
      logger.error(`Failed to get yield history for ${userAddress}:`, error);
      throw new Error('Failed to fetch yield history');
    }
  }

  /**
   * Verify EIP-712 signature for yield claim
   */
  private async verifyClaimSignature(params: YieldClaimParams): Promise<void> {
    const domain = {
      name: 'LineX',
      version: '1',
      chainId: parseInt(process.env.KAIA_CHAIN_ID || '1001'),
      verifyingContract: this.pytTokenAddress
    };

    const types = {
      YieldClaim: [
        { name: 'user', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
      ]
    };

    const value = {
      user: params.user,
      token: this.pytTokenAddress,
      amount: params.amount,
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
   * Verify EIP-712 signature for yield distribution
   */
  private async verifyDistributionSignature(params: YieldDistributionParams): Promise<void> {
    const domain = {
      name: 'LineX',
      version: '1',
      chainId: parseInt(process.env.KAIA_CHAIN_ID || '1001'),
      verifyingContract: this.orchestratorAddress
    };

    const types = {
      YieldDistribution: [
        { name: 'orchestrator', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
      ]
    };

    const value = {
      orchestrator: this.orchestratorAddress,
      nonce: params.nonce,
      deadline: params.deadline
    };

    // For distribution, we might allow any authorized address to trigger it
    const recoveredAddress = verifyTypedData(domain, types, value, params.signature);
    
    // Check if recovered address is authorized (could be owner or authorized distributor)
    // For now, just check signature validity
    if (!isAddress(recoveredAddress)) {
      throw new Error('Invalid signature');
    }

    if (Date.now() > params.deadline * 1000) {
      throw new Error('Signature expired');
    }
  }

  /**
   * Check if yield distribution is eligible (time-gated)
   */
  private async checkDistributionEligibility(): Promise<void> {
    try {
      const provider = await this.kaiaProvider.getProvider();
      const orchestratorContract = new Contract(
        this.orchestratorAddress,
        [
          'function distributionInterval() view returns (uint256)',
          'function lastDistribution() view returns (uint256)'
        ],
        provider
      );

      const [distributionInterval, lastDistribution] = await Promise.all([
        orchestratorContract.distributionInterval(),
        orchestratorContract.lastDistribution()
      ]);

      const nextEligible = lastDistribution + distributionInterval;
      const currentTime = Math.floor(Date.now() / 1000);

      if (currentTime < Number(nextEligible)) {
        const waitTime = Number(nextEligible) - currentTime;
        throw new Error(`Distribution not eligible yet. Wait ${Math.ceil(waitTime / 60)} minutes`);
      }

    } catch (error) {
      if (error instanceof Error && error.message.includes('Distribution not eligible')) {
        throw error;
      }
      logger.error('Failed to check distribution eligibility:', error);
      throw new Error('Failed to verify distribution eligibility');
    }
  }

  /**
   * Extract distributed amount from distribution transaction
   */
  private async getDistributedAmount(txHash: string): Promise<string> {
    try {
      const provider = await this.kaiaProvider.getProvider();
      const receipt = await provider.getTransactionReceipt(txHash);
      
      const orchestratorInterface = new Interface([
        'event YieldDistributed(uint256 totalAmount, uint256 timestamp)'
      ]);

      for (const log of receipt.logs) {
        try {
          if (log.address.toLowerCase() === this.orchestratorAddress.toLowerCase()) {
            const parsed = orchestratorInterface.parseLog(log);
            if (parsed.name === 'YieldDistributed') {
              return parsed.args.totalAmount.toString();
            }
          }
        } catch (e) {
          // Skip non-matching logs
        }
      }

      throw new Error('YieldDistributed event not found in transaction');
    } catch (error) {
      logger.error(`Failed to get distributed amount from tx ${txHash}:`, error);
      throw error;
    }
  }

  /**
   * Update yield tracking for user
   */
  private async updateYieldTracking(
    userAddress: string, 
    amount: string, 
    txHash: string, 
    operation: 'claim' | 'distribute'
  ): Promise<void> {
    try {
      const key = `defi:yield:${userAddress}`;
      const existing = await this.redis.get(key);
      const tracking = existing ? JSON.parse(existing) : {
        pendingAmount: '0',
        claimedTotal: '0',
        lastClaim: 0,
        accumulatedYield: '0',
        claims: []
      };

      if (operation === 'claim') {
        // Update claim tracking
        const currentClaimed = BigInt(tracking.claimedTotal || '0');
        const currentPending = BigInt(tracking.pendingAmount || '0');
        const claimAmount = BigInt(amount);

        tracking.claimedTotal = (currentClaimed + claimAmount).toString();
        tracking.pendingAmount = (currentPending - claimAmount).toString();
        tracking.lastClaim = Date.now();
        
        tracking.claims.push({
          amount,
          timestamp: Date.now(),
          txHash
        });

        // Keep only last 100 claims
        if (tracking.claims.length > 100) {
          tracking.claims = tracking.claims.slice(-100);
        }
      }

      await this.redis.set(key, JSON.stringify(tracking));

    } catch (error) {
      logger.error(`Failed to update yield tracking for ${userAddress}:`, error);
      // Don't throw - tracking failure shouldn't fail the main operation
    }
  }

  /**
   * Update global distribution tracking
   */
  private async updateGlobalDistributionTracking(amount: string, txHash: string): Promise<void> {
    try {
      const key = 'defi:yield:global:distributions';
      const existing = await this.redis.get(key);
      const tracking = existing ? JSON.parse(existing) : {
        totalDistributed: '0',
        distributionCount: 0,
        lastDistribution: 0,
        distributions: []
      };

      const currentTotal = BigInt(tracking.totalDistributed || '0');
      const distributionAmount = BigInt(amount);

      tracking.totalDistributed = (currentTotal + distributionAmount).toString();
      tracking.distributionCount += 1;
      tracking.lastDistribution = Date.now();
      
      tracking.distributions.push({
        amount,
        timestamp: Date.now(),
        txHash
      });

      // Keep only last 50 distributions
      if (tracking.distributions.length > 50) {
        tracking.distributions = tracking.distributions.slice(-50);
      }

      await this.redis.set(key, JSON.stringify(tracking));

    } catch (error) {
      logger.error('Failed to update global distribution tracking:', error);
      // Don't throw - tracking failure shouldn't fail the main operation
    }
  }
}