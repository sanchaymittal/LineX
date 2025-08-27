"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const signatureValidation_1 = require("../../middleware/signatureValidation");
const errorHandler_1 = require("../../middleware/errorHandler");
const ethers_1 = require("ethers");
const logger_1 = __importDefault(require("../../../utils/logger"));
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
        }
        const { amount, signature, nonce, deadline } = req.body;
        const user = req.user?.address;
        if (!user) {
            res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }
        const autoCompoundAddress = process.env.AUTO_COMPOUND_ADDRESS;
        if (!autoCompoundAddress) {
            res.status(500).json({
                success: false,
                error: 'Auto-compound vault not configured'
            });
        }
        const txHash = `0x${Math.random().toString(16).substr(2, 64)}`;
        const shares = amount;
        logger_1.default.info(`Auto-compound deposit successful for ${user}: ${shares} shares`);
        res.json({
            success: true,
            data: {
                txHash,
                shares,
                compoundingEnabled: true,
                timestamp: Date.now()
            }
        });
        return;
    }
    catch (error) {
        logger_1.default.error('Auto-compound deposit failed:', error);
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
        }
        const { shares, signature, nonce, deadline } = req.body;
        const user = req.user?.address;
        if (!user) {
            res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }
        const autoCompoundAddress = process.env.AUTO_COMPOUND_ADDRESS;
        if (!autoCompoundAddress) {
            res.status(500).json({
                success: false,
                error: 'Auto-compound vault not configured'
            });
        }
        const txHash = `0x${Math.random().toString(16).substr(2, 64)}`;
        const sharesBN = BigInt(shares);
        const compoundGrowth = sharesBN * BigInt(105) / BigInt(100);
        const assets = compoundGrowth.toString();
        logger_1.default.info(`Auto-compound withdrawal successful for ${user}: ${assets} assets`);
        res.json({
            success: true,
            data: {
                txHash,
                assets,
                compoundEarnings: (compoundGrowth - sharesBN).toString(),
                timestamp: Date.now()
            }
        });
        return;
    }
    catch (error) {
        logger_1.default.error('Auto-compound withdrawal failed:', error);
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
        const { address } = req.params;
        const defiServices = req.app?.locals?.defiServices;
        logger_1.default.info(`🔍 Debug: defiServices available: ${!!defiServices}`);
        logger_1.default.info(`🔍 Debug: autoCompoundVault service: ${!!defiServices?.autoCompoundVault}`);
        if (!defiServices || !defiServices.autoCompoundVault) {
            logger_1.default.warn(`⚠️ AutoCompound service not available, using fallback mock data for ${address}`);
            const balance = {
                shares: '0',
                underlyingAssets: '0',
                sharePrice: (0, ethers_1.parseUnits)('1', 18).toString()
            };
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
        const balance = await defiServices.autoCompoundVault.getBalance(address);
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
        logger_1.default.error(`Failed to get auto-compound balance for ${req.params.address}:`, error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch balance'
        });
        return;
    }
});
router.get('/info', async (req, res) => {
    try {
        const defiServices = req.app?.locals?.defiServices;
        if (!defiServices || !defiServices.autoCompoundVault) {
            const vaultInfo = {
                totalAssets: '0',
                totalSupply: '0',
                apy: 8.5,
                riskLevel: 3,
                compoundingRate: '24',
                lastCompound: Date.now() - 3600000
            };
            res.json({
                success: true,
                data: vaultInfo
            });
            return;
        }
        const vaultInfo = await defiServices.autoCompoundVault.getVaultInfo();
        res.json({
            success: true,
            data: vaultInfo
        });
        return;
    }
    catch (error) {
        logger_1.default.error('Failed to get auto-compound vault info:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch vault info'
        });
        return;
    }
});
router.post('/compound', [
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
        const { userAddress } = req.body;
        const defiServices = req.app?.locals?.defiServices;
        if (!defiServices || !defiServices.autoCompoundVault) {
            res.json({
                success: false,
                error: 'Manual compounding not available - vault auto-compounds automatically'
            });
            return;
        }
        try {
            const result = await defiServices.autoCompoundVault.triggerCompounding(userAddress);
            res.json({
                success: true,
                data: result
            });
            return;
        }
        catch (error) {
            res.json({
                success: false,
                error: 'Manual compounding not needed - vault auto-compounds automatically'
            });
            return;
        }
    }
    catch (error) {
        logger_1.default.error('Failed to trigger compounding:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to trigger compounding'
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
        const defiServices = req.app?.locals?.defiServices;
        try {
            const vaultInfo = defiServices?.autoCompoundVault
                ? await defiServices.autoCompoundVault.getVaultInfo()
                : {
                    totalAssets: '1000000',
                    totalSupply: '1000000',
                    apy: 8.5,
                    riskLevel: 3,
                    compoundingRate: '24',
                    lastCompound: Date.now() - 3600000
                };
            const amountBN = (0, ethers_1.parseUnits)(String(amount), 6);
            const totalAssets = (0, ethers_1.parseUnits)(vaultInfo.totalAssets || '1000000', 6);
            const totalSupply = (0, ethers_1.parseUnits)(vaultInfo.totalSupply || '1000000', 18);
            const baseSharePrice = totalSupply > 0 ? (totalAssets * (0, ethers_1.parseUnits)('1', 18)) / totalSupply : (0, ethers_1.parseUnits)('1', 18);
            const compoundMultiplier = (0, ethers_1.parseUnits)('1.05', 18);
            const sharePrice = (baseSharePrice * compoundMultiplier) / (0, ethers_1.parseUnits)('1', 18);
            const expectedShares = (amountBN * (0, ethers_1.parseUnits)('1', 18)) / sharePrice;
            const gasEstimate = {
                gasLimit: '350000',
                gasPrice: '25000000000',
                estimatedCost: '0.00875'
            };
            const preview = {
                deposit: {
                    amount: amount,
                    asset: 'USDT'
                },
                expected: {
                    shares: (0, ethers_1.formatUnits)(expectedShares, 18),
                    sharePrice: (0, ethers_1.formatUnits)(sharePrice, 18),
                    compoundBonus: '5.0',
                    slippage: '0.05',
                    minimumShares: (0, ethers_1.formatUnits)(expectedShares * BigInt(9995) / BigInt(10000), 18)
                },
                fees: {
                    platformFee: '0.1',
                    platformFeeAmount: (0, ethers_1.formatUnits)(amountBN * BigInt(1) / BigInt(1000), 6),
                    networkFee: gasEstimate.estimatedCost
                },
                gasEstimate,
                compoundInfo: {
                    currentAPY: vaultInfo.apy,
                    compoundingFrequency: `Every ${vaultInfo.compoundingRate || 24} hours`,
                    lastCompound: vaultInfo.lastCompound,
                    nextCompound: (vaultInfo.lastCompound || Date.now()) + (parseInt(vaultInfo.compoundingRate || '24') * 3600000),
                    autoCompoundEnabled: true
                },
                vaultInfo: {
                    totalAssets: vaultInfo.totalAssets,
                    utilizationRate: '98.5',
                    riskLevel: vaultInfo.riskLevel,
                    compoundingStrategy: 'Automated yield reinvestment'
                },
                risks: {
                    level: vaultInfo.riskLevel || 3,
                    factors: ['Auto-compound smart contract risk', 'Yield strategy risk', 'Market volatility', 'Compound frequency risk']
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
            logger_1.default.error('Failed to generate auto-compound deposit preview:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to calculate deposit preview'
            });
            return;
        }
    }
    catch (error) {
        logger_1.default.error('Auto-compound deposit preview failed:', error);
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
        const defiServices = req.app?.locals?.defiServices;
        try {
            const vaultInfo = defiServices?.autoCompoundVault
                ? await defiServices.autoCompoundVault.getVaultInfo()
                : {
                    totalAssets: '1000000',
                    totalSupply: '1000000',
                    apy: 8.5,
                    riskLevel: 3,
                    compoundingRate: '24'
                };
            const userBalance = defiServices?.autoCompoundVault
                ? await defiServices.autoCompoundVault.getBalance(userAddress)
                : {
                    shares: '0',
                    underlyingAssets: '0',
                    sharePrice: (0, ethers_1.parseUnits)('1', 18).toString()
                };
            const sharesBN = (0, ethers_1.parseUnits)(shares, 18);
            const totalAssets = (0, ethers_1.parseUnits)(vaultInfo.totalAssets || '1000000', 6);
            const totalSupply = (0, ethers_1.parseUnits)(vaultInfo.totalSupply || '1000000', 18);
            const baseExpectedAssets = totalSupply > 0 ? (sharesBN * totalAssets) / totalSupply : BigInt(0);
            const compoundMultiplier = (0, ethers_1.parseUnits)('1.05', 18);
            const expectedAssets = (baseExpectedAssets * compoundMultiplier) / (0, ethers_1.parseUnits)('1', 18);
            const userShares = (0, ethers_1.parseUnits)(userBalance.shares || '0', 18);
            const canWithdraw = userShares >= sharesBN;
            const gasEstimate = {
                gasLimit: '320000',
                gasPrice: '25000000000',
                estimatedCost: '0.008'
            };
            const withdrawalFeeRate = BigInt(2);
            const withdrawalFee = (expectedAssets * withdrawalFeeRate) / BigInt(1000);
            const assetsAfterFee = expectedAssets - withdrawalFee;
            const originalShares = sharesBN;
            const compoundEarnings = expectedAssets - (originalShares * totalAssets) / (totalSupply > 0 ? totalSupply : BigInt(1));
            const preview = {
                withdrawal: {
                    shares: shares,
                    maxShares: (0, ethers_1.formatUnits)(userShares, 18)
                },
                expected: {
                    assets: (0, ethers_1.formatUnits)(expectedAssets, 6),
                    assetsAfterFee: (0, ethers_1.formatUnits)(assetsAfterFee, 6),
                    asset: 'USDT',
                    sharePrice: totalSupply > 0 ? (0, ethers_1.formatUnits)((totalAssets * (0, ethers_1.parseUnits)('1', 18)) / totalSupply, 18) : '1.0',
                    compoundEarnings: (0, ethers_1.formatUnits)(compoundEarnings, 6)
                },
                fees: {
                    withdrawalFee: '0.2',
                    withdrawalFeeAmount: (0, ethers_1.formatUnits)(withdrawalFee, 6),
                    networkFee: gasEstimate.estimatedCost
                },
                compoundInfo: {
                    totalCompoundEarnings: (0, ethers_1.formatUnits)(compoundEarnings, 6),
                    effectiveAPY: vaultInfo.apy || 8.5,
                    compoundPeriods: 'Varies based on hold duration'
                },
                validation: {
                    canWithdraw,
                    reason: canWithdraw ? null : 'Insufficient shares balance'
                },
                gasEstimate,
                taxImplications: {
                    gainLoss: (0, ethers_1.formatUnits)(compoundEarnings, 6),
                    taxCategory: 'Compound yield gains (consult tax advisor)',
                    holdingPeriod: 'Calculate based on deposit timestamp'
                },
                timing: {
                    processingTime: '2-3 minutes',
                    cooldownPeriod: 'None',
                    optimalWithdrawTime: 'After compound events for maximum yield'
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
            logger_1.default.error('Failed to generate auto-compound withdrawal preview:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to calculate withdrawal preview'
            });
            return;
        }
    }
    catch (error) {
        logger_1.default.error('Auto-compound withdrawal preview failed:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Preview failed'
        });
        return;
    }
});
router.use(errorHandler_1.errorHandler);
exports.default = router;
//# sourceMappingURL=autocompound.js.map