/**
 * StandardizedYield Vault Service
 * Handles SY vault operations including deposits, withdrawals, and balance queries
 */

import { Contract, formatUnits, verifyTypedData, Interface } from 'ethers';
import { KaiaProviderManager } from '../blockchain/provider';
import { FeeDelegationService } from '../blockchain/feeDelegationService';
import { RedisService } from '../redis/redisService';
import { getContractInstance, CONTRACT_ADDRESSES, SY_VAULT_ABI } from '../../constants/contractAbis';
import logger from '../../utils/logger';

export interface SYDepositParams {
  user: string;
  amount: string;
  signature: string;
  nonce: number;
  deadline: number;
  senderRawTransaction?: string; // User's signed fee-delegated transaction
}

export interface SYWithdrawParams {
  user: string;
  shares: string;
  signature: string;
  nonce: number;
  deadline: number;
  senderRawTransaction?: string; // User's signed fee-delegated transaction
}

export interface SYBalance {
  syShares: string;
  underlyingAssets: string;
  sharePrice: string;
}

export interface SYVaultInfo {
  totalAssets: string;
  totalSupply: string;
  apy: number;
  strategies: Array<{
    address: string;
    allocation: number;
    apy: number;
  }>;
}

export class SYVaultService {
  private kaiaProvider: KaiaProviderManager;
  private feeDelegation: FeeDelegationService;
  private redis: RedisService;
  private syVaultAddress: string;

  constructor(
    kaiaProvider: KaiaProviderManager,
    feeDelegation: FeeDelegationService,
    redis: RedisService
  ) {
    this.kaiaProvider = kaiaProvider;
    this.feeDelegation = feeDelegation;
    this.redis = redis;
    this.syVaultAddress = CONTRACT_ADDRESSES.SY_VAULT;
  }

  /**
   * Deposit USDT to SY vault with user authorization
   */
  async deposit(params: SYDepositParams): Promise<{ txHash: string; shares: string }> {
    try {
      logger.info(`SY vault deposit initiated for user ${params.user}, amount: ${params.amount}`);

      // Verify EIP-712 signature for deposit authorization
      await this.verifyDepositSignature(params);

      // Execute gasless deposit via fee delegation
      // User must provide pre-signed fee-delegated transaction
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

      logger.info(`SY vault deposit completed. TxHash: ${txHash}, Shares: ${shares}`);
      return { txHash, shares };

    } catch (error) {
      logger.error('SY vault deposit failed:', error);
      throw new Error(`Deposit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Withdraw from SY vault with user authorization
   */
  async withdraw(params: SYWithdrawParams): Promise<{ txHash: string; assets: string }> {
    try {
      logger.info(`SY vault withdrawal initiated for user ${params.user}, shares: ${params.shares}`);

      // Verify EIP-712 signature for withdrawal authorization
      await this.verifyWithdrawSignature(params);

      // Execute gasless withdrawal via fee delegation
      // User must provide pre-signed fee-delegated transaction
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

      logger.info(`SY vault withdrawal completed. TxHash: ${txHash}, Assets: ${assets}`);
      return { txHash, assets };

    } catch (error) {
      logger.error('SY vault withdrawal failed:', error);
      throw new Error(`Withdrawal failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user's SY vault balance
   */
  async getBalance(userAddress: string): Promise<SYBalance> {
    try {
      const provider = await this.kaiaProvider.getProvider();
      const syVaultContract = getContractInstance('SY_VAULT', provider as any) as any;

      const syShares = await syVaultContract.balanceOf(userAddress);
      const underlyingAssets = await syVaultContract.convertToAssets(syShares);
      // SY vault uses 6 decimals, not 18
      const sharePrice = syShares > 0n ? (underlyingAssets * 1000000n) / syShares : 1000000n;

      return {
        syShares: syShares.toString(),
        underlyingAssets: underlyingAssets.toString(),
        sharePrice: sharePrice.toString()
      };

    } catch (error) {
      logger.error(`Failed to get SY balance for ${userAddress}:`, error);
      throw new Error('Failed to fetch balance');
    }
  }

  /**
   * Get current SY vault APY and information
   */
  async getVaultInfo(): Promise<SYVaultInfo> {
    try {
      // Check Redis cache first (5-minute TTL)
      const cached = await this.redis.get('defi:sy:vault:info');
      if (cached) {
        return JSON.parse(cached as string) as SYVaultInfo;
      }

      const provider = await this.kaiaProvider.getProvider();
      const syVaultContract = getContractInstance('SY_VAULT', provider as any) as any;

      const [totalAssets, totalSupply, yieldRate] = await Promise.all([
        syVaultContract.totalAssets(),
        syVaultContract.totalSupply(),
        syVaultContract.yieldRate()
      ]);

      // Get strategy information (mock for now since our contract doesn't have complex strategies)
      const strategies = [
        { address: this.syVaultAddress, allocation: 100, apy: parseFloat((yieldRate * 100n / 10000n).toString()) }
      ];

      const vaultInfo: SYVaultInfo = {
        totalAssets: totalAssets.toString(),
        totalSupply: totalSupply.toString(),
        apy: parseFloat((yieldRate * 100n / 10000n).toString()) / 100, // Convert basis points to percentage
        strategies
      };

      // Cache for 5 minutes
      await this.redis.setWithTTL('defi:sy:vault:info', JSON.stringify(vaultInfo), 300);

      return vaultInfo;

    } catch (error) {
      logger.error('Failed to get vault info:', error);
      throw new Error('Failed to fetch vault information');
    }
  }


  /**
   * Verify EIP-712 signature for deposit
   */
  private async verifyDepositSignature(params: SYDepositParams): Promise<void> {
    const domain = {
      name: 'LineX',
      version: '1',
      chainId: parseInt(process.env.KAIA_CHAIN_ID || '1001'),
      verifyingContract: this.syVaultAddress
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
      vault: this.syVaultAddress,
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
  private async verifyWithdrawSignature(params: SYWithdrawParams): Promise<void> {
    const domain = {
      name: 'LineX',
      version: '1',
      chainId: parseInt(process.env.KAIA_CHAIN_ID || '1001'),
      verifyingContract: this.syVaultAddress
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
      vault: this.syVaultAddress,
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
      
      // Parse Deposit event from SY vault contract
      const syVaultInterface = new Interface([
        'event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)'
      ]);

      for (const log of receipt.logs) {
        try {
          if (log.address.toLowerCase() === this.syVaultAddress.toLowerCase()) {
            const parsed = syVaultInterface.parseLog(log);
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
      
      // Parse Withdraw event from SY vault contract
      const syVaultInterface = new Interface([
        'event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)'
      ]);

      for (const log of receipt.logs) {
        try {
          if (log.address.toLowerCase() === this.syVaultAddress.toLowerCase()) {
            const parsed = syVaultInterface.parseLog(log);
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
        pytBalance: '0',
        nytBalance: '0',
        portfolioTokens: '0',
        lastUpdate: Date.now()
      };

      // Update SY shares based on operation
      const currentShares = BigInt(position.syShares || '0');
      const changeAmount = BigInt(amount);
      
      if (operation === 'deposit') {
        position.syShares = (currentShares + changeAmount).toString();
      } else {
        position.syShares = (currentShares - changeAmount).toString();
      }

      position.lastUpdate = Date.now();

      await this.redis.set(key, JSON.stringify(position));
      logger.info(`Updated position for ${userAddress}: ${operation} ${amount} SY shares`);

    } catch (error) {
      logger.error(`Failed to update user position for ${userAddress}:`, error);
      // Don't throw - position update failure shouldn't fail the main operation
    }
  }
}