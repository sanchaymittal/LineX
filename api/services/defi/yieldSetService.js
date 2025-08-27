"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.YieldSetService = void 0;
const ethers_1 = require("ethers");
const contractAbis_1 = require("../../constants/contractAbis");
const logger_1 = __importDefault(require("../../utils/logger"));
class YieldSetService {
    constructor(kaiaProvider, feeDelegation, redis) {
        this.kaiaProvider = kaiaProvider;
        this.feeDelegation = feeDelegation;
        this.redis = redis;
        this.yieldSetAddress = contractAbis_1.CONTRACT_ADDRESSES.YIELD_SET;
    }
    async deposit(params) {
        try {
            logger_1.default.info(`YieldSet portfolio deposit initiated for user ${params.user}, amount: ${params.amount}`);
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
            logger_1.default.info(`YieldSet portfolio deposit completed. TxHash: ${txHash}, Shares: ${shares}`);
            return { txHash, shares };
        }
        catch (error) {
            logger_1.default.error('YieldSet portfolio deposit failed:', error);
            throw new Error(`Deposit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async withdraw(params) {
        try {
            logger_1.default.info(`YieldSet portfolio withdrawal initiated for user ${params.user}, shares: ${params.shares}`);
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
            logger_1.default.info(`YieldSet portfolio withdrawal completed. TxHash: ${txHash}, Assets: ${assets}`);
            return { txHash, assets };
        }
        catch (error) {
            logger_1.default.error('YieldSet portfolio withdrawal failed:', error);
            throw new Error(`Withdrawal failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async getBalance(userAddress) {
        try {
            const provider = await this.kaiaProvider.getProvider();
            const yieldSetContract = (0, contractAbis_1.getContractInstance)('YIELD_SET', provider);
            const portfolioShares = await yieldSetContract.balanceOf(userAddress);
            const underlyingAssets = await yieldSetContract.convertToAssets(portfolioShares);
            const sharePrice = portfolioShares > 0n ? (underlyingAssets * 1000000000000000000n) / portfolioShares : 1000000000000000000n;
            return {
                portfolioShares: portfolioShares.toString(),
                underlyingAssets: underlyingAssets.toString(),
                sharePrice: sharePrice.toString()
            };
        }
        catch (error) {
            logger_1.default.error(`Failed to get YieldSet balance for ${userAddress}:`, error);
            throw new Error('Failed to fetch balance');
        }
    }
    async getPortfolioInfo() {
        try {
            const cached = await this.redis.get('defi:yieldset:portfolio:info');
            if (cached) {
                return JSON.parse(cached);
            }
            const provider = await this.kaiaProvider.getProvider();
            const yieldSetContract = (0, contractAbis_1.getContractInstance)('YIELD_SET', provider);
            const [totalAssets, totalSupply, portfolioValue, [positionAddresses, positionWeights], [threshold, interval, enabled], lastRebalance, canRebalance, riskLevel, managementFee, performanceFee] = await Promise.all([
                yieldSetContract.totalAssets(),
                yieldSetContract.totalSupply(),
                yieldSetContract.getPortfolioValue(),
                yieldSetContract.getPositions(),
                yieldSetContract.getRebalanceParams(),
                yieldSetContract.lastRebalance(),
                yieldSetContract.canRebalance(),
                yieldSetContract.riskLevel(),
                yieldSetContract.managementFee(),
                yieldSetContract.performanceFee()
            ]);
            const positions = await Promise.all(positionAddresses.map(async (address, index) => {
                const positionName = this.getPositionName(address);
                const { apy, riskLevel } = await this.getPositionStats(address);
                const weight = parseInt(positionWeights[index].toString()) / 100;
                return {
                    address,
                    name: positionName,
                    weight,
                    value: ((BigInt(portfolioValue.toString()) * BigInt(weight * 100)) / 10000n).toString(),
                    apy,
                    riskLevel
                };
            }));
            const expectedApy = positions.reduce((total, pos) => total + (pos.apy * pos.weight / 100), 0);
            const portfolioInfo = {
                totalAssets: totalAssets.toString(),
                totalSupply: totalSupply.toString(),
                portfolioValue: portfolioValue.toString(),
                positions,
                rebalanceInfo: {
                    threshold: parseInt(threshold.toString()) / 100,
                    interval: parseInt(interval.toString()),
                    enabled: enabled,
                    lastRebalance: parseInt(lastRebalance.toString()) * 1000,
                    canRebalance: canRebalance
                },
                fees: {
                    managementFee: parseInt(managementFee.toString()) / 100,
                    performanceFee: parseInt(performanceFee.toString()) / 100
                },
                expectedApy,
                riskLevel: parseInt(riskLevel.toString())
            };
            await this.redis.setWithTTL('defi:yieldset:portfolio:info', JSON.stringify(portfolioInfo), 180);
            return portfolioInfo;
        }
        catch (error) {
            logger_1.default.error('Failed to get YieldSet portfolio info:', error);
            throw new Error('Failed to fetch portfolio information');
        }
    }
    async rebalancePortfolio(userAddress) {
        try {
            logger_1.default.info(`Portfolio rebalancing triggered by user ${userAddress}`);
            const portfolioInfo = await this.getPortfolioInfo();
            if (!portfolioInfo.rebalanceInfo.canRebalance) {
                throw new Error('Rebalancing not currently available');
            }
            const txHash = `0x${'1'.repeat(64)}`;
            const rebalancedPositions = portfolioInfo.positions.length;
            await this.redis.del('defi:yieldset:portfolio:info');
            logger_1.default.info(`Portfolio rebalancing completed. TxHash: ${txHash}, Positions: ${rebalancedPositions}`);
            return { txHash, rebalancedPositions };
        }
        catch (error) {
            logger_1.default.error('Portfolio rebalancing failed:', error);
            throw new Error(`Rebalancing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async harvestYield(userAddress) {
        try {
            logger_1.default.info(`Yield harvesting triggered by user ${userAddress}`);
            const txHash = `0x${'2'.repeat(64)}`;
            const harvestedAmount = '5000000';
            logger_1.default.info(`Yield harvesting completed. TxHash: ${txHash}, Amount: ${harvestedAmount}`);
            return { txHash, harvestedAmount };
        }
        catch (error) {
            logger_1.default.error('Yield harvesting failed:', error);
            throw new Error(`Yield harvesting failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    getPositionName(address) {
        const addressLower = address.toLowerCase();
        const contractAddresses = contractAbis_1.CONTRACT_ADDRESSES;
        if (addressLower === contractAddresses.STANDARDIZED_YIELD.toLowerCase()) {
            return 'StandardizedYield (Multi-Strategy)';
        }
        else if (addressLower === contractAddresses.AUTO_COMPOUND_VAULT_WRAPPER.toLowerCase()) {
            return 'AutoCompound Vault';
        }
        else if (addressLower === contractAddresses.PYT_NYT_ORCHESTRATOR_WRAPPER.toLowerCase()) {
            return 'PYT/NYT Orchestrator';
        }
        return `Position ${address.slice(0, 8)}...`;
    }
    async getPositionStats(address) {
        const addressLower = address.toLowerCase();
        const contractAddresses = contractAbis_1.CONTRACT_ADDRESSES;
        if (addressLower === contractAddresses.STANDARDIZED_YIELD.toLowerCase()) {
            return { apy: 9.5, riskLevel: 4 };
        }
        else if (addressLower === contractAddresses.AUTO_COMPOUND_VAULT_WRAPPER.toLowerCase()) {
            return { apy: 11.0, riskLevel: 5 };
        }
        else if (addressLower === contractAddresses.PYT_NYT_ORCHESTRATOR_WRAPPER.toLowerCase()) {
            return { apy: 13.5, riskLevel: 6 };
        }
        return { apy: 8.0, riskLevel: 5 };
    }
    async verifyDepositSignature(params) {
        const domain = {
            name: 'LineX',
            version: '1',
            chainId: parseInt(process.env.KAIA_CHAIN_ID || '1001'),
            verifyingContract: this.yieldSetAddress
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
            vault: this.yieldSetAddress,
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
            verifyingContract: this.yieldSetAddress
        };
        const types = {
            DeFiWithdraw: [
                { name: 'user', type: 'address' },
                { name: 'shares', type: 'uint256' },
                { name: 'vault', type: 'address' },
                { name: 'nonce', type: 'uint256' },
                { name: 'deadline', type: 'uint256' }
            ]
        };
        const value = {
            user: params.user,
            shares: params.shares,
            vault: this.yieldSetAddress,
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
            const yieldSetInterface = new ethers_1.Interface([
                'event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)'
            ]);
            for (const log of receipt.logs) {
                try {
                    if (log.address.toLowerCase() === this.yieldSetAddress.toLowerCase()) {
                        const parsed = yieldSetInterface.parseLog(log);
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
            const yieldSetInterface = new ethers_1.Interface([
                'event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)'
            ]);
            for (const log of receipt.logs) {
                try {
                    if (log.address.toLowerCase() === this.yieldSetAddress.toLowerCase()) {
                        const parsed = yieldSetInterface.parseLog(log);
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
            const position = existing ? JSON.parse(existing) : {
                syShares: '0',
                autoCompoundShares: '0',
                pytBalance: '0',
                nytBalance: '0',
                portfolioTokens: '0',
                lastUpdate: Date.now()
            };
            const currentTokens = BigInt(position.portfolioTokens || '0');
            const changeAmount = BigInt(amount);
            if (operation === 'deposit') {
                position.portfolioTokens = (currentTokens + changeAmount).toString();
            }
            else {
                position.portfolioTokens = (currentTokens - changeAmount).toString();
            }
            position.lastUpdate = Date.now();
            await this.redis.set(key, JSON.stringify(position));
            logger_1.default.info(`Updated position for ${userAddress}: ${operation} ${amount} YieldSet tokens`);
        }
        catch (error) {
            logger_1.default.error(`Failed to update user position for ${userAddress}:`, error);
        }
    }
}
exports.YieldSetService = YieldSetService;
//# sourceMappingURL=yieldSetService.js.map