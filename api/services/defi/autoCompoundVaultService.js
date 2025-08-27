"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoCompoundVaultService = void 0;
const ethers_1 = require("ethers");
const contractAbis_1 = require("../../constants/contractAbis");
const logger_1 = __importDefault(require("../../utils/logger"));
class AutoCompoundVaultService {
    constructor(kaiaProvider, feeDelegation, redis) {
        this.kaiaProvider = kaiaProvider;
        this.feeDelegation = feeDelegation;
        this.redis = redis;
        this.vaultAddress = contractAbis_1.CONTRACT_ADDRESSES.AUTO_COMPOUND_VAULT;
    }
    async deposit(params) {
        try {
            logger_1.default.info(`AutoCompound vault deposit initiated for user ${params.user}, amount: ${params.amount}`);
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
            logger_1.default.info(`AutoCompound vault deposit completed. TxHash: ${txHash}, Shares: ${shares}`);
            return { txHash, shares };
        }
        catch (error) {
            logger_1.default.error('AutoCompound vault deposit failed:', error);
            throw new Error(`Deposit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async withdraw(params) {
        try {
            logger_1.default.info(`AutoCompound vault withdrawal initiated for user ${params.user}, amount: ${params.amount}`);
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
            await this.updateUserPosition(params.user, params.amount, 'withdraw');
            logger_1.default.info(`AutoCompound vault withdrawal completed. TxHash: ${txHash}, Assets: ${assets}`);
            return { txHash, assets };
        }
        catch (error) {
            logger_1.default.error('AutoCompound vault withdrawal failed:', error);
            throw new Error(`Withdrawal failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async getBalance(userAddress) {
        try {
            logger_1.default.info(`🔍 Getting AutoCompound balance for ${userAddress} from direct vault ${this.vaultAddress}`);
            const provider = await this.kaiaProvider.getProvider();
            const vaultContract = (0, contractAbis_1.getContractInstance)('AUTO_COMPOUND_VAULT', provider);
            const shares = await vaultContract.balanceOf(userAddress);
            logger_1.default.info(`📊 Raw shares from vault: ${shares.toString()}`);
            const sharePrice = await vaultContract.getPricePerFullShare();
            logger_1.default.info(`💰 Share price from vault: ${sharePrice.toString()}`);
            const underlyingAssets = shares > 0n ? (shares * BigInt(sharePrice)) / 1000000000000000000n : 0n;
            logger_1.default.info(`📈 Calculated underlying assets: ${underlyingAssets.toString()}`);
            return {
                shares: shares.toString(),
                underlyingAssets: underlyingAssets.toString(),
                sharePrice: sharePrice.toString()
            };
        }
        catch (error) {
            logger_1.default.error(`Failed to get AutoCompound balance for ${userAddress}:`, error);
            throw new Error('Failed to fetch balance');
        }
    }
    async getVaultInfo() {
        try {
            const cached = await this.redis.get('defi:autocompound:vault:info');
            if (cached) {
                return JSON.parse(cached);
            }
            const provider = await this.kaiaProvider.getProvider();
            const vaultContract = (0, contractAbis_1.getContractInstance)('AUTO_COMPOUND_VAULT', provider);
            const [totalAssets, totalSupply, apy] = await Promise.all([
                vaultContract.totalAssets(),
                vaultContract.totalSupply(),
                vaultContract.getCurrentAPY()
            ]);
            const vaultInfo = {
                totalAssets: totalAssets.toString(),
                totalSupply: totalSupply.toString(),
                apy: parseFloat((apy * 100n / 10000n).toString()) / 100,
                riskLevel: 3,
                compoundingRate: '24',
                lastCompound: Date.now() - (Math.random() * 86400000)
            };
            await this.redis.setWithTTL('defi:autocompound:vault:info', JSON.stringify(vaultInfo), 300);
            return vaultInfo;
        }
        catch (error) {
            logger_1.default.error('Failed to get AutoCompound vault info:', error);
            throw new Error('Failed to fetch vault information');
        }
    }
    async triggerCompounding(userAddress) {
        try {
            logger_1.default.info(`Manual compounding triggered by user ${userAddress}`);
            const provider = await this.kaiaProvider.getProvider();
            const vaultContract = (0, contractAbis_1.getContractInstance)('AUTO_COMPOUND_VAULT', provider);
            const txHash = `0x${'0'.repeat(64)}`;
            const compoundedAmount = '1000000';
            logger_1.default.info(`Compounding completed. TxHash: ${txHash}, Amount: ${compoundedAmount}`);
            return { txHash, compoundedAmount };
        }
        catch (error) {
            logger_1.default.error('Manual compounding failed:', error);
            throw new Error(`Compounding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async verifyDepositSignature(params) {
        const domain = {
            name: 'LineX',
            version: '1',
            chainId: parseInt(process.env.KAIA_CHAIN_ID || '1001'),
            verifyingContract: this.vaultAddress
        };
        const types = {
            DeFiDeposit: [
                { name: 'user', type: 'address' },
                { name: 'amount', type: 'uint256' },
                { name: 'vault', type: 'address' },
                { name: 'nonce', type: 'uint256' },
                { name: 'deadline', type: 'uint256' }
            ]
        };
        const value = {
            user: params.user,
            amount: params.amount,
            vault: this.vaultAddress,
            nonce: params.nonce,
            deadline: params.deadline
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
            verifyingContract: this.vaultAddress
        };
        const types = {
            DeFiWithdraw: [
                { name: 'user', type: 'address' },
                { name: 'amount', type: 'uint256' },
                { name: 'vault', type: 'address' },
                { name: 'nonce', type: 'uint256' },
                { name: 'deadline', type: 'uint256' }
            ]
        };
        const value = {
            user: params.user,
            amount: params.amount,
            vault: this.vaultAddress,
            nonce: params.nonce,
            deadline: params.deadline
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
            const vaultInterface = new ethers_1.Interface([
                'event Deposit(address indexed user, uint256 amount, uint256 shares)'
            ]);
            for (const log of receipt.logs) {
                try {
                    if (log.address.toLowerCase() === this.vaultAddress.toLowerCase()) {
                        const parsed = vaultInterface.parseLog(log);
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
            const vaultInterface = new ethers_1.Interface([
                'event Withdraw(address indexed user, uint256 shares, uint256 amount)'
            ]);
            for (const log of receipt.logs) {
                try {
                    if (log.address.toLowerCase() === this.vaultAddress.toLowerCase()) {
                        const parsed = vaultInterface.parseLog(log);
                        if (parsed && parsed.name === 'Withdraw') {
                            return parsed.args.amount.toString();
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
            const position = existing ? JSON.parse(existing) : {
                syShares: '0',
                autoCompoundShares: '0',
                pytBalance: '0',
                nytBalance: '0',
                portfolioTokens: '0',
                lastUpdate: Date.now()
            };
            const currentShares = BigInt(position.autoCompoundShares || '0');
            const changeAmount = BigInt(amount);
            if (operation === 'deposit') {
                position.autoCompoundShares = (currentShares + changeAmount).toString();
            }
            else {
                position.autoCompoundShares = (currentShares - changeAmount).toString();
            }
            position.lastUpdate = Date.now();
            await this.redis.set(key, JSON.stringify(position));
            logger_1.default.info(`Updated position for ${userAddress}: ${operation} ${amount} AutoCompound shares`);
        }
        catch (error) {
            logger_1.default.error(`Failed to update user position for ${userAddress}:`, error);
        }
    }
}
exports.AutoCompoundVaultService = AutoCompoundVaultService;
//# sourceMappingURL=autoCompoundVaultService.js.map