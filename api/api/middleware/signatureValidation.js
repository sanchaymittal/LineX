"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMessageHash = exports.verifyEIP712Signature = exports.EIP712Types = exports.createDomain = exports.validateEIP712Signature = void 0;
const ethers_1 = require("ethers");
const logger_1 = __importDefault(require("../../utils/logger"));
const validateEIP712Signature = (req, res, next) => {
    try {
        const { signature, nonce, deadline } = req.body;
        const user = req.user?.address;
        if (!user) {
            res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
            return;
        }
        if (!signature) {
            res.status(400).json({
                success: false,
                error: 'Signature is required'
            });
            return;
        }
        if (Date.now() > deadline * 1000) {
            res.status(400).json({
                success: false,
                error: 'Signature expired'
            });
            return;
        }
        if (!(0, ethers_1.isHexString)(signature, 65)) {
            res.status(400).json({
                success: false,
                error: 'Invalid signature format'
            });
            return;
        }
        req.signature = {
            user,
            message: req.body,
            signature,
            recovered: user
        };
        logger_1.default.info(`Signature validation passed for user ${user}`);
        next();
    }
    catch (error) {
        logger_1.default.error('Signature validation failed:', error);
        res.status(400).json({
            success: false,
            error: 'Invalid signature',
            details: error instanceof Error ? error.message : 'Signature verification failed'
        });
    }
};
exports.validateEIP712Signature = validateEIP712Signature;
const createDomain = (contractAddress, chainId = 1001) => {
    return {
        name: 'LineX',
        version: '1',
        chainId,
        verifyingContract: contractAddress
    };
};
exports.createDomain = createDomain;
exports.EIP712Types = {
    DeFiDeposit: [
        { name: 'user', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'vault', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
    ],
    DeFiWithdraw: [
        { name: 'user', type: 'address' },
        { name: 'shares', type: 'uint256' },
        { name: 'vault', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
    ],
    YieldSplit: [
        { name: 'user', type: 'address' },
        { name: 'syShares', type: 'uint256' },
        { name: 'orchestrator', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
    ],
    YieldRecombine: [
        { name: 'user', type: 'address' },
        { name: 'pytAmount', type: 'uint256' },
        { name: 'nytAmount', type: 'uint256' },
        { name: 'orchestrator', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
    ],
    YieldClaim: [
        { name: 'user', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
    ],
    YieldDistribution: [
        { name: 'orchestrator', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
    ],
    PortfolioCreate: [
        { name: 'user', type: 'address' },
        { name: 'assets', type: 'address[]' },
        { name: 'allocations', type: 'uint256[]' },
        { name: 'totalAmount', type: 'uint256' },
        { name: 'yieldSet', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
    ],
    PortfolioRedeem: [
        { name: 'user', type: 'address' },
        { name: 'portfolioTokens', type: 'uint256' },
        { name: 'yieldSet', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
    ],
    PortfolioRebalance: [
        { name: 'user', type: 'address' },
        { name: 'newAllocations', type: 'uint256[]' },
        { name: 'yieldSet', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
    ],
    NYTRedeem: [
        { name: 'user', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'token', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
    ],
    AutoCompoundDeposit: [
        { name: 'user', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'vault', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
    ],
    AutoCompoundWithdraw: [
        { name: 'user', type: 'address' },
        { name: 'shares', type: 'uint256' },
        { name: 'vault', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
    ]
};
const verifyEIP712Signature = (domain, types, value, signature, expectedSigner) => {
    try {
        const recoveredAddress = ethers_1.ethers.verifyTypedData(domain, types, value, signature);
        return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
    }
    catch (error) {
        logger_1.default.error('EIP-712 signature verification failed:', error);
        return false;
    }
};
exports.verifyEIP712Signature = verifyEIP712Signature;
const generateMessageHash = (domain, types, value) => {
    try {
        return ethers_1.ethers.TypedDataEncoder.hash(domain, types, value);
    }
    catch (error) {
        logger_1.default.error('Failed to generate message hash:', error);
        throw new Error('Failed to generate message hash');
    }
};
exports.generateMessageHash = generateMessageHash;
//# sourceMappingURL=signatureValidation.js.map