"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.feeDelegationService = exports.FeeDelegationService = void 0;
const ethers_ext_1 = require("@kaiachain/ethers-ext");
const provider_1 = require("./provider");
const contracts_1 = require("../../types/contracts");
const logger_1 = __importDefault(require("../../utils/logger"));
const config_1 = __importDefault(require("../../config"));
class FeeDelegationService {
    constructor() {
        this.gasPayerWallet = null;
    }
    initializeGasPayer() {
        try {
            const privateKey = config_1.default.blockchain.gasPayerPrivateKey;
            if (!privateKey) {
                throw new Error('Gas payer private key not configured');
            }
            if (!provider_1.kaiaProvider.isProviderConnected()) {
                throw new Error('Kaia provider not connected');
            }
            const provider = provider_1.kaiaProvider.getProvider();
            this.gasPayerWallet = new ethers_ext_1.Wallet(privateKey, provider);
            logger_1.default.info('✅ Fee delegation service initialized', {
                gasPayerAddress: this.gasPayerWallet.address,
            });
        }
        catch (error) {
            logger_1.default.error('❌ Failed to initialize fee delegation service:', error);
            throw error;
        }
    }
    ensureGasPayer() {
        if (!this.gasPayerWallet) {
            this.initializeGasPayer();
        }
        if (!this.gasPayerWallet) {
            throw new Error('Gas payer wallet not initialized');
        }
        return this.gasPayerWallet;
    }
    getGasPayerAddress() {
        const gasPayer = this.ensureGasPayer();
        return gasPayer.address;
    }
    async createFeeDelegatedTransaction(params) {
        try {
            logger_1.default.info('📝 Creating fee-delegated transaction', {
                type: params.type,
                from: params.from,
                to: params.to,
                hasData: !!params.data
            });
            let tx = {
                type: params.type,
                from: params.from,
                to: params.to,
            };
            if (params.value) {
                tx.value = params.value;
            }
            if (params.data) {
                tx.data = params.data;
            }
            if (params.gasLimit) {
                tx.gasLimit = params.gasLimit;
            }
            return tx;
        }
        catch (error) {
            logger_1.default.error('❌ Failed to create fee-delegated transaction:', error);
            throw error;
        }
    }
    async signTransactionEIP712(userWallet, transaction) {
        try {
            logger_1.default.info('📝 Signing transaction with EIP-712', {
                from: transaction.from,
                to: transaction.to
            });
            const populatedTx = await userWallet.populateTransaction(transaction);
            logger_1.default.info('📋 Transaction populated', populatedTx);
            const senderTxHashRLP = await userWallet.signTransaction(populatedTx);
            logger_1.default.info('✅ Transaction signed with EIP-712', {
                senderTxHashRLP: senderTxHashRLP.substring(0, 20) + '...'
            });
            return senderTxHashRLP;
        }
        catch (error) {
            logger_1.default.error('❌ Failed to sign transaction with EIP-712:', error);
            throw error;
        }
    }
    async signTransaction(userWallet, transaction) {
        try {
            logger_1.default.info('📝 Signing transaction', {
                from: transaction.from,
                to: transaction.to
            });
            const populatedTx = await userWallet.populateTransaction(transaction);
            logger_1.default.info('📋 Transaction populated', populatedTx);
            const senderTxHashRLP = await userWallet.signTransaction(populatedTx);
            logger_1.default.info('✅ Transaction signed', {
                senderTxHashRLP: senderTxHashRLP.substring(0, 20) + '...'
            });
            return senderTxHashRLP;
        }
        catch (error) {
            logger_1.default.error('❌ Failed to sign transaction:', error);
            throw error;
        }
    }
    async executeFeeDelegatedTransaction(senderTxHashRLP) {
        try {
            const feePayerWallet = this.ensureGasPayer();
            logger_1.default.info('🔄 Processing fee-delegated transaction', {
                gasPayerAddress: feePayerWallet.address,
                hasSenderTx: !!senderTxHashRLP
            });
            const sentTx = await feePayerWallet.sendTransactionAsFeePayer(senderTxHashRLP);
            logger_1.default.info('📡 Fee-delegated transaction submitted', {
                transactionHash: sentTx.hash
            });
            const receipt = await sentTx.wait();
            if (receipt.status === 0) {
                let revertReason = 'Transaction failed on-chain (status: 0)';
                try {
                    const provider = provider_1.kaiaProvider.getProvider();
                    const tx = await provider.getTransaction(receipt.transactionHash);
                    if (tx && tx.data && tx.to) {
                        try {
                            await provider.call({
                                to: tx.to,
                                data: tx.data,
                                from: tx.from
                            });
                        }
                        catch (callError) {
                            if (callError.reason) {
                                revertReason = `Contract reverted: ${callError.reason}`;
                            }
                            else if (callError.message) {
                                const reasonMatch = callError.message.match(/execution reverted: (.*?)"/);
                                if (reasonMatch && reasonMatch[1]) {
                                    revertReason = `Contract reverted: ${reasonMatch[1]}`;
                                }
                                else {
                                    revertReason = `Contract call failed: ${callError.message}`;
                                }
                            }
                        }
                    }
                }
                catch (debugError) {
                    logger_1.default.error('Failed to decode revert reason', debugError);
                }
                logger_1.default.error('❌ Fee-delegated transaction failed on-chain', {
                    transactionHash: receipt.transactionHash,
                    blockNumber: receipt.blockNumber,
                    status: receipt.status,
                    gasUsed: receipt.gasUsed?.toString(),
                    revertReason
                });
                return {
                    success: false,
                    error: revertReason,
                    transactionHash: receipt.transactionHash,
                    blockNumber: receipt.blockNumber
                };
            }
            logger_1.default.info('✅ Fee-delegated transaction confirmed', {
                transactionHash: receipt.transactionHash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed?.toString()
            });
            if (receipt.transactionHash) {
                return {
                    success: true,
                    transactionHash: receipt.transactionHash,
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed ? BigInt(receipt.gasUsed.toString()) : undefined
                };
            }
            else {
                return {
                    success: false,
                    error: 'Transaction failed - no transaction hash returned'
                };
            }
        }
        catch (error) {
            logger_1.default.error('❌ Fee delegation failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown fee delegation error'
            };
        }
    }
    async executeGaslessApproval(request) {
        const spender = request.spenderAddress || this.getGasPayerAddress();
        logger_1.default.info('🔑 Processing gasless approval request', {
            userAddress: request.userAddress,
            spender,
            amount: request.amount,
            hasPreSignedTx: !!request.senderRawTransaction
        });
        if (request.senderRawTransaction) {
            logger_1.default.info('✅ Using fee-delegated approval transaction');
            return await this.executeFeeDelegatedTransaction(request.senderRawTransaction);
        }
        logger_1.default.info('ℹ️ No pre-signed transaction provided - manual approval required');
        return {
            success: false,
            error: 'Manual approval required. User must provide pre-signed fee-delegated transaction.',
        };
    }
    async executeAuthorizedFaucetClaim(request) {
        logger_1.default.info('🚰 Processing fee-delegated faucet claim', {
            userAddress: request.userAddress,
            hasPreSignedTx: !!request.senderRawTransaction
        });
        if (request.senderRawTransaction) {
            logger_1.default.info('✅ Using fee-delegated faucet transaction');
            return await this.executeFeeDelegatedTransaction(request.senderRawTransaction);
        }
        try {
            const gasPayer = this.ensureGasPayer();
            logger_1.default.info('🚰 Executing direct faucet claim (fallback)', {
                userAddress: request.userAddress,
                gasPayerAddress: gasPayer.address,
            });
            const faucetAmount = BigInt(contracts_1.CONTRACT_CONSTANTS.FAUCET_AMOUNT_USDT * 10 ** contracts_1.CONTRACT_CONSTANTS.DECIMALS);
            const mintData = this.buildMintCall(request.userAddress, faucetAmount);
            const faucetTx = {
                to: contracts_1.CONTRACT_CONSTANTS.ADDRESS,
                data: mintData,
                gasLimit: 100000,
            };
            const tx = await gasPayer.sendTransaction(faucetTx);
            const receipt = await tx.wait();
            if (receipt.status === 1) {
                logger_1.default.info('✅ Direct faucet claim successful', {
                    userAddress: request.userAddress,
                    transactionHash: tx.hash
                });
                return {
                    success: true,
                    transactionHash: tx.hash,
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed ? BigInt(receipt.gasUsed.toString()) : undefined
                };
            }
            else {
                return {
                    success: false,
                    error: 'Faucet transaction failed'
                };
            }
        }
        catch (error) {
            logger_1.default.error('❌ Faucet claim failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown faucet error'
            };
        }
    }
    buildMintCall(userAddress, amount) {
        const functionSelector = '0x40c10f19';
        const paddedAddress = userAddress.slice(2).padStart(64, '0');
        const paddedAmount = amount.toString(16).padStart(64, '0');
        return functionSelector + paddedAddress + paddedAmount;
    }
    async createApproveTransaction(userAddress, spenderAddress, amount) {
        return await this.createFeeDelegatedTransaction({
            type: ethers_ext_1.TxType.FeeDelegatedSmartContractExecution,
            from: userAddress,
            to: contracts_1.CONTRACT_CONSTANTS.ADDRESS,
            data: this.buildApproveCall(spenderAddress, amount),
            gasLimit: 100000
        });
    }
    buildApproveCall(spenderAddress, amount) {
        const functionSelector = '0x095ea7b3';
        const paddedSpender = spenderAddress.slice(2).padStart(64, '0');
        const paddedAmount = amount.toString(16).padStart(64, '0');
        return functionSelector + paddedSpender + paddedAmount;
    }
}
exports.FeeDelegationService = FeeDelegationService;
exports.feeDelegationService = new FeeDelegationService();
//# sourceMappingURL=feeDelegationService.js.map