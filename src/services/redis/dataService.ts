import { redisClient } from './client';
import { User, Wallet, Transfer, Quote, SigningSession, UserSession } from '../../types';
import logger from '../../utils/logger';

export class RedisDataService {
  private static readonly TTL = {
    QUOTE: 5 * 60, // 5 minutes
    SESSION: 12 * 60 * 60, // 12 hours
    SIGNING_SESSION: 30 * 60, // 30 minutes
  };

  // User operations
  async createUser(user: User): Promise<void> {
    const key = this.getUserKey(user.lineUserId);
    await redisClient.set(key, user);
    logger.info(`Created user: ${user.lineUserId}`);
  }

  async getUser(lineUserId: string): Promise<User | null> {
    const key = this.getUserKey(lineUserId);
    return await redisClient.get<User>(key);
  }

  async updateUser(lineUserId: string, updates: Partial<User>): Promise<User | null> {
    const existingUser = await this.getUser(lineUserId);
    if (!existingUser) {
      logger.warn(`User not found for update: ${lineUserId}`);
      return null;
    }

    const updatedUser: User = {
      ...existingUser,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.createUser(updatedUser);
    return updatedUser;
  }

  // Wallet operations
  async createWallet(wallet: Wallet): Promise<void> {
    const key = this.getWalletKey(wallet.address);
    await redisClient.set(key, wallet);
    logger.info(`Created wallet: ${wallet.address} for user: ${wallet.lineUserId}`);
  }

  async getWallet(address: string): Promise<Wallet | null> {
    const key = this.getWalletKey(address);
    return await redisClient.get<Wallet>(key);
  }

  async getWalletByUser(lineUserId: string): Promise<Wallet | null> {
    const user = await this.getUser(lineUserId);
    if (!user?.walletAddress) return null;
    return await this.getWallet(user.walletAddress);
  }

  // Quote operations
  async createQuote(quote: Quote): Promise<void> {
    const key = this.getQuoteKey(quote.id);
    await redisClient.set(key, quote, RedisDataService.TTL.QUOTE);
    logger.info(`Created quote: ${quote.id}`);
  }

  async getQuote(quoteId: string): Promise<Quote | null> {
    const key = this.getQuoteKey(quoteId);
    return await redisClient.get<Quote>(key);
  }

  async deleteQuote(quoteId: string): Promise<boolean> {
    const key = this.getQuoteKey(quoteId);
    return await redisClient.del(key);
  }

  // Transfer operations
  async createTransfer(transfer: Transfer): Promise<void> {
    const key = this.getTransferKey(transfer.id);
    await redisClient.set(key, transfer);
    logger.info(`Created transfer: ${transfer.id}`);
  }

  async getTransfer(transferId: string): Promise<Transfer | null> {
    const key = this.getTransferKey(transferId);
    return await redisClient.get<Transfer>(key);
  }

  async updateTransfer(transferId: string, updates: Partial<Transfer>): Promise<Transfer | null> {
    const existingTransfer = await this.getTransfer(transferId);
    if (!existingTransfer) {
      logger.warn(`Transfer not found for update: ${transferId}`);
      return null;
    }

    const updatedTransfer: Transfer = {
      ...existingTransfer,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.createTransfer(updatedTransfer);
    logger.info(`Updated transfer: ${transferId} status: ${updatedTransfer.status}`);
    return updatedTransfer;
  }

  async getTransfersByUser(lineUserId: string): Promise<Transfer[]> {
    const keys = await redisClient.keys(this.getTransferKey('*'));
    const transfers: Transfer[] = [];

    for (const key of keys) {
      const transfer = await redisClient.get<Transfer>(key);
      if (transfer && transfer.senderLineUserId === lineUserId) {
        transfers.push(transfer);
      }
    }

    return transfers.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  // Signing Session operations
  async createSigningSession(session: SigningSession): Promise<void> {
    const key = this.getSigningSessionKey(session.id);
    await redisClient.set(key, session, RedisDataService.TTL.SIGNING_SESSION);
    logger.info(`Created signing session: ${session.id}`);
  }

  async getSigningSession(sessionId: string): Promise<SigningSession | null> {
    const key = this.getSigningSessionKey(sessionId);
    return await redisClient.get<SigningSession>(key);
  }

  async updateSigningSession(sessionId: string, updates: Partial<SigningSession>): Promise<SigningSession | null> {
    const existingSession = await this.getSigningSession(sessionId);
    if (!existingSession) {
      logger.warn(`Signing session not found for update: ${sessionId}`);
      return null;
    }

    const updatedSession: SigningSession = {
      ...existingSession,
      ...updates,
    };

    await this.createSigningSession(updatedSession);
    return updatedSession;
  }

  async deleteSigningSession(sessionId: string): Promise<boolean> {
    const key = this.getSigningSessionKey(sessionId);
    return await redisClient.del(key);
  }

  // User Session operations
  async createUserSession(session: UserSession): Promise<void> {
    const key = this.getUserSessionKey(session.token);
    await redisClient.set(key, session, RedisDataService.TTL.SESSION);
    logger.info(`Created user session for: ${session.lineUserId}`);
  }

  async getUserSession(token: string): Promise<UserSession | null> {
    const key = this.getUserSessionKey(token);
    return await redisClient.get<UserSession>(key);
  }

  async deleteUserSession(token: string): Promise<boolean> {
    const key = this.getUserSessionKey(token);
    return await redisClient.del(key);
  }

  // Health check
  async healthCheck(): Promise<{ status: string; latency: number }> {
    const start = Date.now();
    const isHealthy = await redisClient.ping();
    const latency = Date.now() - start;

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      latency,
    };
  }

  // Cleanup operations
  async cleanupExpiredData(): Promise<void> {
    try {
      // This is handled automatically by Redis TTL, but we can implement
      // custom cleanup logic here if needed
      logger.info('Cleanup completed (Redis TTL handles automatic expiration)');
    } catch (error) {
      logger.error('Error during cleanup:', error);
    }
  }

  // Key generation methods
  private getUserKey(lineUserId: string): string {
    return `user:${lineUserId}`;
  }

  private getWalletKey(address: string): string {
    return `wallet:${address}`;
  }

  private getTransferKey(transferId: string): string {
    return `transfer:${transferId}`;
  }

  private getQuoteKey(quoteId: string): string {
    return `quote:${quoteId}`;
  }

  private getSigningSessionKey(sessionId: string): string {
    return `signing:${sessionId}`;
  }

  private getUserSessionKey(token: string): string {
    return `session:${token}`;
  }
}

// Export singleton instance
export const dataService = new RedisDataService();
export default dataService;