/**
 * Transfer Service
 * 
 * Orchestrates end-to-end cross-border remittance transfers using state machine pattern.
 * Integrates quotes, wallet management, and blockchain operations for seamless transfers.
 * 
 * State Flow:
 * PENDING → QUOTE_VALIDATED → SIGNING → PROCESSING → COMPLETED/FAILED
 * 
 * Features:
 * - State machine-driven transfer orchestration
 * - Quote validation and integration
 * - Wallet service integration for signing
 * - Blockchain execution with gasless options
 * - Comprehensive status tracking and error handling
 */

import { randomUUID } from 'crypto';
import { redisService } from '../redis/redisService';
import { quoteService } from '../quote';
import { walletService } from '../wallet';
import { feeDelegationService } from '../blockchain';
import logger from '../../utils/logger';

export type TransferStatus = 
  | 'PENDING'           // Transfer created, awaiting validation
  | 'QUOTE_VALIDATED'   // Quote validated, ready for signing
  | 'SIGNING'           // User signing transaction
  | 'PROCESSING'        // Transaction being processed on blockchain
  | 'COMPLETED'         // Transfer completed successfully
  | 'FAILED'            // Transfer failed
  | 'EXPIRED'           // Transfer expired
  | 'CANCELLED';        // Transfer cancelled by user

export interface TransferParticipant {
  lineUserId: string;
  walletAddress?: string;
  name?: string;
  country: string;
}

export interface TransferRequest {
  quoteId: string;
  sender: TransferParticipant;
  recipient: TransferParticipant;
  gasless?: boolean;
  metadata?: Record<string, any>;
}

export interface Transfer {
  id: string;
  quoteId: string;
  status: TransferStatus;
  
  // Participants
  sender: TransferParticipant;
  recipient: TransferParticipant;
  
  // Financial details (from quote)
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  toAmount: number;
  exchangeRate: number;
  platformFeeAmount: number;
  totalCost: number;
  
  // Execution details
  gasless: boolean;
  signingSessionId?: string;
  transactionHash?: string;
  
  // Timing
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  completedAt?: Date;
  
  // Error handling
  error?: string;
  retryCount: number;
  
  // Metadata
  metadata?: Record<string, any>;
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
   * Create a new transfer from a validated quote
   */
  async createTransfer(request: TransferRequest): Promise<TransferResult> {
    try {
      // Validate the quote first
      const quoteValidation = await quoteService.validateQuote(request.quoteId);
      if (!quoteValidation.isValid || !quoteValidation.quote) {
        return {
          success: false,
          error: quoteValidation.error || 'Invalid quote',
        };
      }

      const quote = quoteValidation.quote;

      // Validate request
      const validation = this.validateTransferRequest(request);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.error,
        };
      }

      // Ensure sender has a connected wallet
      const senderWallet = await walletService.getUserWallet(request.sender.lineUserId);
      if (!senderWallet) {
        return {
          success: false,
          error: 'Sender wallet not connected. Please connect your wallet first.',
        };
      }

      // Ensure recipient has a connected wallet
      const recipientWallet = await walletService.getUserWallet(request.recipient.lineUserId);
      if (!recipientWallet) {
        return {
          success: false,
          error: 'Recipient wallet not connected. Please ask recipient to connect their wallet first.',
        };
      }

      // Create transfer object
      const transfer: Transfer = {
        id: randomUUID(),
        quoteId: request.quoteId,
        status: 'PENDING',
        
        sender: {
          ...request.sender,
          walletAddress: senderWallet.address,
        },
        recipient: {
          ...request.recipient,
          walletAddress: recipientWallet.address,
        },
        
        // Copy financial details from quote
        fromCurrency: quote.fromCurrency,
        toCurrency: quote.toCurrency,
        fromAmount: quote.fromAmount,
        toAmount: quote.toAmount,
        exchangeRate: quote.exchangeRate,
        platformFeeAmount: quote.platformFeeAmount,
        totalCost: quote.totalCost,
        
        gasless: request.gasless || true, // Default to gasless
        
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + this.TRANSFER_TTL * 1000),
        
        retryCount: 0,
        metadata: request.metadata,
      };

      // Store transfer
      await this.storeTransfer(transfer);

      // Move to quote validated state
      await this.updateTransferStatus(transfer.id, 'QUOTE_VALIDATED');

      logger.info('✅ Transfer created successfully', {
        transferId: transfer.id,
        quoteId: transfer.quoteId,
        fromAmount: transfer.fromAmount,
        fromCurrency: transfer.fromCurrency,
        toAmount: transfer.toAmount,
        toCurrency: transfer.toCurrency,
        senderUserId: transfer.sender.lineUserId,
        gasless: transfer.gasless,
      });

      return {
        success: true,
        transfer: transfer || undefined,
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
   * Execute the transfer (initiate signing process)
   */
  async executeTransfer(transferId: string): Promise<TransferResult> {
    try {
      const transfer = await this.getTransfer(transferId);
      if (!transfer) {
        return {
          success: false,
          error: 'Transfer not found',
        };
      }

      if (transfer.status !== 'QUOTE_VALIDATED') {
        return {
          success: false,
          error: `Cannot execute transfer in status: ${transfer.status}`,
        };
      }

      // Update status to signing
      await this.updateTransferStatus(transferId, 'SIGNING');

      if (transfer.gasless) {
        // For gasless transfers, execute directly using fee delegation
        return await this.executeGaslessTransfer(transfer);
      } else {
        // For regular transfers, create signing session
        return await this.createSigningSession(transfer);
      }
    } catch (error) {
      logger.error('❌ Failed to execute transfer:', { transferId, error });
      await this.updateTransferStatus(transferId, 'FAILED', error instanceof Error ? error.message : 'Unknown error');
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle signing completion (webhook callback)
   */
  async handleSigningCompletion(signingSessionId: string, success: boolean, transactionHash?: string, error?: string): Promise<void> {
    try {
      // Find transfer by signing session ID
      const transfer = await this.findTransferBySigningSession(signingSessionId);
      if (!transfer) {
        logger.warn('Transfer not found for signing session', { signingSessionId });
        return;
      }

      if (success && transactionHash) {
        // Mark as processing, then completed
        transfer.transactionHash = transactionHash;
        transfer.completedAt = new Date();
        await this.updateTransferStatus(transfer.id, 'PROCESSING');
        await this.updateTransferStatus(transfer.id, 'COMPLETED');

        // Invalidate the quote
        await quoteService.invalidateQuote(transfer.quoteId);

        logger.info('✅ Transfer completed via signing', {
          transferId: transfer.id,
          transactionHash,
          signingSessionId,
        });
      } else {
        // Mark as failed
        await this.updateTransferStatus(transfer.id, 'FAILED', error || 'Signing failed');

        logger.error('❌ Transfer failed during signing', {
          transferId: transfer.id,
          signingSessionId,
          error,
        });
      }
    } catch (error) {
      logger.error('❌ Failed to handle signing completion:', { signingSessionId, error });
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
        // Check if transfer has expired
        if (new Date() > new Date(transfer.expiresAt) && !['COMPLETED', 'FAILED', 'CANCELLED'].includes(transfer.status)) {
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
   * Get transfers for a user
   */
  async getUserTransfers(lineUserId: string, limit: number = 10): Promise<Transfer[]> {
    try {
      const transferKeys = await redisService.keys(`${this.TRANSFER_KEY_PREFIX}*`);
      const transfers: Transfer[] = [];

      for (const key of transferKeys) {
        const transfer = await redisService.getJson<Transfer>(key);
        if (transfer && transfer.sender.lineUserId === lineUserId) {
          transfers.push(transfer);
        }
      }

      // Sort by creation date (newest first) and limit
      return transfers
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit);
    } catch (error) {
      logger.error('❌ Failed to get user transfers:', { lineUserId, error });
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
      if (!['PENDING', 'QUOTE_VALIDATED', 'SIGNING'].includes(transfer.status)) {
        return {
          success: false,
          error: `Cannot cancel transfer in status: ${transfer.status}`,
        };
      }

      await this.updateTransferStatus(transferId, 'CANCELLED', reason);

      logger.info('🚫 Transfer cancelled', {
        transferId,
        reason,
        previousStatus: transfer.status,
      });

      const updatedTransfer = await this.getTransfer(transferId);
      return {
        success: true,
        transfer: updatedTransfer || undefined,
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

  private async executeGaslessTransfer(transfer: Transfer): Promise<TransferResult> {
    try {
      // Execute gasless transfer from sender to recipient
      const result = await feeDelegationService.executeGaslessTransfer(
        transfer.sender.walletAddress!,
        transfer.recipient.walletAddress!,
        transfer.fromAmount
      );

      if (result.success) {
        transfer.transactionHash = result.transactionHash;
        transfer.completedAt = new Date();
        await this.updateTransferStatus(transfer.id, 'PROCESSING');
        await this.updateTransferStatus(transfer.id, 'COMPLETED');

        // Invalidate the quote
        await quoteService.invalidateQuote(transfer.quoteId);

        logger.info('✅ Gasless transfer completed', {
          transferId: transfer.id,
          transactionHash: result.transactionHash,
          gasUsed: result.gasUsed?.toString(),
          cost: result.cost,
        });

        return {
          success: true,
          transfer,
        };
      } else {
        await this.updateTransferStatus(transfer.id, 'FAILED', result.error);
        return {
          success: false,
          error: result.error,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.updateTransferStatus(transfer.id, 'FAILED', errorMessage);
      throw error;
    }
  }

  private async createSigningSession(transfer: Transfer): Promise<TransferResult> {
    try {
      // Create signing session for regular (non-gasless) transfer
      const signingResult = await walletService.createTransferSigningSession(
        {
          from: transfer.sender.walletAddress!,
          to: transfer.recipient.walletAddress!,
          amount: transfer.fromAmount,
          gasless: false,
        },
        transfer.sender.lineUserId
      );

      if (signingResult.success) {
        transfer.signingSessionId = signingResult.sessionId;
        await this.storeTransfer(transfer);

        logger.info('📝 Signing session created for transfer', {
          transferId: transfer.id,
          signingSessionId: signingResult.sessionId,
          signingUrl: signingResult.signingUrl,
        });

        return {
          success: true,
          transfer,
        };
      } else {
        await this.updateTransferStatus(transfer.id, 'FAILED', signingResult.error);
        return {
          success: false,
          error: signingResult.error,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.updateTransferStatus(transfer.id, 'FAILED', errorMessage);
      throw error;
    }
  }

  private async findTransferBySigningSession(signingSessionId: string): Promise<Transfer | null> {
    try {
      const transferKeys = await redisService.keys(`${this.TRANSFER_KEY_PREFIX}*`);
      
      for (const key of transferKeys) {
        const transfer = await redisService.getJson<Transfer>(key);
        if (transfer && transfer.signingSessionId === signingSessionId) {
          return transfer;
        }
      }

      return null;
    } catch (error) {
      logger.error('❌ Failed to find transfer by signing session:', { signingSessionId, error });
      return null;
    }
  }

  private validateTransferRequest(request: TransferRequest): {
    isValid: boolean;
    error?: string;
  } {
    if (!request.sender?.lineUserId) {
      return {
        isValid: false,
        error: 'Sender LINE user ID is required',
      };
    }

    if (!request.recipient?.lineUserId) {
      return {
        isValid: false,
        error: 'Recipient LINE user ID is required',
      };
    }

    if (!request.recipient?.country) {
      return {
        isValid: false,
        error: 'Recipient country is required',
      };
    }

    if (!request.sender?.country) {
      return {
        isValid: false,
        error: 'Sender country is required',
      };
    }

    // Validate country codes (simple validation)
    const supportedCountries = ['KR', 'PH', 'US']; // Korea, Philippines, US
    if (!supportedCountries.includes(request.sender.country)) {
      return {
        isValid: false,
        error: 'Sender country not supported',
      };
    }

    if (!supportedCountries.includes(request.recipient.country)) {
      return {
        isValid: false,
        error: 'Recipient country not supported',
      };
    }

    return { isValid: true };
  }

  private async updateTransferStatus(transferId: string, status: TransferStatus, error?: string): Promise<void> {
    try {
      const transfer = await this.getTransfer(transferId);
      if (transfer) {
        transfer.status = status;
        transfer.updatedAt = new Date();
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
}

// Export singleton instance
export const transferService = new TransferService();
export default transferService;