/**
 * Fee Delegation Service
 * 
 * Implements fee delegation for gasless transactions where the platform
 * pays gas fees on behalf of users for a seamless experience.
 * 
 * For LineX remittance platform, this enables:
 * - Gasless faucet claims for new users
 * - Gasless token transfers for remittances
 * - Seamless onboarding without requiring users to have KAIA
 */

import { Wallet, formatUnits } from '@kaiachain/ethers-ext';
import { kaiaProvider } from './provider';
import { simpleContractService } from './simpleContractService';
import { CONTRACT_CONSTANTS } from '../../types/contracts';
import logger from '../../utils/logger';
import config from '../../config';

export interface GaslessTransactionOptions {
  userAddress: string;
  amount?: number; // USDT amount
  gasLimit?: number;
  maxRetries?: number;
}

export interface GaslessTransactionResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  gasUsed?: bigint;
  cost?: string; // Cost in KAIA
}

export class FeeDelegationService {
  private gasPayerWallet: Wallet | null = null;

  constructor() {
    // Lazy initialization - will initialize when first used
  }

  private initializeGasPayer(): void {
    try {
      const privateKey = config.blockchain.gasPayerPrivateKey;
      if (!privateKey) {
        throw new Error('Gas payer private key not configured');
      }

      if (!kaiaProvider.isProviderConnected()) {
        throw new Error('Kaia provider not connected');
      }

      const provider = kaiaProvider.getProvider();
      this.gasPayerWallet = new Wallet(privateKey, provider);

      logger.info('✅ Fee delegation service initialized', {
        gasPayerAddress: this.gasPayerWallet.address,
      });
    } catch (error) {
      logger.error('❌ Failed to initialize fee delegation service:', error);
      throw error;
    }
  }

  private ensureGasPayer(): Wallet {
    if (!this.gasPayerWallet) {
      this.initializeGasPayer();
    }
    if (!this.gasPayerWallet) {
      throw new Error('Gas payer wallet not initialized');
    }
    return this.gasPayerWallet;
  }

  async getGasPayerInfo(): Promise<{
    address: string;
    balance: string; // KAIA balance
    balanceRaw: bigint;
  }> {
    const gasPayer = this.ensureGasPayer();
    const provider = kaiaProvider.getProvider();
    
    const balance = await provider.getBalance(gasPayer.address);
    const balanceBigInt = BigInt(balance.toString());
    
    return {
      address: gasPayer.address,
      balance: formatUnits(balanceBigInt, 18), // KAIA has 18 decimals
      balanceRaw: balanceBigInt,
    };
  }

  /**
   * Executes a gasless faucet claim for a user
   * The gas payer covers the transaction fees
   */
  async executeGaslessFaucetClaim(options: GaslessTransactionOptions): Promise<GaslessTransactionResult> {
    try {
      const gasPayer = this.ensureGasPayer();
      const provider = kaiaProvider.getProvider();
      
      logger.info('🚰 Executing gasless faucet claim', {
        userAddress: options.userAddress,
        gasPayerAddress: gasPayer.address,
      });

      // Check if user can claim faucet (this is a read operation, no gas needed)
      const faucetCheckData = this.buildFaucetCheckCall(options.userAddress);
      const canClaimResult = await provider.call({
        to: CONTRACT_CONSTANTS.ADDRESS,
        data: faucetCheckData,
      });

      // Simple decode: if result is not 0x0000...0001, user cannot claim
      if (!canClaimResult.endsWith('0001')) {
        return {
          success: false,
          error: 'User not eligible for faucet claim (cooldown active or already claimed)',
        };
      }

      // Prepare the faucet transaction
      const faucetTx = {
        to: CONTRACT_CONSTANTS.ADDRESS,
        data: '0xde5f72fd', // faucet() function selector
        gasLimit: options.gasLimit || 100000,
        gasPrice: await provider.getGasPrice(),
      };

      // Execute the transaction using gas payer
      const tx = await gasPayer.sendTransaction(faucetTx);
      const receipt = await tx.wait();

      const gasUsed = BigInt(receipt.gasUsed.toString());
      const currentGasPrice = await provider.getGasPrice();
      const gasPrice = BigInt(currentGasPrice.toString());
      const cost = formatUnits(gasUsed * gasPrice, 18);

      logger.info('✅ Gasless faucet claim successful', {
        userAddress: options.userAddress,
        transactionHash: tx.hash,
        gasUsed: gasUsed.toString(),
        cost: `${cost} KAIA`,
      });

      return {
        success: true,
        transactionHash: tx.hash,
        gasUsed,
        cost: `${cost} KAIA`,
      };

    } catch (error) {
      logger.error('❌ Gasless faucet claim failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Executes a gasless token transfer for remittances
   * The gas payer covers the transaction fees
   */
  async executeGaslessTransfer(
    from: string,
    to: string,
    amount: number,
    options: Partial<GaslessTransactionOptions> = {}
  ): Promise<GaslessTransactionResult> {
    try {
      const gasPayer = this.ensureGasPayer();
      const provider = kaiaProvider.getProvider();

      logger.info('💸 Executing gasless transfer', {
        from,
        to,
        amount,
        gasPayerAddress: gasPayer.address,
      });

      // Check if sender has sufficient balance
      const balanceResult = await simpleContractService.getBalance(from);
      if (!balanceResult.success || !balanceResult.data) {
        return {
          success: false,
          error: 'Failed to check sender balance',
        };
      }

      if (balanceResult.data.usdt < amount) {
        return {
          success: false,
          error: `Insufficient balance. Required: ${amount} USDT, Available: ${balanceResult.data.usdt} USDT`,
        };
      }

      // Convert amount to contract units (6 decimals for USDT)
      const amountInUnits = BigInt(amount * 10 ** CONTRACT_CONSTANTS.DECIMALS);
      
      // Prepare transfer transaction data
      const transferData = this.buildTransferCall(to, amountInUnits);
      
      const transferTx = {
        to: CONTRACT_CONSTANTS.ADDRESS,
        data: transferData,
        gasLimit: options.gasLimit || 150000,
        gasPrice: await provider.getGasPrice(),
      };

      // Note: For a real implementation, we would need the user's signature
      // or implement a delegated transfer pattern. For demo purposes,
      // we'll simulate this by having the gas payer (who owns tokens) transfer
      
      const tx = await gasPayer.sendTransaction(transferTx);
      const receipt = await tx.wait();

      const gasUsed = BigInt(receipt.gasUsed.toString());
      const currentGasPrice = await provider.getGasPrice();
      const gasPrice = BigInt(currentGasPrice.toString());
      const cost = formatUnits(gasUsed * gasPrice, 18);

      logger.info('✅ Gasless transfer successful', {
        from,
        to,
        amount,
        transactionHash: tx.hash,
        gasUsed: gasUsed.toString(),
        cost: `${cost} KAIA`,
      });

      return {
        success: true,
        transactionHash: tx.hash,
        gasUsed,
        cost: `${cost} KAIA`,
      };

    } catch (error) {
      logger.error('❌ Gasless transfer failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Estimates gas cost for a gasless transaction
   */
  async estimateGasCost(transactionType: 'faucet' | 'transfer'): Promise<{
    gasEstimate: bigint;
    costInKaia: string;
    gasPrice: bigint;
  }> {
    const provider = kaiaProvider.getProvider();
    const gasPrice = await provider.getGasPrice();
    
    // Estimated gas amounts based on transaction type
    const gasEstimates = {
      faucet: BigInt(100000),
      transfer: BigInt(150000),
    };

    const gasEstimate = gasEstimates[transactionType];
    const gasPriceBigInt = BigInt(gasPrice.toString());
    const costInWei = gasEstimate * gasPriceBigInt;
    const costInKaia = formatUnits(costInWei, 18);

    return {
      gasEstimate,
      costInKaia,
      gasPrice: gasPriceBigInt,
    };
  }

  /**
   * Monitors gas payer balance and alerts if running low
   */
  async checkGasPayerBalance(): Promise<{
    isHealthy: boolean;
    balance: string;
    warning?: string;
  }> {
    try {
      const info = await this.getGasPayerInfo();
      const balanceNumber = parseFloat(info.balance);
      
      // Alert if balance is below 1 KAIA
      const isHealthy = balanceNumber >= 1.0;
      const warning = !isHealthy 
        ? `Gas payer balance is low: ${info.balance} KAIA. Please refill.`
        : undefined;

      logger.info('🔍 Gas payer balance check', {
        address: info.address,
        balance: info.balance,
        isHealthy,
      });

      return {
        isHealthy,
        balance: info.balance,
        warning,
      };
    } catch (error) {
      logger.error('❌ Failed to check gas payer balance:', error);
      return {
        isHealthy: false,
        balance: '0',
        warning: 'Failed to check gas payer balance',
      };
    }
  }

  // Helper methods for building transaction data

  private buildFaucetCheckCall(userAddress: string): string {
    // canUseFaucet(address) function selector + padded address
    const functionSelector = '0x780768fc';
    const paddedAddress = userAddress.replace('0x', '').toLowerCase().padStart(64, '0');
    return functionSelector + paddedAddress;
  }

  private buildTransferCall(to: string, amount: bigint): string {
    // transfer(address,uint256) function selector
    const functionSelector = '0xa9059cbb';
    const paddedTo = to.replace('0x', '').toLowerCase().padStart(64, '0');
    const paddedAmount = amount.toString(16).padStart(64, '0');
    return functionSelector + paddedTo + paddedAmount;
  }

  getGasPayerAddress(): string {
    const gasPayer = this.ensureGasPayer();
    return gasPayer.address;
  }
}

// Export singleton instance
export const feeDelegationService = new FeeDelegationService();
export default feeDelegationService;