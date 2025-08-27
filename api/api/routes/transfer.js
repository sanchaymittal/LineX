"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const transfer_1 = require("../../services/transfer");
const errorHandler_1 = require("../middleware/errorHandler");
const errorHandler_2 = require("../middleware/errorHandler");
const logger_1 = __importDefault(require("../../utils/logger"));
const router = (0, express_1.Router)();
router.post('/', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { quoteId, from, to, signature, nonce, deadline } = req.body;
    if (!quoteId || !from || !to || !signature || nonce === undefined || !deadline) {
        throw (0, errorHandler_2.createValidationError)('quoteId, from, to, signature, nonce, and deadline are required');
    }
    const result = await transfer_1.transferService.createTransfer({
        quoteId,
        from,
        to,
        signature,
        nonce: parseInt(nonce),
        deadline: parseInt(deadline),
    });
    if (result.success && result.transfer) {
        res.status(201).json({
            success: true,
            data: {
                transfer: {
                    id: result.transfer.id,
                    status: result.transfer.status,
                    senderAddress: result.transfer.senderAddress,
                    recipientAddress: result.transfer.recipientAddress,
                    fromCurrency: result.transfer.fromCurrency,
                    toCurrency: result.transfer.toCurrency,
                    fromAmount: result.transfer.fromAmount,
                    toAmount: result.transfer.toAmount,
                    exchangeRate: result.transfer.exchangeRate,
                    platformFeeAmount: result.transfer.platformFeeAmount,
                    transactionHash: result.transfer.transactionHash,
                    createdAt: result.transfer.createdAt,
                    completedAt: result.transfer.completedAt,
                },
            },
            metadata: {
                timestamp: new Date().toISOString(),
                requestId: req.correlationId,
            },
        });
        logger_1.default.info('✅ User-authorized transfer processed via API', {
            transferId: result.transfer.id,
            senderAddress: result.transfer.senderAddress,
            recipientAddress: result.transfer.recipientAddress,
            amount: result.transfer.toAmount,
            status: result.transfer.status,
            transactionHash: result.transfer.transactionHash,
            correlationId: req.correlationId,
        });
    }
    else {
        res.status(400).json({
            success: false,
            data: null,
            error: {
                code: 'TRANSFER_CREATION_FAILED',
                message: result.error,
            },
            metadata: {
                timestamp: new Date().toISOString(),
                requestId: req.correlationId,
            },
        });
    }
}));
router.get('/:transferId', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { transferId } = req.params;
    if (!transferId) {
        throw (0, errorHandler_2.createValidationError)('transferId is required');
    }
    const transfer = await transfer_1.transferService.getTransfer(transferId);
    if (transfer) {
        res.status(200).json({
            success: true,
            data: {
                transfer: {
                    id: transfer.id,
                    quoteId: transfer.quoteId,
                    status: transfer.status,
                    fromCurrency: transfer.fromCurrency,
                    toCurrency: transfer.toCurrency,
                    fromAmount: transfer.fromAmount,
                    toAmount: transfer.toAmount,
                    exchangeRate: transfer.exchangeRate,
                    platformFeeAmount: transfer.platformFeeAmount,
                    senderAddress: transfer.senderAddress,
                    recipientAddress: transfer.recipientAddress,
                    transactionHash: transfer.transactionHash,
                    createdAt: transfer.createdAt,
                    updatedAt: transfer.updatedAt,
                    completedAt: transfer.completedAt,
                    error: transfer.error,
                },
            },
            metadata: {
                timestamp: new Date().toISOString(),
                requestId: req.correlationId,
            },
        });
    }
    else {
        res.status(404).json({
            success: false,
            data: null,
            error: {
                code: 'TRANSFER_NOT_FOUND',
                message: 'Transfer not found or expired',
            },
            metadata: {
                timestamp: new Date().toISOString(),
                requestId: req.correlationId,
            },
        });
    }
}));
router.get('/user/:address', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { address } = req.params;
    const { limit = '10' } = req.query;
    if (!address) {
        throw (0, errorHandler_2.createValidationError)('wallet address is required');
    }
    const transfers = await transfer_1.transferService.getUserTransfers(address, parseInt(limit));
    res.status(200).json({
        success: true,
        data: {
            transfers: transfers.map(transfer => ({
                id: transfer.id,
                quoteId: transfer.quoteId,
                status: transfer.status,
                senderAddress: transfer.senderAddress,
                recipientAddress: transfer.recipientAddress,
                fromCurrency: transfer.fromCurrency,
                toCurrency: transfer.toCurrency,
                fromAmount: transfer.fromAmount,
                toAmount: transfer.toAmount,
                exchangeRate: transfer.exchangeRate,
                platformFeeAmount: transfer.platformFeeAmount,
                transactionHash: transfer.transactionHash,
                createdAt: transfer.createdAt,
                completedAt: transfer.completedAt,
            })),
            count: transfers.length,
        },
        metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.correlationId,
        },
    });
}));
router.post('/:transferId/cancel', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { transferId } = req.params;
    const { reason } = req.body;
    if (!transferId) {
        throw (0, errorHandler_2.createValidationError)('transferId is required');
    }
    const result = await transfer_1.transferService.cancelTransfer(transferId, reason);
    if (result.success && result.transfer) {
        res.status(200).json({
            success: true,
            data: {
                transferId: result.transfer.id,
                status: result.transfer.status,
                message: 'Transfer cancelled successfully',
                reason,
            },
            metadata: {
                timestamp: new Date().toISOString(),
                requestId: req.correlationId,
            },
        });
        logger_1.default.info('🚫 Transfer cancelled via API', {
            transferId,
            reason,
            correlationId: req.correlationId,
        });
    }
    else {
        res.status(400).json({
            success: false,
            data: null,
            error: {
                code: 'TRANSFER_CANCELLATION_FAILED',
                message: result.error,
            },
            metadata: {
                timestamp: new Date().toISOString(),
                requestId: req.correlationId,
            },
        });
    }
}));
exports.default = router;
//# sourceMappingURL=transfer.js.map