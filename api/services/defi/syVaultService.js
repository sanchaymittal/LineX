"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYVaultService = void 0;
const ethers_1 = require("ethers");
const contractAbis_1 = require("../../constants/contractAbis");
const logger_1 = __importDefault(require("../../utils/logger"));
class SYVaultService {
    constructor(kaiaProvider, feeDelegation, redis) {
        this.kaiaProvider = kaiaProvider;
        this.feeDelegation = feeDelegation;
        this.redis = redis;
        this.syVaultAddress = contractAbis_1.CONTRACT_ADDRESSES.STANDARDIZED_YIELD_VAULT;
    }
    async deposit(params) {
        try {
            logger_1.default.info(`SY vault deposit initiated for user ${params.user}, amount: ${params.amount}`);
            await this.verifyDepositSignature(params);
            if (!params.senderRawTransaction) {
                throw new Error('senderRawTransaction is required for fee-delegated deposits');
            }
            const result = await this.feeDelegation.executeFeeDelegatedTransaction(params.senderRawTransaction);
            if (!result.success) {
                throw new Error(result.error || 'Deposit transaction failed');
            }
            const txHash = result.transactionHash;
            const shares = await this.getDepositedShares(txHash);
            await this.updateUserPosition(params.user, shares, 'deposit');
            logger_1.default.info(`SY vault deposit completed. TxHash: ${txHash}, Shares: ${shares}`);
            return { txHash, shares };
        }
        catch (error) {
            logger_1.default.error('SY vault deposit failed:', error);
            throw new Error(`Deposit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async withdraw(params) {
        try {
            logger_1.default.info(`SY vault withdrawal initiated for user ${params.user}, shares: ${params.shares}`);
            await this.verifyWithdrawSignature(params);
            if (!params.senderRawTransaction) {
                throw new Error('senderRawTransaction is required for fee-delegated withdrawals');
            }
            const result = await this.feeDelegation.executeFeeDelegatedTransaction(params.senderRawTransaction);
            if (!result.success) {
                throw new Error(result.error || 'Withdrawal transaction failed');
            }
            const txHash = result.transactionHash;
            const assets = await this.getWithdrawnAssets(txHash);
            await this.updateUserPosition(params.user, params.shares, 'withdraw');
            logger_1.default.info(`SY vault withdrawal completed. TxHash: ${txHash}, Assets: ${assets}`);
            return { txHash, assets };
        }
        catch (error) {
            logger_1.default.error('SY vault withdrawal failed:', error);
            throw new Error(`Withdrawal failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async getBalance(userAddress) {
        try {
            const provider = await this.kaiaProvider.getProvider();
            const syVaultContract = (0, contractAbis_1.getContractInstance)('STANDARDIZED_YIELD_VAULT', provider);
            const syShares = await syVaultContract.balanceOf(userAddress);
            const underlyingAssets = await syVaultContract.convertToAssets(syShares);
            const sharePrice = syShares > 0n ? (underlyingAssets * 1000000n) / syShares : 1000000n;
            return {
                syShares: syShares.toString(),
                underlyingAssets: underlyingAssets.toString(),
                sharePrice: sharePrice.toString(),
            };
        }
        catch (error) {
            logger_1.default.error(`Failed to get SY balance for ${userAddress}:`, error);
            throw new Error('Failed to fetch balance');
        }
    }
    async getVaultInfo() {
        try {
            const cached = await this.redis.get('defi:sy:vault:info');
            if (cached) {
                return JSON.parse(cached);
            }
            const provider = await this.kaiaProvider.getProvider();
            const syVaultContract = (0, contractAbis_1.getContractInstance)('STANDARDIZED_YIELD_VAULT', provider);
            const [totalAssets, totalSupply, apy] = await Promise.all([
                syVaultContract.totalAssets(),
                syVaultContract.totalSupply(),
                syVaultContract.getAPY(),
            ]);
            const strategies = [
                { address: this.syVaultAddress, allocation: 100, apy: parseFloat(apy.toString()) / 100 },
            ];
            const vaultInfo = {
                totalAssets: totalAssets.toString(),
                totalSupply: totalSupply.toString(),
                apy: parseFloat(apy.toString()) / 100,
                strategies,
            };
            await this.redis.setWithTTL('defi:sy:vault:info', JSON.stringify(vaultInfo), 300);
            return vaultInfo;
        }
        catch (error) {
            logger_1.default.error('Failed to get vault info:', error);
            throw new Error('Failed to fetch vault information');
        }
    }
    async verifyDepositSignature(params) {
        const domain = {
            name: 'LineX',
            version: '1',
            chainId: parseInt(process.env.KAIA_CHAIN_ID || '1001'),
            verifyingContract: this.syVaultAddress,
        };
        const types = {
            DeFiDeposit: [
                { name: 'user', type: 'address' },
                { name: 'amount', type: 'uint256' },
                { name: 'vault', type: 'address' },
                { name: 'nonce', type: 'uint256' },
                { name: 'deadline', type: 'uint256' },
            ],
        };
        const value = {
            user: params.user,
            amount: params.amount,
            vault: this.syVaultAddress,
            nonce: params.nonce,
            deadline: params.deadline,
        };
        const recoveredAddress = (0, ethers_1.verifyTypedData)(domain, types, value, params.signature);
        if (recoveredAddress.toLowerCase() !== params.user.toLowerCase()) {
            throw new Error('Invalid signature');
        }
        if (Date.now() > params.deadline * 1000) {
            throw new Error('Signature expired');
        }
    }
    async verifyWithdrawSignature(params) {
        const domain = {
            name: 'LineX',
            version: '1',
            chainId: parseInt(process.env.KAIA_CHAIN_ID || '1001'),
            verifyingContract: this.syVaultAddress,
        };
        const types = {
            DeFiWithdraw: [
                { name: 'user', type: 'address' },
                { name: 'shares', type: 'uint256' },
                { name: 'vault', type: 'address' },
                { name: 'nonce', type: 'uint256' },
                { name: 'deadline', type: 'uint256' },
            ],
        };
        const value = {
            user: params.user,
            shares: params.shares,
            vault: this.syVaultAddress,
            nonce: params.nonce,
            deadline: params.deadline,
        };
        const recoveredAddress = (0, ethers_1.verifyTypedData)(domain, types, value, params.signature);
        if (recoveredAddress.toLowerCase() !== params.user.toLowerCase()) {
            throw new Error('Invalid signature');
        }
        if (Date.now() > params.deadline * 1000) {
            throw new Error('Signature expired');
        }
    }
    async getDepositedShares(txHash) {
        try {
            const provider = await this.kaiaProvider.getProvider();
            const receipt = await provider.getTransactionReceipt(txHash);
            const syVaultInterface = new ethers_1.Interface([
                'event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)',
            ]);
            for (const log of receipt.logs) {
                try {
                    if (log.address.toLowerCase() === this.syVaultAddress.toLowerCase()) {
                        const parsed = syVaultInterface.parseLog(log);
                        if (parsed && parsed.name === 'Deposit') {
                            return parsed.args.shares.toString();
                        }
                    }
                }
                catch (e) {
                }
            }
            throw new Error('Deposit event not found in transaction');
        }
        catch (error) {
            logger_1.default.error(`Failed to get deposited shares from tx ${txHash}:`, error);
            throw error;
        }
    }
    async getWithdrawnAssets(txHash) {
        try {
            const provider = await this.kaiaProvider.getProvider();
            const receipt = await provider.getTransactionReceipt(txHash);
            const syVaultInterface = new ethers_1.Interface([
                'event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)',
            ]);
            for (const log of receipt.logs) {
                try {
                    if (log.address.toLowerCase() === this.syVaultAddress.toLowerCase()) {
                        const parsed = syVaultInterface.parseLog(log);
                        if (parsed && parsed.name === 'Withdraw') {
                            return parsed.args.assets.toString();
                        }
                    }
                }
                catch (e) {
                }
            }
            throw new Error('Withdraw event not found in transaction');
        }
        catch (error) {
            logger_1.default.error(`Failed to get withdrawn assets from tx ${txHash}:`, error);
            throw error;
        }
    }
    async updateUserPosition(userAddress, amount, operation) {
        try {
            const key = `defi:positions:${userAddress}`;
            const existing = await this.redis.get(key);
            const position = existing
                ? JSON.parse(existing)
                : {
                    syShares: '0',
                    pytBalance: '0',
                    nytBalance: '0',
                    portfolioTokens: '0',
                    lastUpdate: Date.now(),
                };
            const currentShares = BigInt(position.syShares || '0');
            const changeAmount = BigInt(amount);
            if (operation === 'deposit') {
                position.syShares = (currentShares + changeAmount).toString();
            }
            else {
                position.syShares = (currentShares - changeAmount).toString();
            }
            position.lastUpdate = Date.now();
            await this.redis.set(key, JSON.stringify(position));
            logger_1.default.info(`Updated position for ${userAddress}: ${operation} ${amount} SY shares`);
        }
        catch (error) {
            logger_1.default.error(`Failed to update user position for ${userAddress}:`, error);
        }
    }
}
exports.SYVaultService = SYVaultService;
//# sourceMappingURL=syVaultService.js.map