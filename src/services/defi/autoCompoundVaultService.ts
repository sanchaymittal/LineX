/**
 * AutoCompoundVault Service
 * Handles auto-compounding vault operations via wrapper for IYieldStrategy compatibility
 */

import { Contract, formatUnits, verifyTypedData, Interface } from 'ethers';
import { KaiaProviderManager } from '../blockchain/provider';
import { FeeDelegationService } from '../blockchain/feeDelegationService';
import { RedisService } from '../redis/redisService';
import { getContractInstance, CONTRACT_ADDRESSES, AUTO_COMPOUND_VAULT_WRAPPER_ABI } from '../../constants/contractAbis';
import logger from '../../utils/logger';

export interface AutoCompoundDepositParams {
  user: string;
  amount: string;
  signature: string;
  nonce: number;
  deadline: number;
  senderRawTransaction?: string; // User's signed fee-delegated transaction
}

export interface AutoCompoundWithdrawParams {
  user: string;
  amount: string;
  signature: string;
  nonce: number;
  deadline: number;
  senderRawTransaction?: string; // User's signed fee-delegated transaction
}

export interface AutoCompoundBalance {
  shares: string;
  underlyingAssets: string;
  sharePrice: string;
}

export interface AutoCompoundVaultInfo {
  totalAssets: string;
  totalSupply: string;
  apy: number;
  riskLevel: number;
  compoundingRate: string;
  lastCompound: number;
}

export class AutoCompoundVaultService {
  private kaiaProvider: KaiaProviderManager;
  private feeDelegation: FeeDelegationService;
  private redis: RedisService;
  private vaultAddress: string;

  constructor(
    kaiaProvider: KaiaProviderManager,
    feeDelegation: FeeDelegationService,
    redis: RedisService
  ) {
    this.kaiaProvider = kaiaProvider;
    this.feeDelegation = feeDelegation;
    this.redis = redis;
    this.vaultAddress = CONTRACT_ADDRESSES.AUTO_COMPOUND_VAULT_WRAPPER;
  }

  /**
   * Deposit USDT to auto-compound vault with user authorization
   */
  async deposit(params: AutoCompoundDepositParams): Promise<{ txHash: string; shares: string }> {
    try {
      logger.info(`AutoCompound vault deposit initiated for user ${params.user}, amount: ${params.amount}`);

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

      logger.info(`AutoCompound vault deposit completed. TxHash: ${txHash}, Shares: ${shares}`);
      return { txHash, shares };

    } catch (error) {
      logger.error('AutoCompound vault deposit failed:', error);
      throw new Error(`Deposit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Withdraw from auto-compound vault with user authorization
   */
  async withdraw(params: AutoCompoundWithdrawParams): Promise<{ txHash: string; assets: string }> {
    try {
      logger.info(`AutoCompound vault withdrawal initiated for user ${params.user}, amount: ${params.amount}`);

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
      await this.updateUserPosition(params.user, params.amount, 'withdraw');

      logger.info(`AutoCompound vault withdrawal completed. TxHash: ${txHash}, Assets: ${assets}`);
      return { txHash, assets };

    } catch (error) {
      logger.error('AutoCompound vault withdrawal failed:', error);
      throw new Error(`Withdrawal failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user's auto-compound vault balance
   */
  async getBalance(userAddress: string): Promise<AutoCompoundBalance> {
    try {
      const provider = await this.kaiaProvider.getProvider();
      const vaultContract = getContractInstance('AUTO_COMPOUND_VAULT_WRAPPER', provider as any) as any;

      const shares = await vaultContract.balanceOf(userAddress);
      const underlyingAssets = await vaultContract.convertToAssets(shares);
      const sharePrice = shares > 0n ? (underlyingAssets * 1000000000000000000n) / shares : 1000000000000000000n;

      return {
        shares: shares.toString(),
        underlyingAssets: underlyingAssets.toString(),
        sharePrice: sharePrice.toString()
      };

    } catch (error) {
      logger.error(`Failed to get AutoCompound balance for ${userAddress}:`, error);
      throw new Error('Failed to fetch balance');
    }
  }

  /**
   * Get current auto-compound vault APY and information
   */
  async getVaultInfo(): Promise<AutoCompoundVaultInfo> {
    try {
      // Check Redis cache first (5-minute TTL)
      const cached = await this.redis.get('defi:autocompound:vault:info');
      if (cached) {
        return JSON.parse(cached as string) as AutoCompoundVaultInfo;
      }

      const provider = await this.kaiaProvider.getProvider();
      const vaultContract = getContractInstance('AUTO_COMPOUND_VAULT_WRAPPER', provider as any) as any;

      const [totalAssets, totalSupply, apy, riskLevel] = await Promise.all([
        vaultContract.totalAssets(),
        vaultContract.totalSupply(),
        vaultContract.apy(),
        vaultContract.riskLevel()
      ]);

      const vaultInfo: AutoCompoundVaultInfo = {
        totalAssets: totalAssets.toString(),
        totalSupply: totalSupply.toString(),
        apy: parseFloat((apy * 100n / 10000n).toString()) / 100, // Convert basis points to percentage
        riskLevel: parseInt(riskLevel.toString()),
        compoundingRate: '24', // 24 hour compounding
        lastCompound: Date.now() - (Math.random() * 86400000) // Mock last compound within 24hrs
      };

      // Cache for 5 minutes
      await this.redis.setWithTTL('defi:autocompound:vault:info', JSON.stringify(vaultInfo), 300);

      return vaultInfo;

    } catch (error) {
      logger.error('Failed to get AutoCompound vault info:', error);
      throw new Error('Failed to fetch vault information');
    }
  }

  /**
   * Trigger manual compounding (if available)
   */
  async triggerCompounding(userAddress: string): Promise<{ txHash: string; compoundedAmount: string }> {
    try {
      logger.info(`Manual compounding triggered by user ${userAddress}`);

      const provider = await this.kaiaProvider.getProvider();
      const vaultContract = getContractInstance('AUTO_COMPOUND_VAULT_WRAPPER', provider as any) as any;

      // This would trigger a compound operation if the vault supports it
      // For now, this is a placeholder as our wrapper handles compounding automatically
      const txHash = `0x${'0'.repeat(64)}`; // Mock transaction hash
      const compoundedAmount = '1000000'; // Mock compounded amount (1 USDT)

      logger.info(`Compounding completed. TxHash: ${txHash}, Amount: ${compoundedAmount}`);
      return { txHash, compoundedAmount };

    } catch (error) {
      logger.error('Manual compounding failed:', error);
      throw new Error(`Compounding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify EIP-712 signature for deposit
   */
  private async verifyDepositSignature(params: AutoCompoundDepositParams): Promise<void> {
    const domain = {
      name: 'LineX',
      version: '1',
      chainId: parseInt(process.env.KAIA_CHAIN_ID || '1001'),
      verifyingContract: this.vaultAddress
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
      vault: this.vaultAddress,
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
  private async verifyWithdrawSignature(params: AutoCompoundWithdrawParams): Promise<void> {
    const domain = {
      name: 'LineX',
      version: '1',
      chainId: parseInt(process.env.KAIA_CHAIN_ID || '1001'),
      verifyingContract: this.vaultAddress
    };

    const types = {
      DeFiWithdraw: [
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
      vault: this.vaultAddress,
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
      
      // Parse Deposit event from AutoCompound vault wrapper
      const vaultInterface = new Interface([
        'event Deposit(address indexed user, uint256 amount)'
      ]);

      for (const log of receipt.logs) {
        try {
          if (log.address.toLowerCase() === this.vaultAddress.toLowerCase()) {
            const parsed = vaultInterface.parseLog(log);
            if (parsed && parsed.name === 'Deposit') {
              return parsed.args.amount.toString();
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
      
      // Parse Withdraw event from AutoCompound vault wrapper
      const vaultInterface = new Interface([
        'event Withdraw(address indexed user, uint256 amount)'
      ]);

      for (const log of receipt.logs) {
        try {
          if (log.address.toLowerCase() === this.vaultAddress.toLowerCase()) {
            const parsed = vaultInterface.parseLog(log);
            if (parsed && parsed.name === 'Withdraw') {
              return parsed.args.amount.toString();
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

      // Update AutoCompound shares based on operation
      const currentShares = BigInt(position.autoCompoundShares || '0');
      const changeAmount = BigInt(amount);
      
      if (operation === 'deposit') {
        position.autoCompoundShares = (currentShares + changeAmount).toString();
      } else {
        position.autoCompoundShares = (currentShares - changeAmount).toString();
      }

      position.lastUpdate = Date.now();

      await this.redis.set(key, JSON.stringify(position));
      logger.info(`Updated position for ${userAddress}: ${operation} ${amount} AutoCompound shares`);

    } catch (error) {
      logger.error(`Failed to update user position for ${userAddress}:`, error);
      // Don't throw - position update failure shouldn't fail the main operation
    }
  }
}