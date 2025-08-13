/**
 * Wallet Service
 * 
 * Manages wallet operations using DappPortal Mini Dapp SDK integration.
 * Provides secure transaction signing without storing private keys.
 * 
 * Features:
 * - DappPortal SDK integration for transaction signing
 * - Signing session management with Redis storage
 * - Webhook-based transaction completion handling
 * - Support for Kaia blockchain transactions
 */

import { randomUUID } from 'crypto';
import { redisService } from '../redis/redisService';
import { feeDelegationService } from '../blockchain/feeDelegationService';
import { CONTRACT_CONSTANTS } from '../../types/contracts';
import logger from '../../utils/logger';
import config from '../../config';

export interface WalletAddress {
  address: string;
  lineUserId: string;
  createdAt: Date;
  lastUsed: Date;
}

export interface SigningSession {
  sessionId: string;
  lineUserId: string;
  walletAddress: string;
  transactionType: 'faucet' | 'transfer' | 'approve';
  transactionData: any;
  status: 'pending' | 'signed' | 'completed' | 'failed' | 'expired';
  createdAt: Date;
  expiresAt: Date;
  signingUrl?: string;
  transactionHash?: string;
  error?: string;
}

export interface TransferRequest {
  from: string;
  to: string;
  amount: number; // USDT amount
  gasless?: boolean;
}

export interface FaucetRequest {
  userAddress: string;
  gasless?: boolean;
}

export interface SigningResult {
  success: boolean;
  sessionId: string;
  signingUrl?: string;
  error?: string;
}

export class WalletService {
  private readonly SIGNING_SESSION_TTL = 30 * 60; // 30 minutes
  private readonly WALLET_KEY_PREFIX = 'wallet:';
  private readonly SIGNING_SESSION_PREFIX = 'signing:';

  /**
   * Connect a wallet address to a LINE user
   */
  async connectWallet(lineUserId: string, walletAddress: string): Promise<{
    success: boolean;
    wallet?: WalletAddress;
    error?: string;
  }> {
    try {
      // Validate wallet address format
      if (!this.isValidAddress(walletAddress)) {
        return {
          success: false,
          error: 'Invalid wallet address format',
        };
      }

      const wallet: WalletAddress = {
        address: walletAddress.toLowerCase(),
        lineUserId,
        createdAt: new Date(),
        lastUsed: new Date(),
      };

      // Store wallet info in Redis
      const walletKey = `${this.WALLET_KEY_PREFIX}${walletAddress.toLowerCase()}`;
      const userWalletKey = `user:${lineUserId}:wallet`;

      await Promise.all([
        redisService.setJson(walletKey, wallet),
        redisService.setJson(userWalletKey, wallet),
      ]);

      logger.info('✅ Wallet connected successfully', {
        lineUserId,
        walletAddress: wallet.address,
      });

      return {
        success: true,
        wallet,
      };
    } catch (error) {
      logger.error('❌ Failed to connect wallet:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get wallet information for a LINE user
   */
  async getUserWallet(lineUserId: string): Promise<WalletAddress | null> {
    try {
      const userWalletKey = `user:${lineUserId}:wallet`;
      const wallet = await redisService.getJson<WalletAddress>(userWalletKey);
      
      if (wallet) {
        // Update last used timestamp
        wallet.lastUsed = new Date();
        await redisService.setJson(userWalletKey, wallet);
      }

      return wallet;
    } catch (error) {
      logger.error('❌ Failed to get user wallet:', error);
      return null;
    }
  }

  /**
   * Create a signing session for faucet claim
   */
  async createFaucetSigningSession(request: FaucetRequest, lineUserId: string): Promise<SigningResult> {
    try {
      const sessionId = randomUUID();

      // If gasless is requested, use fee delegation service directly
      if (request.gasless) {
        const result = await feeDelegationService.executeGaslessFaucetClaim({
          userAddress: request.userAddress,
        });

        if (result.success) {
          logger.info('✅ Gasless faucet claim completed', {
            lineUserId,
            userAddress: request.userAddress,
            transactionHash: result.transactionHash,
          });

          return {
            success: true,
            sessionId,
            // For gasless transactions, we return success immediately
          };
        } else {
          return {
            success: false,
            sessionId,
            error: result.error,
          };
        }
      }

      // For non-gasless transactions, create signing session
      const session: SigningSession = {
        sessionId,
        lineUserId,
        walletAddress: request.userAddress,
        transactionType: 'faucet',
        transactionData: {
          to: CONTRACT_CONSTANTS.ADDRESS,
          data: '0xde5f72fd', // faucet() function selector
          gasLimit: 100000,
        },
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.SIGNING_SESSION_TTL * 1000),
      };

      // Store signing session in Redis with TTL
      const sessionKey = `${this.SIGNING_SESSION_PREFIX}${sessionId}`;
      await redisService.setJson(sessionKey, session, this.SIGNING_SESSION_TTL);

      // Generate signing URL (this would integrate with DappPortal SDK)
      const signingUrl = this.generateSigningUrl(sessionId, session.transactionData);
      session.signingUrl = signingUrl;

      await redisService.setJson(sessionKey, session, this.SIGNING_SESSION_TTL);

      logger.info('📝 Faucet signing session created', {
        sessionId,
        lineUserId,
        userAddress: request.userAddress,
        gasless: request.gasless,
      });

      return {
        success: true,
        sessionId,
        signingUrl,
      };
    } catch (error) {
      logger.error('❌ Failed to create faucet signing session:', error);
      return {
        success: false,
        sessionId: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create a signing session for token transfer
   */
  async createTransferSigningSession(request: TransferRequest, lineUserId: string): Promise<SigningResult> {
    try {
      const sessionId = randomUUID();

      // If gasless is requested, use fee delegation service directly
      if (request.gasless) {
        const result = await feeDelegationService.executeGaslessTransfer(
          request.from,
          request.to,
          request.amount
        );

        if (result.success) {
          logger.info('✅ Gasless transfer completed', {
            lineUserId,
            from: request.from,
            to: request.to,
            amount: request.amount,
            transactionHash: result.transactionHash,
          });

          return {
            success: true,
            sessionId,
          };
        } else {
          return {
            success: false,
            sessionId,
            error: result.error,
          };
        }
      }

      // Convert amount to contract units (6 decimals for USDT)
      const amountInUnits = BigInt(request.amount * 10 ** CONTRACT_CONSTANTS.DECIMALS);
      const transferData = this.buildTransferData(request.to, amountInUnits);

      const session: SigningSession = {
        sessionId,
        lineUserId,
        walletAddress: request.from,
        transactionType: 'transfer',
        transactionData: {
          to: CONTRACT_CONSTANTS.ADDRESS,
          data: transferData,
          gasLimit: 150000,
        },
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.SIGNING_SESSION_TTL * 1000),
      };

      // Store signing session in Redis with TTL
      const sessionKey = `${this.SIGNING_SESSION_PREFIX}${sessionId}`;
      await redisService.setJson(sessionKey, session, this.SIGNING_SESSION_TTL);

      // Generate signing URL
      const signingUrl = this.generateSigningUrl(sessionId, session.transactionData);
      session.signingUrl = signingUrl;

      await redisService.setJson(sessionKey, session, this.SIGNING_SESSION_TTL);

      logger.info('📝 Transfer signing session created', {
        sessionId,
        lineUserId,
        from: request.from,
        to: request.to,
        amount: request.amount,
        gasless: request.gasless,
      });

      return {
        success: true,
        sessionId,
        signingUrl,
      };
    } catch (error) {
      logger.error('❌ Failed to create transfer signing session:', error);
      return {
        success: false,
        sessionId: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get signing session status
   */
  async getSigningSession(sessionId: string): Promise<SigningSession | null> {
    try {
      const sessionKey = `${this.SIGNING_SESSION_PREFIX}${sessionId}`;
      const session = await redisService.getJson<SigningSession>(sessionKey);
      
      if (session && new Date() > new Date(session.expiresAt)) {
        session.status = 'expired';
        await redisService.setJson(sessionKey, session, 60); // Keep expired session for 1 minute
      }

      return session;
    } catch (error) {
      logger.error('❌ Failed to get signing session:', error);
      return null;
    }
  }

  /**
   * Handle webhook callback from DappPortal when transaction is signed
   */
  async handleSigningWebhook(payload: {
    sessionId: string;
    transactionHash?: string;
    status: 'signed' | 'failed';
    error?: string;
  }): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const session = await this.getSigningSession(payload.sessionId);
      if (!session) {
        return {
          success: false,
          error: 'Signing session not found',
        };
      }

      session.status = payload.status === 'signed' ? 'completed' : 'failed';
      session.transactionHash = payload.transactionHash;
      session.error = payload.error;

      const sessionKey = `${this.SIGNING_SESSION_PREFIX}${payload.sessionId}`;
      await redisService.setJson(sessionKey, session, 3600); // Keep completed session for 1 hour

      logger.info('🔔 Signing webhook processed', {
        sessionId: payload.sessionId,
        status: session.status,
        transactionHash: session.transactionHash,
      });

      return { success: true };
    } catch (error) {
      logger.error('❌ Failed to handle signing webhook:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Helper methods

  private isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  private buildTransferData(to: string, amount: bigint): string {
    // transfer(address,uint256) function selector
    const functionSelector = '0xa9059cbb';
    const paddedTo = to.replace('0x', '').toLowerCase().padStart(64, '0');
    const paddedAmount = amount.toString(16).padStart(64, '0');
    return functionSelector + paddedTo + paddedAmount;
  }

  private generateSigningUrl(sessionId: string, transactionData: any): string {
    // In a real implementation, this would integrate with DappPortal SDK
    // For now, we'll create a mock URL structure
    const baseUrl = config.app.ngrokUrl || 'http://localhost:3000';
    const params = new URLSearchParams({
      sessionId,
      to: transactionData.to,
      data: transactionData.data,
      gasLimit: transactionData.gasLimit.toString(),
      callbackUrl: `${baseUrl}/api/v1/webhook/dappportal`,
    });

    return `https://dappportal.io/sign?${params.toString()}`;
  }
}

// Export singleton instance
export const walletService = new WalletService();
export default walletService;