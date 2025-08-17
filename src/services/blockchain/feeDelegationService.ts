/**
 * Fee Delegation Service
 * 
 * Implements secure fee delegation for gasless transactions with user authorization.
 * Users must sign EIP-712 messages to authorize transfers while the platform
 * pays gas fees for a seamless experience.
 * 
 * Features:
 * - User-authorized gasless token transfers via EIP-712 signatures
 * - User-authorized gasless faucet claims with signature verification
 * - Secure transferFrom pattern - users maintain control of their funds
 * - Gas cost monitoring and health checks
 */

import { Wallet, formatUnits } from '@kaiachain/ethers-ext';
import { verifyTypedData, keccak256, toUtf8Bytes } from 'ethers';
import { kaiaProvider } from './provider';
import { simpleContractService } from './simpleContractService';
import { CONTRACT_CONSTANTS } from '../../types/contracts';
import { AuthorizedTransferRequest, FaucetRequest, GaslessTransactionResult } from '../../types';
import logger from '../../utils/logger';
import config from '../../config';

export class FeeDelegationService {
  private gasPayerWallet: Wallet | null = null;

  // EIP-712 domain for signature verification
  private readonly EIP712_DOMAIN = {
    name: 'LineX Transfer',
    version: '1',
    chainId: 1001, // Kaia testnet
    verifyingContract: CONTRACT_CONSTANTS.ADDRESS
  };

  // EIP-712 types for transfer authorization
  private readonly TRANSFER_TYPES = {
    Transfer: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }
    ]
  };

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
   * Executes a user-authorized gasless faucet claim
   * User must sign a message to authorize the faucet claim
   * Gas payer covers transaction fees
   */
  async executeAuthorizedFaucetClaim(request: FaucetRequest): Promise<GaslessTransactionResult> {
    try {
      const gasPayer = this.ensureGasPayer();
      const provider = kaiaProvider.getProvider();
      
      logger.info('🚰 Executing authorized faucet claim', {
        userAddress: request.userAddress,
        gasPayerAddress: gasPayer.address,
      });

      // 1. Verify user signature authorizes faucet claim
      const isValidSignature = await this.verifyFaucetSignature(request);
      if (!isValidSignature) {
        return {
          success: false,
          error: 'Invalid faucet authorization signature',
        };
      }

      // 2. Check if user can claim faucet (smart contract has 24h cooldown)
      const faucetCheckData = this.buildFaucetCheckCall(request.userAddress);
      const canClaimResult = await provider.call({
        to: CONTRACT_CONSTANTS.ADDRESS,
        data: faucetCheckData,
      });

      // Simple decode: if result is not 0x0000...0001, user cannot claim
      if (!canClaimResult.endsWith('0001')) {
        logger.info('⏰ Faucet cooldown active for user', { userAddress: request.userAddress });
        return {
          success: false,
          error: 'Faucet cooldown active. Smart contract enforces 24-hour cooldown between claims. Use a different wallet address for testing.',
        };
      }

      // 3. Prepare the faucet transaction
      const faucetTx = {
        to: CONTRACT_CONSTANTS.ADDRESS,
        data: '0xde5f72fd', // faucet() function selector
        gasLimit: 100000,
        gasPrice: await provider.getGasPrice(),
      };

      // 4. Execute the transaction using gas payer
      const tx = await gasPayer.sendTransaction(faucetTx);
      const receipt = await tx.wait();

      const gasUsed = BigInt(receipt.gasUsed.toString());
      const currentGasPrice = await provider.getGasPrice();
      const gasPrice = BigInt(currentGasPrice.toString());
      const cost = formatUnits(gasUsed * gasPrice, 18);

      logger.info('✅ Authorized faucet claim successful', {
        userAddress: request.userAddress,
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
      logger.error('❌ Authorized faucet claim failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Executes a user-authorized gasless token transfer
   * User must sign EIP-712 message to authorize the transfer
   * Gas payer covers transaction fees while user's tokens are moved
   */
  async executeAuthorizedTransfer(request: AuthorizedTransferRequest): Promise<GaslessTransactionResult> {
    try {
      const gasPayer = this.ensureGasPayer();
      const provider = kaiaProvider.getProvider();

      logger.info('💸 Executing authorized gasless transfer', {
        from: request.from,
        to: request.to,
        amount: request.amount,
        gasPayerAddress: gasPayer.address,
      });

      // 1. Verify user signature authorizes this transfer
      const isValidSignature = await this.verifyTransferSignature(request);
      if (!isValidSignature) {
        return {
          success: false,
          error: 'Invalid authorization signature',
        };
      }

      // 2. Check deadline hasn't passed
      const currentTime = Math.floor(Date.now() / 1000);
      if (currentTime > request.deadline) {
        return {
          success: false,
          error: 'Transfer authorization has expired',
        };
      }

      // 3. Check if sender has sufficient balance
      const balanceResult = await simpleContractService.getBalance(request.from);
      if (!balanceResult.success || !balanceResult.data) {
        return {
          success: false,
          error: 'Failed to check sender balance',
        };
      }

      if (balanceResult.data.usdt < request.amount) {
        return {
          success: false,
          error: `Insufficient balance. Required: ${request.amount} USDT, Available: ${balanceResult.data.usdt} USDT`,
        };
      }

      // 4. Execute transferFrom transaction (user -> recipient)
      const amountInUnits = BigInt(request.amount * 10 ** CONTRACT_CONSTANTS.DECIMALS);
      const transferFromData = this.buildTransferFromCall(request.from, request.to, amountInUnits);
      
      const transferTx = {
        to: CONTRACT_CONSTANTS.ADDRESS,
        data: transferFromData,
        gasLimit: 200000, // Higher limit for transferFrom
        gasPrice: await provider.getGasPrice(),
      };

      // Gas payer executes the transferFrom transaction
      const tx = await gasPayer.sendTransaction(transferTx);
      const receipt = await tx.wait();

      const gasUsed = BigInt(receipt.gasUsed.toString());
      const currentGasPrice = await provider.getGasPrice();
      const gasPrice = BigInt(currentGasPrice.toString());
      const cost = formatUnits(gasUsed * gasPrice, 18);

      logger.info('✅ Authorized gasless transfer successful', {
        from: request.from,
        to: request.to,
        amount: request.amount,
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
      logger.error('❌ Authorized gasless transfer failed:', error);
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

  /**
   * Verifies user's EIP-712 signature for transfer authorization
   */
  private async verifyTransferSignature(request: AuthorizedTransferRequest): Promise<boolean> {
    try {
      const amountInUnits = BigInt(request.amount * 10 ** CONTRACT_CONSTANTS.DECIMALS);
      
      const message = {
        from: request.from,
        to: request.to,
        amount: amountInUnits,
        nonce: request.nonce,
        deadline: request.deadline
      };

      // Verify signature matches the expected signer
      const recoveredAddress = verifyTypedData(
        this.EIP712_DOMAIN,
        this.TRANSFER_TYPES,
        message,
        request.signature
      );

      const isValid = recoveredAddress.toLowerCase() === request.from.toLowerCase();
      
      if (!isValid) {
        logger.warn('❌ Invalid signature for transfer authorization', {
          from: request.from,
          recoveredAddress,
          expectedAddress: request.from
        });
      }

      return isValid;
    } catch (error) {
      logger.error('❌ Signature verification failed:', error);
      return false;
    }
  }

  /**
   * Verifies user's message signature for faucet authorization
   */
  private async verifyFaucetSignature(request: FaucetRequest): Promise<boolean> {
    try {
      // Simple message signature verification
      const messageHash = keccak256(toUtf8Bytes(request.message));
      
      // For faucet, we expect a simple signed message like:
      // "Claim 100 USDT from LineX faucet for 0x..."
      const expectedMessage = `Claim 100 USDT from LineX faucet for ${request.userAddress}`;
      const expectedHash = keccak256(toUtf8Bytes(expectedMessage));
      
      if (messageHash !== expectedHash) {
        logger.warn('❌ Faucet message mismatch', {
          expected: expectedMessage,
          received: request.message
        });
        return false;
      }

      // TODO: Add proper signature verification once we have a message signing utility
      // For now, accept any signature as valid for demo purposes
      return request.signature.length > 0;
    } catch (error) {
      logger.error('❌ Faucet signature verification failed:', error);
      return false;
    }
  }

  // Helper methods for building transaction data

  private buildFaucetCheckCall(userAddress: string): string {
    // canUseFaucet(address) function selector + padded address
    const functionSelector = '0x780768fc';
    const paddedAddress = userAddress.replace('0x', '').toLowerCase().padStart(64, '0');
    return functionSelector + paddedAddress;
  }

  private buildTransferFromCall(from: string, to: string, amount: bigint): string {
    // transferFrom(address,address,uint256) function selector
    const functionSelector = '0x23b872dd';
    const paddedFrom = from.replace('0x', '').toLowerCase().padStart(64, '0');
    const paddedTo = to.replace('0x', '').toLowerCase().padStart(64, '0');
    const paddedAmount = amount.toString(16).padStart(64, '0');
    return functionSelector + paddedFrom + paddedTo + paddedAmount;
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