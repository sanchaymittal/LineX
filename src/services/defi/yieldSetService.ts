/**
 * YieldSet Service  
 * Handles YieldSet portfolio operations including deposits, withdrawals, and rebalancing
 */

import { Contract, formatUnits, verifyTypedData, Interface } from 'ethers';
import { KaiaProviderManager } from '../blockchain/provider';
import { FeeDelegationService } from '../blockchain/feeDelegationService';
import { RedisService } from '../redis/redisService';
import { getContractInstance, CONTRACT_ADDRESSES, YIELD_SET_ABI } from '../../constants/contractAbis';
import logger from '../../utils/logger';

export interface YieldSetDepositParams {
  user: string;
  amount: string;
  signature: string;
  nonce: number;
  deadline: number;
  senderRawTransaction?: string; // User's signed fee-delegated transaction
}

export interface YieldSetWithdrawParams {
  user: string;
  shares: string;
  signature: string;
  nonce: number;
  deadline: number;
  senderRawTransaction?: string; // User's signed fee-delegated transaction
}

export interface YieldSetBalance {
  portfolioShares: string;
  underlyingAssets: string;
  sharePrice: string;
}

export interface YieldSetPosition {
  address: string;
  name: string;
  weight: number;
  value: string;
  apy: number;
  riskLevel: number;
}

export interface YieldSetPortfolioInfo {
  totalAssets: string;
  totalSupply: string;
  portfolioValue: string;
  positions: YieldSetPosition[];
  rebalanceInfo: {
    threshold: number;
    interval: number;
    enabled: boolean;
    lastRebalance: number;
    canRebalance: boolean;
  };
  fees: {
    managementFee: number;
    performanceFee: number;
  };
  expectedApy: number;
  riskLevel: number;
}

export class YieldSetService {
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
    this.yieldSetAddress = CONTRACT_ADDRESSES.YIELD_SET;
  }

  /**
   * Deposit USDT to YieldSet portfolio with user authorization
   */
  async deposit(params: YieldSetDepositParams): Promise<{ txHash: string; shares: string }> {
    try {
      logger.info(`YieldSet portfolio deposit initiated for user ${params.user}, amount: ${params.amount}`);

      // Verify EIP-712 signature for deposit authorization
      await this.verifyDepositSignature(params);

      // Execute gasless deposit via fee delegation
      if (!params.senderRawTransaction) {
        throw new Error('senderRawTransaction is required for fee-delegated deposits');
      }
      const result = await this.feeDelegation.executeFeeDelegatedTransaction(params.senderRawTransaction);
      if (!result.success) {
        throw new Error(result.error || 'Deposit transaction failed');
      }
      const txHash = result.transactionHash!;

      // Get shares minted from transaction receipt
      const shares = await this.getDepositedShares(txHash);

      // Update user position in Redis
      await this.updateUserPosition(params.user, shares, 'deposit');

      logger.info(`YieldSet portfolio deposit completed. TxHash: ${txHash}, Shares: ${shares}`);
      return { txHash, shares };

    } catch (error) {
      logger.error('YieldSet portfolio deposit failed:', error);
      throw new Error(`Deposit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Withdraw from YieldSet portfolio with user authorization
   */
  async withdraw(params: YieldSetWithdrawParams): Promise<{ txHash: string; assets: string }> {
    try {
      logger.info(`YieldSet portfolio withdrawal initiated for user ${params.user}, shares: ${params.shares}`);

      // Verify EIP-712 signature for withdrawal authorization
      await this.verifyWithdrawSignature(params);

      // Execute gasless withdrawal via fee delegation
      if (!params.senderRawTransaction) {
        throw new Error('senderRawTransaction is required for fee-delegated withdrawals');
      }
      const result = await this.feeDelegation.executeFeeDelegatedTransaction(params.senderRawTransaction);
      if (!result.success) {
        throw new Error(result.error || 'Withdrawal transaction failed');
      }
      const txHash = result.transactionHash!;

      // Get assets withdrawn from transaction receipt
      const assets = await this.getWithdrawnAssets(txHash);

      // Update user position in Redis
      await this.updateUserPosition(params.user, params.shares, 'withdraw');

      logger.info(`YieldSet portfolio withdrawal completed. TxHash: ${txHash}, Assets: ${assets}`);
      return { txHash, assets };

    } catch (error) {
      logger.error('YieldSet portfolio withdrawal failed:', error);
      throw new Error(`Withdrawal failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user's YieldSet portfolio balance
   */
  async getBalance(userAddress: string): Promise<YieldSetBalance> {
    try {
      const provider = await this.kaiaProvider.getProvider();
      const yieldSetContract = getContractInstance('YIELD_SET', provider as any) as any;

      const portfolioShares = await yieldSetContract.balanceOf(userAddress);
      const underlyingAssets = await yieldSetContract.convertToAssets(portfolioShares);
      const sharePrice = portfolioShares > 0n ? (underlyingAssets * 1000000000000000000n) / portfolioShares : 1000000000000000000n;

      return {
        portfolioShares: portfolioShares.toString(),
        underlyingAssets: underlyingAssets.toString(),
        sharePrice: sharePrice.toString()
      };

    } catch (error) {
      logger.error(`Failed to get YieldSet balance for ${userAddress}:`, error);
      throw new Error('Failed to fetch balance');
    }
  }

  /**
   * Get comprehensive YieldSet portfolio information
   */
  async getPortfolioInfo(): Promise<YieldSetPortfolioInfo> {
    try {
      // Check Redis cache first (3-minute TTL)
      const cached = await this.redis.get('defi:yieldset:portfolio:info');
      if (cached) {
        return JSON.parse(cached as string) as YieldSetPortfolioInfo;
      }

      const provider = await this.kaiaProvider.getProvider();
      const yieldSetContract = getContractInstance('YIELD_SET', provider as any) as any;

      const [
        totalAssets,
        totalSupply,
        portfolioValue,
        [positionAddresses, positionWeights],
        [threshold, interval, enabled],
        lastRebalance,
        canRebalance,
        riskLevel,
        managementFee,
        performanceFee
      ] = await Promise.all([
        yieldSetContract.totalAssets(),
        yieldSetContract.totalSupply(),
        yieldSetContract.getPortfolioValue(),
        yieldSetContract.getPositions(),
        yieldSetContract.getRebalanceParams(),
        yieldSetContract.lastRebalance(),
        yieldSetContract.canRebalance(),
        yieldSetContract.riskLevel(),
        yieldSetContract.managementFee(),
        yieldSetContract.performanceFee()
      ]);

      // Build position information with names and APYs
      const positions: YieldSetPosition[] = await Promise.all(
        positionAddresses.map(async (address: string, index: number) => {
          const positionName = this.getPositionName(address);
          const { apy, riskLevel } = await this.getPositionStats(address);
          const weight = parseInt(positionWeights[index].toString()) / 100; // Convert basis points to percentage

          return {
            address,
            name: positionName,
            weight,
            value: ((BigInt(portfolioValue.toString()) * BigInt(weight * 100)) / 10000n).toString(),
            apy,
            riskLevel
          };
        })
      );

      // Calculate expected blended APY
      const expectedApy = positions.reduce((total, pos) => total + (pos.apy * pos.weight / 100), 0);

      const portfolioInfo: YieldSetPortfolioInfo = {
        totalAssets: totalAssets.toString(),
        totalSupply: totalSupply.toString(),
        portfolioValue: portfolioValue.toString(),
        positions,
        rebalanceInfo: {
          threshold: parseInt(threshold.toString()) / 100, // Convert basis points to percentage
          interval: parseInt(interval.toString()),
          enabled: enabled,
          lastRebalance: parseInt(lastRebalance.toString()) * 1000, // Convert to milliseconds
          canRebalance: canRebalance
        },
        fees: {
          managementFee: parseInt(managementFee.toString()) / 100, // Convert basis points to percentage
          performanceFee: parseInt(performanceFee.toString()) / 100
        },
        expectedApy,
        riskLevel: parseInt(riskLevel.toString())
      };

      // Cache for 3 minutes
      await this.redis.setWithTTL('defi:yieldset:portfolio:info', JSON.stringify(portfolioInfo), 180);

      return portfolioInfo;

    } catch (error) {
      logger.error('Failed to get YieldSet portfolio info:', error);
      throw new Error('Failed to fetch portfolio information');
    }
  }

  /**
   * Trigger portfolio rebalancing
   */
  async rebalancePortfolio(userAddress: string): Promise<{ txHash: string; rebalancedPositions: number }> {
    try {
      logger.info(`Portfolio rebalancing triggered by user ${userAddress}`);

      // Check if rebalancing is allowed
      const portfolioInfo = await this.getPortfolioInfo();
      if (!portfolioInfo.rebalanceInfo.canRebalance) {
        throw new Error('Rebalancing not currently available');
      }

      // Execute rebalancing via fee delegation (simplified for demo)
      const txHash = `0x${'1'.repeat(64)}`; // Mock transaction hash
      const rebalancedPositions = portfolioInfo.positions.length;

      // Update cache to reflect new rebalance time
      await this.redis.del('defi:yieldset:portfolio:info');

      logger.info(`Portfolio rebalancing completed. TxHash: ${txHash}, Positions: ${rebalancedPositions}`);
      return { txHash, rebalancedPositions };

    } catch (error) {
      logger.error('Portfolio rebalancing failed:', error);
      throw new Error(`Rebalancing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Harvest yield from all positions
   */
  async harvestYield(userAddress: string): Promise<{ txHash: string; harvestedAmount: string }> {
    try {
      logger.info(`Yield harvesting triggered by user ${userAddress}`);

      // Execute yield harvesting via fee delegation (simplified for demo)
      const txHash = `0x${'2'.repeat(64)}`; // Mock transaction hash
      const harvestedAmount = '5000000'; // Mock harvested amount (5 USDT)

      logger.info(`Yield harvesting completed. TxHash: ${txHash}, Amount: ${harvestedAmount}`);
      return { txHash, harvestedAmount };

    } catch (error) {
      logger.error('Yield harvesting failed:', error);
      throw new Error(`Yield harvesting failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get position name from address
   */
  private getPositionName(address: string): string {
    const addressLower = address.toLowerCase();
    const contractAddresses = CONTRACT_ADDRESSES;

    if (addressLower === contractAddresses.STANDARDIZED_YIELD.toLowerCase()) {
      return 'StandardizedYield (Multi-Strategy)';
    } else if (addressLower === contractAddresses.AUTO_COMPOUND_VAULT_WRAPPER.toLowerCase()) {
      return 'AutoCompound Vault';
    } else if (addressLower === contractAddresses.PYT_NYT_ORCHESTRATOR_WRAPPER.toLowerCase()) {
      return 'PYT/NYT Orchestrator';
    }

    return `Position ${address.slice(0, 8)}...`;
  }

  /**
   * Get position statistics (APY and risk level)
   */
  private async getPositionStats(address: string): Promise<{ apy: number; riskLevel: number }> {
    const addressLower = address.toLowerCase();
    const contractAddresses = CONTRACT_ADDRESSES;

    // Return known stats for our deployed positions
    if (addressLower === contractAddresses.STANDARDIZED_YIELD.toLowerCase()) {
      return { apy: 9.5, riskLevel: 4 }; // Medium risk, diversified
    } else if (addressLower === contractAddresses.AUTO_COMPOUND_VAULT_WRAPPER.toLowerCase()) {
      return { apy: 11.0, riskLevel: 5 }; // Medium-high risk, auto-compounding
    } else if (addressLower === contractAddresses.PYT_NYT_ORCHESTRATOR_WRAPPER.toLowerCase()) {
      return { apy: 13.5, riskLevel: 6 }; // Medium-high risk, yield derivatives
    }

    // Default for unknown positions
    return { apy: 8.0, riskLevel: 5 };
  }

  /**
   * Verify EIP-712 signature for deposit
   */
  private async verifyDepositSignature(params: YieldSetDepositParams): Promise<void> {
    const domain = {
      name: 'LineX',
      version: '1',
      chainId: parseInt(process.env.KAIA_CHAIN_ID || '1001'),
      verifyingContract: this.yieldSetAddress
    };

    const types = {
      DeFiDeposit: [
        { name: 'user', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'vault', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
      ]
    };

    const value = {
      user: params.user,
      amount: params.amount,
      vault: this.yieldSetAddress,
      nonce: params.nonce,
      deadline: params.deadline
    };

    const recoveredAddress = verifyTypedData(domain, types, value, params.signature);
    
    if (recoveredAddress.toLowerCase() !== params.user.toLowerCase()) {
      throw new Error('Invalid signature');
    }

    // Check deadline
    if (Date.now() > params.deadline * 1000) {
      throw new Error('Signature expired');
    }
  }

  /**
   * Verify EIP-712 signature for withdrawal
   */
  private async verifyWithdrawSignature(params: YieldSetWithdrawParams): Promise<void> {
    const domain = {
      name: 'LineX',
      version: '1',
      chainId: parseInt(process.env.KAIA_CHAIN_ID || '1001'),
      verifyingContract: this.yieldSetAddress
    };

    const types = {
      DeFiWithdraw: [
        { name: 'user', type: 'address' },
        { name: 'shares', type: 'uint256' },
        { name: 'vault', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
      ]
    };

    const value = {
      user: params.user,
      shares: params.shares,
      vault: this.yieldSetAddress,
      nonce: params.nonce,
      deadline: params.deadline
    };

    const recoveredAddress = verifyTypedData(domain, types, value, params.signature);
    
    if (recoveredAddress.toLowerCase() !== params.user.toLowerCase()) {
      throw new Error('Invalid signature');
    }

    // Check deadline
    if (Date.now() > params.deadline * 1000) {
      throw new Error('Signature expired');
    }
  }

  /**
   * Get shares minted from deposit transaction
   */
  private async getDepositedShares(txHash: string): Promise<string> {
    try {
      const provider = await this.kaiaProvider.getProvider();
      const receipt = await provider.getTransactionReceipt(txHash);
      
      // Parse Deposit event from YieldSet contract
      const yieldSetInterface = new Interface([
        'event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)'
      ]);

      for (const log of receipt.logs) {
        try {
          if (log.address.toLowerCase() === this.yieldSetAddress.toLowerCase()) {
            const parsed = yieldSetInterface.parseLog(log);
            if (parsed && parsed.name === 'Deposit') {
              return parsed.args.shares.toString();
            }
          }
        } catch (e) {
          // Skip non-matching logs
        }
      }

      throw new Error('Deposit event not found in transaction');
    } catch (error) {
      logger.error(`Failed to get deposited shares from tx ${txHash}:`, error);
      throw error;
    }
  }

  /**
   * Get assets withdrawn from withdrawal transaction
   */
  private async getWithdrawnAssets(txHash: string): Promise<string> {
    try {
      const provider = await this.kaiaProvider.getProvider();
      const receipt = await provider.getTransactionReceipt(txHash);
      
      // Parse Withdraw event from YieldSet contract
      const yieldSetInterface = new Interface([
        'event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)'
      ]);

      for (const log of receipt.logs) {
        try {
          if (log.address.toLowerCase() === this.yieldSetAddress.toLowerCase()) {
            const parsed = yieldSetInterface.parseLog(log);
            if (parsed && parsed.name === 'Withdraw') {
              return parsed.args.assets.toString();
            }
          }
        } catch (e) {
          // Skip non-matching logs
        }
      }

      throw new Error('Withdraw event not found in transaction');
    } catch (error) {
      logger.error(`Failed to get withdrawn assets from tx ${txHash}:`, error);
      throw error;
    }
  }

  /**
   * Update user position in Redis
   */
  private async updateUserPosition(userAddress: string, amount: string, operation: 'deposit' | 'withdraw'): Promise<void> {
    try {
      const key = `defi:positions:${userAddress}`;
      const existing = await this.redis.get(key);
      const position = existing ? JSON.parse(existing as string) as any : {
        syShares: '0',
        autoCompoundShares: '0',
        pytBalance: '0',
        nytBalance: '0',
        portfolioTokens: '0',
        lastUpdate: Date.now()
      };

      // Update portfolio tokens based on operation
      const currentTokens = BigInt(position.portfolioTokens || '0');
      const changeAmount = BigInt(amount);
      
      if (operation === 'deposit') {
        position.portfolioTokens = (currentTokens + changeAmount).toString();
      } else {
        position.portfolioTokens = (currentTokens - changeAmount).toString();
      }

      position.lastUpdate = Date.now();

      await this.redis.set(key, JSON.stringify(position));
      logger.info(`Updated position for ${userAddress}: ${operation} ${amount} YieldSet tokens`);

    } catch (error) {
      logger.error(`Failed to update user position for ${userAddress}:`, error);
      // Don't throw - position update failure shouldn't fail the main operation
    }
  }
}