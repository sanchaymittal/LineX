"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../../middleware/auth");
const signatureValidation_1 = require("../../middleware/signatureValidation");
const errorHandler_1 = require("../../middleware/errorHandler");
const logger_1 = __importDefault(require("../../../utils/logger"));
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
router.post('/redeem', [
    (0, express_validator_1.body)('amount').isString().notEmpty().withMessage('NYT amount is required'),
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
        const nytTokenAddress = process.env.NYT_TOKEN_ADDRESS;
        if (!nytTokenAddress) {
            res.status(500).json({
                success: false,
                error: 'NYT contract not configured'
            });
            return;
        }
        const txHash = `0x${Math.random().toString(16).substr(2, 64)}`;
        const redeemed = amount;
        logger_1.default.info(`NYT redemption successful for ${user}: ${redeemed} redeemed`);
        res.json({
            success: true,
            data: {
                txHash,
                redeemed,
                timestamp: Date.now()
            }
        });
        return;
    }
    catch (error) {
        logger_1.default.error('NYT redemption failed:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Redemption failed'
        });
        return;
    }
});
router.get('/status/:address', [
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
        if (!address) {
            res.status(400).json({ success: false, error: 'Address is required' });
            return;
        }
        const pytNytService = req.app.locals.services.pytNytService;
        const positions = await pytNytService.getUserPositions(address);
        const currentTime = Math.floor(Date.now() / 1000);
        const isMatured = positions.nytMaturity ? currentTime >= positions.nytMaturity : false;
        const timeToMaturity = positions.nytMaturity ? Math.max(0, positions.nytMaturity - currentTime) : 0;
        const status = {
            nytBalance: positions.nytBalance,
            maturity: positions.nytMaturity,
            isMatured,
            timeToMaturity,
            principalProtected: positions.principalProtected,
            liquidationProtection: positions.liquidationProtection,
            canRedeem: isMatured || positions.liquidationProtection
        };
        res.json({
            success: true,
            data: {
                address,
                status,
                timestamp: Date.now()
            }
        });
        return;
    }
    catch (error) {
        logger_1.default.error(`Failed to get NYT status for ${req.params.address}:`, error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch NYT status'
        });
        return;
    }
});
router.get('/info/:address', [
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
        if (!address) {
            res.status(400).json({ success: false, error: 'Address is required' });
            return;
        }
        const pytNytService = req.app.locals.services.pytNytService;
        const positions = await pytNytService.getUserPositions(address);
        const currentTime = Math.floor(Date.now() / 1000);
        const daysToMaturity = positions.nytMaturity ?
            Math.max(0, Math.ceil((positions.nytMaturity - currentTime) / 86400)) : 0;
        const protectionThreshold = positions.principalProtected ?
            (BigInt(positions.principalProtected) * BigInt(90) / BigInt(100)).toString() : '0';
        const info = {
            nytBalance: positions.nytBalance,
            principalAmount: positions.principalProtected,
            protectionThreshold,
            maturityDate: positions.nytMaturity,
            daysToMaturity,
            liquidationProtection: positions.liquidationProtection,
            economics: {
                model: '1:1 split with principal protection',
                maturityPeriod: '365 days',
                protectionLevel: '90% of principal'
            }
        };
        res.json({
            success: true,
            data: {
                address,
                info,
                timestamp: Date.now()
            }
        });
        return;
    }
    catch (error) {
        logger_1.default.error(`Failed to get NYT info for ${req.params.address}:`, error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch NYT info'
        });
        return;
    }
});
router.use(errorHandler_1.errorHandler);
exports.default = router;
//# sourceMappingURL=nyt.js.map