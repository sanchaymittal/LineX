"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ethers_ext_1 = require("@kaiachain/ethers-ext");
const feeDelegationService_1 = require("../../services/blockchain/feeDelegationService");
const logger_1 = __importDefault(require("../../utils/logger"));
const router = (0, express_1.Router)();
router.post('/deposit', async (req, res) => {
    try {
        const { privateKey, userAddress, vaultAddress, amount } = req.body;
        if (!privateKey || !userAddress || !vaultAddress || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: privateKey, userAddress, vaultAddress, amount'
            });
        }
        logger_1.default.info('🔐 Generating fee-delegated SY vault deposit signature', {
            userAddress,
            vaultAddress,
            amount
        });
        const provider = new ethers_ext_1.JsonRpcProvider('https://public-en-kairos.node.kaia.io', {
            chainId: 1001,
            name: 'Kaia Testnet (Kairos)'
        });
        const senderWallet = new ethers_ext_1.Wallet(privateKey, provider);
        if (senderWallet.address.toLowerCase() !== userAddress.toLowerCase()) {
            return res.status(400).json({
                success: false,
                error: `Address mismatch: private key corresponds to ${senderWallet.address}, not ${userAddress}`
            });
        }
        const depositSelector = '0x6e553f65';
        const paddedAmount = BigInt(amount).toString(16).padStart(64, '0');
        const paddedReceiver = userAddress.slice(2).padStart(64, '0');
        const depositData = depositSelector + paddedAmount + paddedReceiver;
        const txRequest = {
            type: ethers_ext_1.TxType.FeeDelegatedSmartContractExecution,
            from: userAddress,
            to: vaultAddress,
            data: depositData,
            gasLimit: 500000,
            value: 0
        };
        const populatedTx = await senderWallet.populateTransaction(txRequest);
        const senderTxHashRLP = await senderWallet.signTransaction(populatedTx);
        logger_1.default.info('✅ Fee-delegated SY vault deposit signature generated', {
            userAddress,
            transactionType: populatedTx.type,
            gasLimit: populatedTx.gasLimit,
            nonce: populatedTx.nonce
        });
        return res.json({
            success: true,
            data: {
                senderRawTransaction: senderTxHashRLP,
                transactionDetails: {
                    type: populatedTx.type,
                    from: populatedTx.from,
                    to: populatedTx.to,
                    gasLimit: populatedTx.gasLimit?.toString(),
                    gasPrice: populatedTx.gasPrice?.toString(),
                    nonce: populatedTx.nonce,
                    dataLength: populatedTx.data?.length
                }
            }
        });
    }
    catch (error) {
        logger_1.default.error('❌ Failed to generate SY vault deposit signature', {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            error: `Signature generation failed: ${error.message}`
        });
    }
});
router.post('/deposit/sy', async (req, res) => {
    try {
        const { privateKey, userAddress, vaultAddress, amount } = req.body;
        if (!privateKey || !userAddress || !vaultAddress || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: privateKey, userAddress, vaultAddress, amount'
            });
        }
        logger_1.default.info('🔐 Generating fee-delegated SY vault deposit signature', {
            userAddress,
            vaultAddress,
            amount
        });
        const provider = new ethers_ext_1.JsonRpcProvider('https://public-en-kairos.node.kaia.io', {
            chainId: 1001,
            name: 'Kaia Testnet (Kairos)'
        });
        const senderWallet = new ethers_ext_1.Wallet(privateKey, provider);
        if (senderWallet.address.toLowerCase() !== userAddress.toLowerCase()) {
            return res.status(400).json({
                success: false,
                error: `Address mismatch: private key corresponds to ${senderWallet.address}, not ${userAddress}`
            });
        }
        const depositSelector = '0x6e553f65';
        const paddedAmount = BigInt(amount).toString(16).padStart(64, '0');
        const paddedReceiver = userAddress.slice(2).padStart(64, '0');
        const depositData = depositSelector + paddedAmount + paddedReceiver;
        const txRequest = {
            type: ethers_ext_1.TxType.FeeDelegatedSmartContractExecution,
            from: userAddress,
            to: vaultAddress,
            data: depositData,
            gasLimit: 500000,
            value: 0
        };
        const populatedTx = await senderWallet.populateTransaction(txRequest);
        const senderTxHashRLP = await senderWallet.signTransaction(populatedTx);
        logger_1.default.info('✅ Fee-delegated SY vault deposit signature generated', {
            userAddress,
            transactionType: populatedTx.type,
            gasLimit: populatedTx.gasLimit,
            nonce: populatedTx.nonce
        });
        return res.json({
            success: true,
            data: {
                senderRawTransaction: senderTxHashRLP,
                transactionDetails: {
                    type: populatedTx.type,
                    from: populatedTx.from,
                    to: populatedTx.to,
                    gasLimit: populatedTx.gasLimit?.toString(),
                    gasPrice: populatedTx.gasPrice?.toString(),
                    nonce: populatedTx.nonce,
                    dataLength: populatedTx.data?.length
                }
            }
        });
    }
    catch (error) {
        logger_1.default.error('❌ Failed to generate SY vault deposit signature', {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            error: `Signature generation failed: ${error.message}`
        });
    }
});
router.post('/deposit/autocompound', async (req, res) => {
    try {
        const { privateKey, userAddress, vaultAddress, amount } = req.body;
        if (!privateKey || !userAddress || !vaultAddress || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: privateKey, userAddress, vaultAddress, amount'
            });
        }
        logger_1.default.info('🔐 Generating fee-delegated AutoCompound deposit signature', {
            userAddress,
            vaultAddress,
            amount
        });
        const provider = new ethers_ext_1.JsonRpcProvider('https://public-en-kairos.node.kaia.io', {
            chainId: 1001,
            name: 'Kaia Testnet (Kairos)'
        });
        const senderWallet = new ethers_ext_1.Wallet(privateKey, provider);
        if (senderWallet.address.toLowerCase() !== userAddress.toLowerCase()) {
            return res.status(400).json({
                success: false,
                error: `Address mismatch: private key corresponds to ${senderWallet.address}, not ${userAddress}`
            });
        }
        const depositSelector = '0xb6b55f25';
        const paddedAmount = BigInt(amount).toString(16).padStart(64, '0');
        const depositData = depositSelector + paddedAmount;
        const txRequest = {
            type: ethers_ext_1.TxType.FeeDelegatedSmartContractExecution,
            from: userAddress,
            to: vaultAddress,
            data: depositData,
            gasLimit: 500000,
            value: 0
        };
        const populatedTx = await senderWallet.populateTransaction(txRequest);
        const senderTxHashRLP = await senderWallet.signTransaction(populatedTx);
        logger_1.default.info('✅ Fee-delegated AutoCompound deposit signature generated', {
            userAddress,
            transactionType: populatedTx.type,
            gasLimit: populatedTx.gasLimit,
            nonce: populatedTx.nonce
        });
        return res.json({
            success: true,
            data: {
                senderRawTransaction: senderTxHashRLP,
                transactionDetails: {
                    type: populatedTx.type,
                    from: populatedTx.from,
                    to: populatedTx.to,
                    gasLimit: populatedTx.gasLimit?.toString(),
                    gasPrice: populatedTx.gasPrice?.toString(),
                    nonce: populatedTx.nonce,
                    dataLength: populatedTx.data?.length
                }
            }
        });
    }
    catch (error) {
        logger_1.default.error('❌ Failed to generate AutoCompound deposit signature', {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            error: `Signature generation failed: ${error.message}`
        });
    }
});
router.post('/approval', async (req, res) => {
    try {
        const { privateKey, userAddress, tokenAddress, spenderAddress, amount } = req.body;
        if (!privateKey || !userAddress || !tokenAddress || !spenderAddress || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: privateKey, userAddress, tokenAddress, spenderAddress, amount'
            });
        }
        logger_1.default.info('🔐 Generating fee-delegated approval signature', {
            userAddress,
            tokenAddress,
            spenderAddress,
            amount
        });
        const provider = new ethers_ext_1.JsonRpcProvider('https://public-en-kairos.node.kaia.io', {
            chainId: 1001,
            name: 'Kaia Testnet (Kairos)'
        });
        const senderWallet = new ethers_ext_1.Wallet(privateKey, provider);
        if (senderWallet.address.toLowerCase() !== userAddress.toLowerCase()) {
            return res.status(400).json({
                success: false,
                error: `Address mismatch: private key corresponds to ${senderWallet.address}, not ${userAddress}`
            });
        }
        const approveSelector = '0x095ea7b3';
        const paddedSpender = spenderAddress.slice(2).padStart(64, '0');
        const paddedAmount = BigInt(amount).toString(16).padStart(64, '0');
        const approveData = approveSelector + paddedSpender + paddedAmount;
        const txRequest = {
            type: ethers_ext_1.TxType.FeeDelegatedSmartContractExecution,
            from: userAddress,
            to: tokenAddress,
            data: approveData,
            gasLimit: 100000,
            value: 0
        };
        const populatedTx = await senderWallet.populateTransaction(txRequest);
        const senderTxHashRLP = await senderWallet.signTransaction(populatedTx);
        logger_1.default.info('✅ Fee-delegated approval signature generated', {
            userAddress,
            transactionType: populatedTx.type,
            gasLimit: populatedTx.gasLimit,
            nonce: populatedTx.nonce
        });
        return res.json({
            success: true,
            data: {
                senderRawTransaction: senderTxHashRLP,
                transactionDetails: {
                    type: populatedTx.type,
                    from: populatedTx.from,
                    to: populatedTx.to,
                    gasLimit: populatedTx.gasLimit?.toString(),
                    gasPrice: populatedTx.gasPrice?.toString(),
                    nonce: populatedTx.nonce,
                    dataLength: populatedTx.data?.length
                }
            }
        });
    }
    catch (error) {
        logger_1.default.error('❌ Failed to generate approval signature', {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            error: `Signature generation failed: ${error.message}`
        });
    }
});
router.post('/execute', async (req, res) => {
    try {
        const { senderRawTransaction } = req.body;
        if (!senderRawTransaction) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameter: senderRawTransaction'
            });
        }
        logger_1.default.info('🚀 Executing fee-delegated transaction via API');
        const result = await feeDelegationService_1.feeDelegationService.executeFeeDelegatedTransaction(senderRawTransaction);
        if (!result.success) {
            logger_1.default.error('❌ Fee-delegated transaction failed on-chain', {
                error: result.error,
                transactionHash: result.transactionHash,
                blockNumber: result.blockNumber
            });
            return res.status(400).json({
                success: false,
                error: result.error || 'Transaction failed on-chain',
                data: {
                    transactionHash: result.transactionHash,
                    blockNumber: result.blockNumber
                }
            });
        }
        logger_1.default.info('✅ Fee-delegated transaction executed successfully', {
            transactionHash: result.transactionHash,
            blockNumber: result.blockNumber
        });
        return res.json({
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
        logger_1.default.error('❌ Fee-delegated transaction execution failed', {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            error: `Transaction execution failed: ${error.message}`
        });
    }
});
exports.default = router;
//# sourceMappingURL=signatures.js.map