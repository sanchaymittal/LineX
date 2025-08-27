"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transferService = exports.TransferService = void 0;
const crypto_1 = require("crypto");
const redisService_1 = require("../redis/redisService");
const quote_1 = require("../quote");
const blockchain_1 = require("../blockchain");
const logger_1 = __importDefault(require("../../utils/logger"));
class TransferService {
    constructor() {
        this.TRANSFER_TTL = 24 * 60 * 60;
        this.TRANSFER_KEY_PREFIX = 'transfer:';
        this.MAX_RETRY_COUNT = 3;
    }
    async createTransfer(request) {
        try {
            const quote = await quote_1.quoteService.getQuote(request.quoteId);
            if (!quote || !quote.isValid) {
                return {
                    success: false,
                    error: 'Quote not found or expired',
                };
            }
            if (!this.isValidAddress(request.from) || !this.isValidAddress(request.to)) {
                return {
                    success: false,
                    error: 'Invalid wallet address format',
                };
            }
            await this.ensureUserExists(request.from);
            await this.ensureUserExists(request.to);
            const transfer = {
                id: (0, crypto_1.randomUUID)(),
                quoteId: request.quoteId,
                status: 'PENDING',
                senderAddress: request.from.toLowerCase(),
                recipientAddress: request.to.toLowerCase(),
                fromCurrency: quote.fromCurrency,
                toCurrency: quote.toCurrency,
                fromAmount: quote.fromAmount,
                toAmount: quote.toAmount,
                exchangeRate: quote.exchangeRate,
                platformFeeAmount: quote.platformFeeAmount,
                signature: request.signature,
                nonce: request.nonce,
                deadline: request.deadline,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            await this.storeTransfer(transfer);
            await this.updateTransferStatus(transfer.id, 'PROCESSING');
            const authRequest = {
                from: request.from,
                to: request.to,
                amount: quote.toAmount,
                signature: request.signature,
                nonce: request.nonce,
                deadline: request.deadline,
            };
            const result = await blockchain_1.feeDelegationService.executeFeeDelegatedTransaction(request.senderRawTransaction || '');
            if (result.success) {
                transfer.transactionHash = result.transactionHash;
                transfer.status = 'COMPLETED';
                transfer.completedAt = new Date().toISOString();
                transfer.updatedAt = new Date().toISOString();
            }
            else {
                transfer.status = 'FAILED';
                transfer.error = result.error;
                transfer.updatedAt = new Date().toISOString();
            }
            await this.storeTransfer(transfer);
            logger_1.default.info('✅ User-authorized transfer processed', {
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
        }
        catch (error) {
            logger_1.default.error('❌ Failed to create transfer:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    async getTransfer(transferId) {
        try {
            const transferKey = `${this.TRANSFER_KEY_PREFIX}${transferId}`;
            const transfer = await redisService_1.redisService.getJson(transferKey);
            if (transfer) {
                if (transfer.deadline && Date.now() / 1000 > transfer.deadline && !['COMPLETED', 'FAILED'].includes(transfer.status)) {
                    transfer.status = 'EXPIRED';
                    await this.storeTransfer(transfer);
                    logger_1.default.info('⏰ Transfer expired', { transferId });
                }
            }
            return transfer;
        }
        catch (error) {
            logger_1.default.error('❌ Failed to get transfer:', { transferId, error });
            return null;
        }
    }
    async getUserTransfers(address, limit = 10) {
        try {
            const keys = await redisService_1.redisService.keys(`${this.TRANSFER_KEY_PREFIX}*`);
            const transfers = [];
            for (const key of keys) {
                const transfer = await redisService_1.redisService.getJson(key);
                if (transfer && (transfer.senderAddress === address.toLowerCase() || transfer.recipientAddress === address.toLowerCase())) {
                    transfers.push(transfer);
                }
            }
            return transfers
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, limit);
        }
        catch (error) {
            logger_1.default.error('❌ Failed to get user transfers:', { address, error });
            return [];
        }
    }
    async cancelTransfer(transferId, reason) {
        try {
            const transfer = await this.getTransfer(transferId);
            if (!transfer) {
                return {
                    success: false,
                    error: 'Transfer not found',
                };
            }
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
            logger_1.default.info('🚫 Transfer cancelled', {
                transferId,
                reason,
                previousStatus: transfer.status,
            });
            return {
                success: true,
                transfer,
            };
        }
        catch (error) {
            logger_1.default.error('❌ Failed to cancel transfer:', { transferId, error });
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    async updateTransferStatus(transferId, status, error) {
        try {
            const transfer = await this.getTransfer(transferId);
            if (transfer) {
                transfer.status = status;
                transfer.updatedAt = new Date().toISOString();
                if (error) {
                    transfer.error = error;
                }
                await this.storeTransfer(transfer);
                logger_1.default.info('📊 Transfer status updated', {
                    transferId,
                    status,
                    error,
                });
            }
        }
        catch (error) {
            logger_1.default.error('❌ Failed to update transfer status:', { transferId, status, error });
        }
    }
    async storeTransfer(transfer) {
        const transferKey = `${this.TRANSFER_KEY_PREFIX}${transfer.id}`;
        await redisService_1.redisService.setJson(transferKey, transfer, this.TRANSFER_TTL);
    }
    isValidAddress(address) {
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }
    async ensureUserExists(address) {
        try {
            const userKey = `user:${address.toLowerCase()}`;
            const exists = await redisService_1.redisService.exists(userKey);
            if (!exists) {
                const user = {
                    walletAddress: address.toLowerCase(),
                    firstTransferAt: new Date().toISOString(),
                    lastTransferAt: new Date().toISOString(),
                    transferCount: 0,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };
                await redisService_1.redisService.setJson(userKey, user);
                logger_1.default.info('👤 User created implicitly', {
                    address: address.toLowerCase(),
                });
            }
            else {
                const user = await redisService_1.redisService.getJson(userKey);
                if (user) {
                    user.lastTransferAt = new Date().toISOString();
                    user.transferCount = (user.transferCount || 0) + 1;
                    user.updatedAt = new Date().toISOString();
                    await redisService_1.redisService.setJson(userKey, user);
                }
            }
        }
        catch (error) {
            logger_1.default.error('❌ Failed to ensure user exists:', { address, error });
            throw error;
        }
    }
}
exports.TransferService = TransferService;
exports.transferService = new TransferService();
exports.default = exports.transferService;
//# sourceMappingURL=transferService.js.map