/**
 * Wallet Service
 * 
 * Simplified address-based wallet management for user-authorized gasless transfers.
 * No DappPortal dependency - all authorization handled via frontend signatures.
 * 
 * Features:
 * - Address-based user lookup and management
 * - Wallet balance queries
 * - User transfer history
 * - Simple wallet address validation
 */

import { redisService } from '../redis/redisService';
import { simpleContractService } from '../blockchain';
import { feeDelegationService } from '../blockchain/feeDelegationService';
import { FaucetRequest, GaslessTransactionResult, User } from '../../types';
import logger from '../../utils/logger';

export class WalletService {
  /**
   * Get user by wallet address
   */
  async getUser(address: string): Promise<User | null> {
    try {
      const userKey = `user:${address.toLowerCase()}`;
      return await redisService.getJson<User>(userKey);
    } catch (error) {
      logger.error('❌ Failed to get user by address:', { address, error });
      return null;
    }
  }

  /**
   * Get wallet balance for a user
   */
  async getWalletBalance(address: string): Promise<{
    success: boolean;
    balance?: { usdt: number; kaia: number };
    error?: string;
  }> {
    try {
      if (!this.isValidAddress(address)) {
        return {
          success: false,
          error: 'Invalid wallet address format',
        };
      }

      const balanceResult = await simpleContractService.getBalance(address);
      if (!balanceResult.success) {
        return {
          success: false,
          error: 'Failed to fetch wallet balance',
        };
      }

      return {
        success: true,
        balance: balanceResult.data,
      };
    } catch (error) {
      logger.error('❌ Failed to get wallet balance:', { address, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute user-authorized faucet claim
   */
  async claimFaucet(request: FaucetRequest): Promise<GaslessTransactionResult> {
    try {
      if (!this.isValidAddress(request.userAddress)) {
        return {
          success: false,
          error: 'Invalid wallet address format',
        };
      }

      // Execute authorized faucet claim
      const result = await feeDelegationService.executeAuthorizedFaucetClaim(request);

      logger.info('🚰 Faucet claim processed', {
        userAddress: request.userAddress,
        success: result.success,
        transactionHash: result.transactionHash,
      });

      return result;
    } catch (error) {
      logger.error('❌ Failed to process faucet claim:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get user's transfer history
   */
  async getUserTransfers(address: string, limit: number = 10): Promise<any[]> {
    try {
      // Import transfer service to avoid circular dependency
      const { transferService } = await import('../transfer/transferService');
      return await transferService.getUserTransfers(address, limit);
    } catch (error) {
      logger.error('❌ Failed to get user transfers:', { address, error });
      return [];
    }
  }

  /**
   * Validate wallet address format
   */
  private isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }
}

// Export singleton instance
export const walletService = new WalletService();
export default walletService;