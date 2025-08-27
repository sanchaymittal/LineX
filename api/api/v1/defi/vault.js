"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const signatureValidation_1 = require("../../middleware/signatureValidation");
const errorHandler_1 = require("../../middleware/errorHandler");
const logger_1 = __importDefault(require("../../../utils/logger"));
const ethers_1 = require("ethers");
const router = (0, express_1.Router)();
router.post('/deposit', [
    (0, express_validator_1.body)('amount').custom((value) => {
        if (typeof value === 'string' && value.trim() !== '')
            return true;
        if (typeof value === 'number' && value > 0)
            return true;
        return false;
    }).withMessage('Amount must be a positive number or non-empty string'),
    (0, express_validator_1.body)('signature').isString().notEmpty().withMessage('Signature is required'),
    (0, express_validator_1.body)('nonce').isInt({ min: 1 }).withMessage('Valid nonce is required'),
    (0, express_validator_1.body)('deadline').isInt({ min: 1 }).withMessage('Valid deadline is required'),
    signatureValidation_1.validateEIP712Signature
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            res.status(400).json({
                success: false,
                error: 'Invalid input',
                details: errors.array()
            });
            return;
        }
        const { amount, signature, nonce, deadline, senderRawTransaction } = req.body;
        const user = req.user?.walletAddress || req.user?.address;
        if (!user) {
            res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
            return;
        }
        const standardizedYieldService = req.app.locals.services.standardizedYieldService;
        const result = await standardizedYieldService.deposit({
            user,
            amount,
            signature,
            nonce,
            deadline,
            senderRawTransaction
        });
        logger_1.default.info(`Vault deposit successful for ${user}: ${result.shares} shares`);
        res.json({
            success: true,
            data: {
                txHash: result.txHash,
                shares: result.shares,
                timestamp: Date.now()
            }
        });
        return;
    }
    catch (error) {
        logger_1.default.error('Vault deposit failed:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Deposit failed'
        });
        return;
    }
});
router.post('/withdraw', [
    (0, express_validator_1.body)('shares').isString().notEmpty().withMessage('Shares amount is required'),
    (0, express_validator_1.body)('signature').isString().notEmpty().withMessage('Signature is required'),
    (0, express_validator_1.body)('nonce').isInt({ min: 1 }).withMessage('Valid nonce is required'),
    (0, express_validator_1.body)('deadline').isInt({ min: 1 }).withMessage('Valid deadline is required'),
    signatureValidation_1.validateEIP712Signature
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            res.status(400).json({
                success: false,
                error: 'Invalid input',
                details: errors.array()
            });
            return;
        }
        const { shares, signature, nonce, deadline, senderRawTransaction } = req.body;
        const user = req.user?.walletAddress || req.user?.address;
        if (!user) {
            res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
            return;
        }
        const standardizedYieldService = req.app.locals.services.standardizedYieldService;
        const result = await standardizedYieldService.withdraw({
            user,
            shares,
            signature,
            nonce,
            deadline,
            senderRawTransaction
        });
        logger_1.default.info(`Vault withdrawal successful for ${user}: ${result.assets} assets`);
        res.json({
            success: true,
            data: {
                txHash: result.txHash,
                assets: result.assets,
                timestamp: Date.now()
            }
        });
        return;
    }
    catch (error) {
        logger_1.default.error('Vault withdrawal failed:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Withdrawal failed'
        });
        return;
    }
});
router.get('/balance/:address', [
    (0, express_validator_1.param)('address').isEthereumAddress().withMessage('Valid Ethereum address required')
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            res.status(400).json({
                success: false,
                error: 'Invalid address format',
                details: errors.array()
            });
            return;
        }
        const address = req.params.address;
        if (!address) {
            res.status(400).json({ success: false, error: 'Address is required' });
            return;
        }
        const standardizedYieldService = req.app.locals.services.standardizedYieldService;
        const balance = await standardizedYieldService.getBalance(address);
        res.json({
            success: true,
            data: {
                address,
                balance,
                timestamp: Date.now()
            }
        });
        return;
    }
    catch (error) {
        logger_1.default.error(`Failed to get balance for ${req.params.address}:`, error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch balance'
        });
        return;
    }
});
router.get('/apy', async (req, res) => {
    try {
        const standardizedYieldService = req.app.locals.services.standardizedYieldService;
        const vaultInfo = await standardizedYieldService.getVaultInfo();
        res.json({
            success: true,
            data: {
                apy: vaultInfo.apy,
                totalAssets: vaultInfo.totalAssets,
                totalSupply: vaultInfo.totalSupply,
                timestamp: Date.now()
            }
        });
        return;
    }
    catch (error) {
        logger_1.default.error('Failed to get vault APY:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch APY'
        });
        return;
    }
});
router.get('/strategies', async (req, res) => {
    try {
        const standardizedYieldService = req.app.locals.services.standardizedYieldService;
        const vaultInfo = await standardizedYieldService.getVaultInfo();
        res.json({
            success: true,
            data: {
                strategies: vaultInfo.strategies,
                totalStrategies: vaultInfo.strategies.length,
                timestamp: Date.now()
            }
        });
        return;
    }
    catch (error) {
        logger_1.default.error('Failed to get vault strategies:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch strategies'
        });
        return;
    }
});
router.post('/deposit/preview', [
    (0, express_validator_1.body)('amount').custom((value) => {
        if (typeof value === 'string' && value.trim() !== '')
            return true;
        if (typeof value === 'number' && value > 0)
            return true;
        return false;
    }).withMessage('Amount must be a positive number or non-empty string'),
    (0, express_validator_1.body)('userAddress').isEthereumAddress().withMessage('Valid user address required')
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            res.status(400).json({
                success: false,
                error: 'Invalid input',
                details: errors.array()
            });
            return;
        }
        const { amount, userAddress } = req.body;
        const standardizedYieldService = req.app.locals.services.standardizedYieldService;
        try {
            const vaultInfo = await standardizedYieldService.getVaultInfo();
            const amountBN = (0, ethers_1.parseUnits)(String(amount), 6);
            const totalAssets = (0, ethers_1.parseUnits)(vaultInfo.totalAssets || '1000000', 6);
            const totalSupply = (0, ethers_1.parseUnits)(vaultInfo.totalSupply || '1000000', 18);
            const sharePrice = totalSupply > 0 ? (totalAssets * (0, ethers_1.parseUnits)('1', 18)) / totalSupply : (0, ethers_1.parseUnits)('1', 18);
            const expectedShares = (amountBN * (0, ethers_1.parseUnits)('1', 18)) / sharePrice;
            const gasEstimate = {
                gasLimit: '500000',
                gasPrice: '25000000000',
                estimatedCost: '0.0125'
            };
            const preview = {
                deposit: {
                    amount: amount,
                    asset: 'USDT'
                },
                expected: {
                    shares: (0, ethers_1.formatUnits)(expectedShares, 18),
                    sharePrice: (0, ethers_1.formatUnits)(sharePrice, 18),
                    slippage: '0.1',
                    minimumShares: (0, ethers_1.formatUnits)(expectedShares * BigInt(999) / BigInt(1000), 18)
                },
                fees: {
                    platformFee: '0',
                    networkFee: gasEstimate.estimatedCost
                },
                gasEstimate,
                vaultInfo: {
                    currentAPY: vaultInfo.apy,
                    totalAssets: vaultInfo.totalAssets,
                    utilizationRate: '95.0',
                    strategies: vaultInfo.strategies?.length || 3
                },
                risks: {
                    level: 2,
                    factors: ['Strategy allocation risk', 'Smart contract risk', 'Market volatility']
                },
                timestamp: Date.now()
            };
            res.json({
                success: true,
                data: preview
            });
            return;
        }
        catch (error) {
            logger_1.default.error('Failed to generate deposit preview:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to calculate deposit preview'
            });
            return;
        }
    }
    catch (error) {
        logger_1.default.error('Deposit preview failed:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Preview failed'
        });
        return;
    }
});
router.post('/withdraw/preview', [
    (0, express_validator_1.body)('shares').isString().notEmpty().withMessage('Shares amount is required'),
    (0, express_validator_1.body)('userAddress').isEthereumAddress().withMessage('Valid user address required')
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            res.status(400).json({
                success: false,
                error: 'Invalid input',
                details: errors.array()
            });
            return;
        }
        const { shares, userAddress } = req.body;
        const standardizedYieldService = req.app.locals.services.standardizedYieldService;
        try {
            const vaultInfo = await standardizedYieldService.getVaultInfo();
            const userBalance = await standardizedYieldService.getBalance(userAddress);
            const sharesBN = (0, ethers_1.parseUnits)(shares, 18);
            const totalAssets = (0, ethers_1.parseUnits)(vaultInfo.totalAssets || '1000000', 6);
            const totalSupply = (0, ethers_1.parseUnits)(vaultInfo.totalSupply || '1000000', 18);
            const expectedAssets = totalSupply > 0 ? (sharesBN * totalAssets) / totalSupply : BigInt(0);
            const userShares = (0, ethers_1.parseUnits)(userBalance.syShares || '0', 18);
            const canWithdraw = userShares >= sharesBN;
            const gasEstimate = {
                gasLimit: '400000',
                gasPrice: '25000000000',
                estimatedCost: '0.01'
            };
            const withdrawalFee = BigInt(0);
            const assetsAfterFee = expectedAssets - withdrawalFee;
            const preview = {
                withdrawal: {
                    shares: shares,
                    maxShares: (0, ethers_1.formatUnits)(userShares, 18)
                },
                expected: {
                    assets: (0, ethers_1.formatUnits)(expectedAssets, 6),
                    assetsAfterFee: (0, ethers_1.formatUnits)(assetsAfterFee, 6),
                    asset: 'USDT',
                    sharePrice: totalSupply > 0 ? (0, ethers_1.formatUnits)((totalAssets * (0, ethers_1.parseUnits)('1', 18)) / totalSupply, 18) : '1.0'
                },
                fees: {
                    withdrawalFee: '0',
                    withdrawalFeeAmount: '0',
                    networkFee: gasEstimate.estimatedCost
                },
                validation: {
                    canWithdraw,
                    reason: canWithdraw ? null : 'Insufficient shares balance'
                },
                gasEstimate,
                taxImplications: {
                    gainLoss: 'TBD',
                    taxCategory: 'Capital gains (consult tax advisor)'
                },
                timing: {
                    processingTime: '1-2 minutes',
                    cooldownPeriod: 'None'
                },
                timestamp: Date.now()
            };
            res.json({
                success: true,
                data: preview
            });
            return;
        }
        catch (error) {
            logger_1.default.error('Failed to generate withdrawal preview:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to calculate withdrawal preview'
            });
            return;
        }
    }
    catch (error) {
        logger_1.default.error('Withdrawal preview failed:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Preview failed'
        });
        return;
    }
});
router.use(errorHandler_1.errorHandler);
exports.default = router;
//# sourceMappingURL=vault.js.map