/**
 * Transfer Service
 * 
 * Orchestrates user-authorized gasless cross-border remittance transfers.
 * Integrates anonymous quotes and secure user authorization with blockchain execution.
 * 
 * Features:
 * - User-authorized gasless transfers with EIP-712 signatures
 * - Anonymous quote integration
 * - Address-based user management (implicit user creation)
 * - Secure transfer execution with user fund control
 * - Comprehensive status tracking and error handling
 */

import { randomUUID } from 'crypto';
import { redisService } from '../redis/redisService';
import { quoteService } from '../quote';
import { feeDelegationService } from '../blockchain';
import { Transfer, TransferStatus, AuthorizedTransferRequest, GaslessTransactionResult } from '../../types';
import logger from '../../utils/logger';

export interface CreateTransferRequest {
  quoteId: string;
  from: string;         // Sender wallet address
  to: string;           // Recipient wallet address
  signature: string;    // User's EIP-712 authorization signature
  nonce: number;
  deadline: number;
  senderRawTransaction?: string; // User's signed raw transaction for fee delegation
}

export interface TransferResult {
  success: boolean;
  transfer?: Transfer;
  error?: string;
}

export class TransferService {
  private readonly TRANSFER_TTL = 24 * 60 * 60; // 24 hours
  private readonly TRANSFER_KEY_PREFIX = 'transfer:';
  private readonly MAX_RETRY_COUNT = 3;

  /**
   * Create and execute a user-authorized gasless transfer
   */
  async createTransfer(request: CreateTransferRequest): Promise<TransferResult> {
    try {
      // 1. Validate the quote
      const quote = await quoteService.getQuote(request.quoteId);
      if (!quote || !quote.isValid) {
        return {
          success: false,
          error: 'Quote not found or expired',
        };
      }

      // 2. Validate addresses
      if (!this.isValidAddress(request.from) || !this.isValidAddress(request.to)) {
        return {
          success: false,
          error: 'Invalid wallet address format',
        };
      }

      // 3. Create users implicitly if they don't exist
      await this.ensureUserExists(request.from);
      await this.ensureUserExists(request.to);

      // 4. Create transfer record
      const transfer: Transfer = {
        id: randomUUID(),
        quoteId: request.quoteId,
        status: 'PENDING',
        
        senderAddress: request.from.toLowerCase(),
        recipientAddress: request.to.toLowerCase(),
        
        // Copy financial details from quote
        fromCurrency: quote.fromCurrency,
        toCurrency: quote.toCurrency,
        fromAmount: quote.fromAmount,
        toAmount: quote.toAmount,
        exchangeRate: quote.exchangeRate,
        platformFeeAmount: quote.platformFeeAmount,
        
        // Authorization details
        signature: request.signature,
        nonce: request.nonce,
        deadline: request.deadline,
        
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // 5. Store transfer
      await this.storeTransfer(transfer);

      // 6. Execute authorized gasless transfer immediately
      await this.updateTransferStatus(transfer.id, 'PROCESSING');

      const authRequest: AuthorizedTransferRequest = {
        from: request.from,
        to: request.to,
        amount: quote.toAmount, // Use destination amount
        signature: request.signature,
        nonce: request.nonce,
        deadline: request.deadline,
      };

      const result = await feeDelegationService.executeFeeDelegatedTransaction(request.senderRawTransaction || '');

      if (result.success) {
        // Update transfer with transaction hash
        transfer.transactionHash = result.transactionHash;
        transfer.status = 'COMPLETED';
        transfer.completedAt = new Date().toISOString();
        transfer.updatedAt = new Date().toISOString();
      } else {
        transfer.status = 'FAILED';
        transfer.error = result.error;
        transfer.updatedAt = new Date().toISOString();
      }

      await this.storeTransfer(transfer);

      logger.info('✅ User-authorized transfer processed', {
        transferId: transfer.id,
        senderAddress: transfer.senderAddress,
        recipientAddress: transfer.recipientAddress,
        amount: transfer.toAmount,
        status: transfer.status,
        transactionHash: transfer.transactionHash,
      });

      return {
        success: result.success,
        transfer,
        error: result.error,
      };
    } catch (error) {
      logger.error('❌ Failed to create transfer:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get transfer by ID
   */
  async getTransfer(transferId: string): Promise<Transfer | null> {
    try {
      const transferKey = `${this.TRANSFER_KEY_PREFIX}${transferId}`;
      const transfer = await redisService.getJson<Transfer>(transferKey);
      
      if (transfer) {
        // Check if transfer has expired (if it has a deadline)
        if (transfer.deadline && Date.now() / 1000 > transfer.deadline && !['COMPLETED', 'FAILED'].includes(transfer.status)) {
          transfer.status = 'EXPIRED';
          await this.storeTransfer(transfer);
          logger.info('⏰ Transfer expired', { transferId });
        }
      }

      return transfer;
    } catch (error) {
      logger.error('❌ Failed to get transfer:', { transferId, error });
      return null;
    }
  }

  /**
   * Get transfers by user address
   */
  async getUserTransfers(address: string, limit: number = 10): Promise<Transfer[]> {
    try {
      const keys = await redisService.keys(`${this.TRANSFER_KEY_PREFIX}*`);
      const transfers: Transfer[] = [];

      for (const key of keys) {
        const transfer = await redisService.getJson<Transfer>(key);
        if (transfer && (transfer.senderAddress === address.toLowerCase() || transfer.recipientAddress === address.toLowerCase())) {
          transfers.push(transfer);
        }
      }

      // Sort by creation date (newest first) and limit
      return transfers
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit);
    } catch (error) {
      logger.error('❌ Failed to get user transfers:', { address, error });
      return [];
    }
  }

  /**
   * Cancel a transfer (if possible)
   */
  async cancelTransfer(transferId: string, reason?: string): Promise<TransferResult> {
    try {
      const transfer = await this.getTransfer(transferId);
      if (!transfer) {
        return {
          success: false,
          error: 'Transfer not found',
        };
      }

      // Can only cancel transfers that haven't started processing
      if (!['PENDING'].includes(transfer.status)) {
        return {
          success: false,
          error: `Cannot cancel transfer in status: ${transfer.status}`,
        };
      }

      transfer.status = 'FAILED';
      transfer.error = reason || 'Cancelled by user';
      transfer.updatedAt = new Date().toISOString();
      await this.storeTransfer(transfer);

      logger.info('🚫 Transfer cancelled', {
        transferId,
        reason,
        previousStatus: transfer.status,
      });

      return {
        success: true,
        transfer,
      };
    } catch (error) {
      logger.error('❌ Failed to cancel transfer:', { transferId, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Private helper methods

  private async updateTransferStatus(transferId: string, status: TransferStatus, error?: string): Promise<void> {
    try {
      const transfer = await this.getTransfer(transferId);
      if (transfer) {
        transfer.status = status;
        transfer.updatedAt = new Date().toISOString();
        if (error) {
          transfer.error = error;
        }
        await this.storeTransfer(transfer);

        logger.info('📊 Transfer status updated', {
          transferId,
          status,
          error,
        });
      }
    } catch (error) {
      logger.error('❌ Failed to update transfer status:', { transferId, status, error });
    }
  }

  private async storeTransfer(transfer: Transfer): Promise<void> {
    const transferKey = `${this.TRANSFER_KEY_PREFIX}${transfer.id}`;
    await redisService.setJson(transferKey, transfer, this.TRANSFER_TTL);
  }

  /**
   * Helper method to validate wallet address format
   */
  private isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Ensure a user exists (create implicitly if needed)
   */
  private async ensureUserExists(address: string): Promise<void> {
    try {
      const userKey = `user:${address.toLowerCase()}`;
      const exists = await redisService.exists(userKey);
      
      if (!exists) {
        const user = {
          walletAddress: address.toLowerCase(),
          firstTransferAt: new Date().toISOString(),
          lastTransferAt: new Date().toISOString(),
          transferCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        await redisService.setJson(userKey, user);
        
        logger.info('👤 User created implicitly', {
          address: address.toLowerCase(),
        });
      } else {
        // Update last transfer time for existing user
        const user = await redisService.getJson<any>(userKey);
        if (user) {
          user.lastTransferAt = new Date().toISOString();
          user.transferCount = (user.transferCount || 0) + 1;
          user.updatedAt = new Date().toISOString();
          await redisService.setJson(userKey, user);
        }
      }
    } catch (error) {
      logger.error('❌ Failed to ensure user exists:', { address, error });
      throw error;
    }
  }
}

// Export singleton instance
export const transferService = new TransferService();
export default transferService;