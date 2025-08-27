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
const router = (0, express_1.Router)();
router.post('/deposit', [
    (0, express_validator_1.body)('amount').isString().notEmpty().withMessage('Amount is required'),
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
        const { amount, signature, nonce, deadline } = req.body;
        const user = req.user?.address;
        if (!user) {
            res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
            return;
        }
        const yieldSetService = req.app.locals.services.yieldSetService;
        const result = await yieldSetService.deposit({
            user,
            amount,
            signature,
            nonce,
            deadline
        });
        logger_1.default.info(`YieldSet deposit successful for ${user}: ${result.shares} shares`);
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
        logger_1.default.error('YieldSet deposit failed:', error);
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
        const { shares, signature, nonce, deadline } = req.body;
        const user = req.user?.address;
        if (!user) {
            res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
            return;
        }
        const yieldSetService = req.app.locals.services.yieldSetService;
        const result = await yieldSetService.withdraw({
            user,
            shares,
            signature,
            nonce,
            deadline
        });
        logger_1.default.info(`YieldSet withdrawal successful for ${user}: ${result.assets} assets`);
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
        logger_1.default.error('YieldSet withdrawal failed:', error);
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
        const yieldSetService = req.app.locals.services.yieldSetService;
        const balance = await yieldSetService.getBalance(address);
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
        logger_1.default.error(`Failed to get YieldSet balance for ${req.params.address}:`, error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch balance'
        });
        return;
    }
});
router.get('/portfolio', async (req, res) => {
    try {
        const yieldSetService = req.app.locals.services.yieldSetService;
        const portfolioInfo = await yieldSetService.getPortfolioInfo();
        res.json({
            success: true,
            data: {
                portfolio: portfolioInfo,
                timestamp: Date.now()
            }
        });
        return;
    }
    catch (error) {
        logger_1.default.error('Failed to get YieldSet portfolio info:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch portfolio information'
        });
        return;
    }
});
router.get('/positions', async (req, res) => {
    try {
        const yieldSetService = req.app.locals.services.yieldSetService;
        const portfolioInfo = await yieldSetService.getPortfolioInfo();
        res.json({
            success: true,
            data: {
                positions: portfolioInfo.positions,
                totalPositions: portfolioInfo.positions.length,
                expectedApy: portfolioInfo.expectedApy,
                riskLevel: portfolioInfo.riskLevel,
                timestamp: Date.now()
            }
        });
        return;
    }
    catch (error) {
        logger_1.default.error('Failed to get YieldSet positions:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch positions'
        });
        return;
    }
});
router.post('/rebalance', async (req, res) => {
    try {
        const user = req.user?.address;
        if (!user) {
            res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
            return;
        }
        const yieldSetService = req.app.locals.services.yieldSetService;
        const result = await yieldSetService.rebalancePortfolio(user);
        logger_1.default.info(`YieldSet rebalancing triggered by ${user}: ${result.rebalancedPositions} positions`);
        res.json({
            success: true,
            data: {
                txHash: result.txHash,
                rebalancedPositions: result.rebalancedPositions,
                timestamp: Date.now()
            }
        });
        return;
    }
    catch (error) {
        logger_1.default.error('YieldSet rebalancing failed:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Rebalancing failed'
        });
        return;
    }
});
router.post('/harvest', async (req, res) => {
    try {
        const user = req.user?.address;
        if (!user) {
            res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
            return;
        }
        const yieldSetService = req.app.locals.services.yieldSetService;
        const result = await yieldSetService.harvestYield(user);
        logger_1.default.info(`YieldSet yield harvesting by ${user}: ${result.harvestedAmount} USDT`);
        res.json({
            success: true,
            data: {
                txHash: result.txHash,
                harvestedAmount: result.harvestedAmount,
                timestamp: Date.now()
            }
        });
        return;
    }
    catch (error) {
        logger_1.default.error('YieldSet yield harvesting failed:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Yield harvesting failed'
        });
        return;
    }
});
router.get('/apy', async (req, res) => {
    try {
        const yieldSetService = req.app.locals.services.yieldSetService;
        const portfolioInfo = await yieldSetService.getPortfolioInfo();
        res.json({
            success: true,
            data: {
                expectedApy: portfolioInfo.expectedApy,
                riskLevel: portfolioInfo.riskLevel,
                portfolioValue: portfolioInfo.portfolioValue,
                totalAssets: portfolioInfo.totalAssets,
                positions: portfolioInfo.positions.map(pos => ({
                    name: pos.name,
                    weight: pos.weight,
                    apy: pos.apy,
                    riskLevel: pos.riskLevel
                })),
                fees: portfolioInfo.fees,
                timestamp: Date.now()
            }
        });
        return;
    }
    catch (error) {
        logger_1.default.error('Failed to get YieldSet APY:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch APY'
        });
        return;
    }
});
router.get('/rebalance-info', async (req, res) => {
    try {
        const yieldSetService = req.app.locals.services.yieldSetService;
        const portfolioInfo = await yieldSetService.getPortfolioInfo();
        res.json({
            success: true,
            data: {
                rebalanceInfo: portfolioInfo.rebalanceInfo,
                canRebalance: portfolioInfo.rebalanceInfo.canRebalance,
                nextRebalanceTime: portfolioInfo.rebalanceInfo.lastRebalance + (portfolioInfo.rebalanceInfo.interval * 1000),
                timestamp: Date.now()
            }
        });
        return;
    }
    catch (error) {
        logger_1.default.error('Failed to get YieldSet rebalance info:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch rebalance info'
        });
        return;
    }
});
router.use(errorHandler_1.errorHandler);
exports.default = router;
//# sourceMappingURL=yieldset.js.map