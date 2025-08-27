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
router.post('/', [
    (0, express_validator_1.body)('syShares').isString().notEmpty().withMessage('SY shares amount is required'),
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
        const { syShares, signature, nonce, deadline } = req.body;
        const user = req.user?.address;
        if (!user) {
            res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
            return;
        }
        const pytNytService = req.app.locals.services.pytNytService;
        const result = await pytNytService.splitYield({
            user,
            syShares,
            signature,
            nonce,
            deadline
        });
        logger_1.default.info(`Yield splitting successful for ${user}: PYT ${result.pytAmount}, NYT ${result.nytAmount}`);
        res.json({
            success: true,
            data: {
                txHash: result.txHash,
                pytAmount: result.pytAmount,
                nytAmount: result.nytAmount,
                economics: '1:1',
                timestamp: Date.now()
            }
        });
        return;
    }
    catch (error) {
        logger_1.default.error('Yield splitting failed:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Splitting failed'
        });
        return;
    }
});
router.post('/recombine', [
    (0, express_validator_1.body)('pytAmount').isString().notEmpty().withMessage('PYT amount is required'),
    (0, express_validator_1.body)('nytAmount').isString().notEmpty().withMessage('NYT amount is required'),
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
        const { pytAmount, nytAmount, signature, nonce, deadline } = req.body;
        const user = req.user?.address;
        if (!user) {
            res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
            return;
        }
        const pytNytService = req.app.locals.services.pytNytService;
        const result = await pytNytService.recombineYield({
            user,
            pytAmount,
            nytAmount,
            signature,
            nonce,
            deadline
        });
        logger_1.default.info(`Yield recombination successful for ${user}: ${result.syShares} SY shares`);
        res.json({
            success: true,
            data: {
                txHash: result.txHash,
                syShares: result.syShares,
                timestamp: Date.now()
            }
        });
        return;
    }
    catch (error) {
        logger_1.default.error('Yield recombination failed:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Recombination failed'
        });
        return;
    }
});
router.get('/positions/:address', [
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
        res.json({
            success: true,
            data: {
                address,
                positions,
                timestamp: Date.now()
            }
        });
        return;
    }
    catch (error) {
        logger_1.default.error(`Failed to get positions for ${req.params.address}:`, error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch positions'
        });
        return;
    }
});
router.get('/forecast/:address', [
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
        const timeframe = parseInt(req.query.timeframe) || 30;
        const pytNytService = req.app.locals.services.pytNytService;
        const forecast = await pytNytService.getYieldForecast(address, timeframe);
        res.json({
            success: true,
            data: {
                address,
                forecast,
                timestamp: Date.now()
            }
        });
        return;
    }
    catch (error) {
        logger_1.default.error(`Failed to get yield forecast for ${req.params.address}:`, error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to generate forecast'
        });
        return;
    }
});
router.use(errorHandler_1.errorHandler);
exports.default = router;
//# sourceMappingURL=split.js.map