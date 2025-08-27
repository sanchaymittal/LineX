"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const wallet_1 = require("../../services/wallet");
const feeDelegationService_1 = require("../../services/blockchain/feeDelegationService");
const errorHandler_1 = require("../middleware/errorHandler");
const errorHandler_2 = require("../middleware/errorHandler");
const contracts_1 = require("../../types/contracts");
const logger_1 = __importDefault(require("../../utils/logger"));
const router = (0, express_1.Router)();
router.get('/:address/balance', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { address } = req.params;
    if (!address) {
        throw (0, errorHandler_2.createValidationError)('wallet address is required');
    }
    const result = await wallet_1.walletService.getWalletBalance(address);
    if (result.success) {
        res.status(200).json({
            success: true,
            data: {
                address: address.toLowerCase(),
                balance: result.balance,
            },
            metadata: {
                timestamp: new Date().toISOString(),
                requestId: req.correlationId,
            },
        });
    }
    else {
        res.status(400).json({
            success: false,
            data: null,
            error: {
                code: 'BALANCE_FETCH_FAILED',
                message: result.error,
            },
            metadata: {
                timestamp: new Date().toISOString(),
                requestId: req.correlationId,
            },
        });
    }
}));
router.get('/:address', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { address } = req.params;
    if (!address) {
        throw (0, errorHandler_2.createValidationError)('wallet address is required');
    }
    const user = await wallet_1.walletService.getUser(address);
    if (user) {
        res.status(200).json({
            success: true,
            data: {
                walletAddress: user.walletAddress,
                firstTransferAt: user.firstTransferAt,
                lastTransferAt: user.lastTransferAt,
                transferCount: user.transferCount,
                createdAt: user.createdAt,
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
                code: 'USER_NOT_FOUND',
                message: 'No user found for this wallet address',
            },
            metadata: {
                timestamp: new Date().toISOString(),
                requestId: req.correlationId,
            },
        });
    }
}));
router.post('/faucet', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { userAddress, signature, message } = req.body;
    if (!userAddress) {
        throw (0, errorHandler_2.createValidationError)('userAddress is required');
    }
    const result = await wallet_1.walletService.claimFaucet({
        userAddress,
        signature,
        message,
    });
    if (result.success) {
        res.status(200).json({
            success: true,
            data: {
                userAddress: userAddress.toLowerCase(),
                transactionHash: result.transactionHash,
                message: 'Faucet claim completed successfully',
                amount: '100 USDT',
            },
            metadata: {
                timestamp: new Date().toISOString(),
                requestId: req.correlationId,
            },
        });
    }
    else {
        res.status(400).json({
            success: false,
            data: null,
            error: {
                code: 'FAUCET_CLAIM_FAILED',
                message: result.error,
            },
            metadata: {
                timestamp: new Date().toISOString(),
                requestId: req.correlationId,
            },
        });
    }
}));
router.get('/:address/transfers', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { address } = req.params;
    const { limit = '10' } = req.query;
    if (!address) {
        throw (0, errorHandler_2.createValidationError)('wallet address is required');
    }
    const transfers = await wallet_1.walletService.getUserTransfers(address, parseInt(limit));
    res.status(200).json({
        success: true,
        data: {
            address: address.toLowerCase(),
            transfers,
            count: transfers.length,
        },
        metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.correlationId,
        },
    });
}));
router.post('/approve', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { userAddress, amount, senderRawTransaction, spenderAddress } = req.body;
    if (!userAddress || !amount) {
        throw (0, errorHandler_2.createValidationError)('userAddress and amount are required');
    }
    if (typeof amount !== 'number' || amount <= 0) {
        throw (0, errorHandler_2.createValidationError)('amount must be a positive number');
    }
    const spender = spenderAddress || feeDelegationService_1.feeDelegationService.getGasPayerAddress();
    logger_1.default.info('🔑 Processing gasless approval request', {
        userAddress,
        amount,
        spender,
        hasPreSignedTx: !!senderRawTransaction,
    });
    const result = await feeDelegationService_1.feeDelegationService.executeGaslessApproval({
        userAddress,
        amount,
        senderRawTransaction,
        spenderAddress: spender,
    });
    if (result.success) {
        res.status(200).json({
            success: true,
            data: {
                userAddress: userAddress.toLowerCase(),
                amount,
                transactionHash: result.transactionHash,
                blockNumber: result.blockNumber,
                message: 'Gasless approval completed successfully',
                method: 'fee-delegated-approve',
            },
            metadata: {
                timestamp: new Date().toISOString(),
                requestId: req.correlationId,
            },
        });
    }
    else {
        if (result.error?.includes('Manual approval required')) {
            res.status(200).json({
                success: false,
                data: {
                    userAddress: userAddress.toLowerCase(),
                    amount,
                    requiresManualApproval: true,
                    gasPayerAddress: feeDelegationService_1.feeDelegationService.getGasPayerAddress(),
                    message: 'Manual approval required - user must provide pre-signed fee-delegated transaction',
                    approveCallData: {
                        to: contracts_1.CONTRACT_CONSTANTS.ADDRESS,
                        method: 'approve',
                        params: [
                            spender,
                            (amount * 10 ** 6).toString(),
                        ],
                    },
                },
                error: {
                    code: 'MANUAL_APPROVAL_REQUIRED',
                    message: result.error,
                },
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: req.correlationId,
                },
            });
        }
        else {
            res.status(400).json({
                success: false,
                data: null,
                error: {
                    code: 'APPROVAL_FAILED',
                    message: result.error,
                },
                metadata: {
                    timestamp: new Date().toISOString(),
                    requestId: req.correlationId,
                },
            });
        }
    }
}));
exports.default = router;
//# sourceMappingURL=wallet.js.map