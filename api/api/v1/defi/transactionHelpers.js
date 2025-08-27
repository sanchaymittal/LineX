"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const ethers_ext_1 = require("@kaiachain/ethers-ext");
const ethers_1 = require("ethers");
const logger_1 = __importDefault(require("../../../utils/logger"));
const feeDelegationService_1 = require("../../../services/blockchain/feeDelegationService");
const router = (0, express_1.Router)();
const ERC20_ABI = [
    'function approve(address spender, uint256 amount) returns (bool)'
];
const VAULT_ABI = [
    'function deposit(uint256 assets, address receiver) returns (uint256 shares)'
];
const AUTOCOMPOUND_ABI = [
    'function deposit(uint256 amount) returns (uint256 shares)'
];
router.post('/approve-request', [
    (0, express_validator_1.body)('tokenAddress').isEthereumAddress().withMessage('Valid token address required'),
    (0, express_validator_1.body)('spenderAddress').isEthereumAddress().withMessage('Valid spender address required'),
    (0, express_validator_1.body)('userAddress').isEthereumAddress().withMessage('Valid user address required'),
    (0, express_validator_1.body)('amount').custom((value) => {
        if (typeof value === 'string' && value.trim() !== '')
            return true;
        if (typeof value === 'number' && value > 0)
            return true;
        return false;
    }).withMessage('Amount must be a positive number or non-empty string')
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
        const { tokenAddress, spenderAddress, userAddress, amount } = req.body;
        logger_1.default.info('🔐 Preparing approval transaction request', {
            tokenAddress,
            spenderAddress,
            userAddress,
            amount
        });
        const tokenInterface = new ethers_1.Interface(ERC20_ABI);
        const approvalData = tokenInterface.encodeFunctionData('approve', [
            spenderAddress,
            String(amount)
        ]);
        const txRequest = {
            type: ethers_ext_1.TxType.FeeDelegatedSmartContractExecution,
            from: userAddress,
            to: tokenAddress,
            data: approvalData,
            gasLimit: 100000,
            value: 0
        };
        logger_1.default.info('✅ Approval transaction request prepared', {
            from: userAddress,
            to: tokenAddress,
            dataLength: approvalData.length
        });
        res.json({
            success: true,
            data: {
                txRequest,
                description: 'ERC20 approval transaction request',
                expectedGas: '100000',
                function: 'approve',
                parameters: {
                    spender: spenderAddress,
                    amount: String(amount)
                }
            }
        });
    }
    catch (error) {
        logger_1.default.error('Failed to prepare approval request:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to prepare approval request'
        });
    }
});
router.post('/deposit-request', [
    (0, express_validator_1.body)('vaultType').isIn(['standardized-yield', 'auto-compound']).withMessage('Valid vault type required'),
    (0, express_validator_1.body)('vaultAddress').isEthereumAddress().withMessage('Valid vault address required'),
    (0, express_validator_1.body)('userAddress').isEthereumAddress().withMessage('Valid user address required'),
    (0, express_validator_1.body)('amount').custom((value) => {
        if (typeof value === 'string' && value.trim() !== '')
            return true;
        if (typeof value === 'number' && value > 0)
            return true;
        return false;
    }).withMessage('Amount must be a positive number or non-empty string')
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
        const { vaultType, vaultAddress, userAddress, amount } = req.body;
        logger_1.default.info('🏦 Preparing deposit transaction request', {
            vaultType,
            vaultAddress,
            userAddress,
            amount
        });
        let depositData;
        let gasLimit;
        if (vaultType === 'standardized-yield') {
            const vaultInterface = new ethers_1.Interface(VAULT_ABI);
            depositData = vaultInterface.encodeFunctionData('deposit', [
                String(amount),
                userAddress
            ]);
            gasLimit = 500000;
        }
        else {
            const vaultInterface = new ethers_1.Interface(AUTOCOMPOUND_ABI);
            depositData = vaultInterface.encodeFunctionData('deposit', [
                String(amount)
            ]);
            gasLimit = 500000;
        }
        const txRequest = {
            type: ethers_ext_1.TxType.FeeDelegatedSmartContractExecution,
            from: userAddress,
            to: vaultAddress,
            data: depositData,
            gasLimit,
            value: 0
        };
        logger_1.default.info('✅ Deposit transaction request prepared', {
            vaultType,
            from: userAddress,
            to: vaultAddress,
            gasLimit,
            dataLength: depositData.length
        });
        res.json({
            success: true,
            data: {
                txRequest,
                description: `${vaultType} deposit transaction request`,
                expectedGas: String(gasLimit),
                function: 'deposit',
                parameters: {
                    amount: String(amount),
                    receiver: vaultType === 'standardized-yield' ? userAddress : undefined
                }
            }
        });
    }
    catch (error) {
        logger_1.default.error('Failed to prepare deposit request:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to prepare deposit request'
        });
    }
});
router.post('/withdraw-request', [
    (0, express_validator_1.body)('vaultType').isIn(['standardized-yield', 'auto-compound']).withMessage('Valid vault type required'),
    (0, express_validator_1.body)('vaultAddress').isEthereumAddress().withMessage('Valid vault address required'),
    (0, express_validator_1.body)('userAddress').isEthereumAddress().withMessage('Valid user address required'),
    (0, express_validator_1.body)('shares').custom((value) => {
        if (typeof value === 'string' && value.trim() !== '')
            return true;
        if (typeof value === 'number' && value > 0)
            return true;
        return false;
    }).withMessage('Shares must be a positive number or non-empty string')
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
        const { vaultType, vaultAddress, userAddress, shares } = req.body;
        logger_1.default.info('💸 Preparing withdraw transaction request', {
            vaultType,
            vaultAddress,
            userAddress,
            shares
        });
        const WITHDRAW_ABI = [
            'function withdraw(uint256 shares, address receiver, address owner) returns (uint256 assets)'
        ];
        const vaultInterface = new ethers_1.Interface(WITHDRAW_ABI);
        const withdrawData = vaultInterface.encodeFunctionData('withdraw', [
            String(shares),
            userAddress,
            userAddress
        ]);
        const gasLimit = vaultType === 'standardized-yield' ? 500000 : 500000;
        const txRequest = {
            type: ethers_ext_1.TxType.FeeDelegatedSmartContractExecution,
            from: userAddress,
            to: vaultAddress,
            data: withdrawData,
            gasLimit,
            value: 0
        };
        logger_1.default.info('✅ Withdraw transaction request prepared', {
            vaultType,
            from: userAddress,
            to: vaultAddress,
            gasLimit,
            dataLength: withdrawData.length
        });
        res.json({
            success: true,
            data: {
                txRequest,
                description: `${vaultType} withdraw transaction request`,
                expectedGas: String(gasLimit),
                function: 'withdraw',
                parameters: {
                    shares: String(shares),
                    receiver: userAddress,
                    owner: userAddress
                }
            }
        });
    }
    catch (error) {
        logger_1.default.error('Failed to prepare withdraw request:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to prepare withdraw request'
        });
    }
});
router.post('/signature/execute', [
    (0, express_validator_1.body)('senderRawTransaction').isString().notEmpty().withMessage('Signed transaction required')
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
        const { senderRawTransaction } = req.body;
        logger_1.default.info('🚀 Executing fee-delegated transaction');
        const result = await feeDelegationService_1.feeDelegationService.executeFeeDelegatedTransaction(senderRawTransaction);
        if (!result.success) {
            logger_1.default.error('❌ Transaction execution failed', {
                error: result.error,
                transactionHash: result.transactionHash
            });
            res.status(400).json({
                success: false,
                error: result.error || 'Transaction execution failed',
                data: {
                    transactionHash: result.transactionHash,
                    blockNumber: result.blockNumber
                }
            });
            return;
        }
        logger_1.default.info('✅ Transaction executed successfully', {
            transactionHash: result.transactionHash,
            blockNumber: result.blockNumber,
            gasUsed: result.gasUsed?.toString()
        });
        res.json({
            success: true,
            data: {
                transactionHash: result.transactionHash,
                blockNumber: result.blockNumber,
                gasUsed: result.gasUsed?.toString(),
                message: 'Transaction executed successfully'
            }
        });
    }
    catch (error) {
        logger_1.default.error('Transaction execution error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Transaction execution failed'
        });
    }
});
exports.default = router;
//# sourceMappingURL=transactionHelpers.js.map