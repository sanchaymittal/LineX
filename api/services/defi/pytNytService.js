"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PYTNYTService = void 0;
const ethers_1 = require("ethers");
const logger_1 = __importDefault(require("../../utils/logger"));
const contractAbis_1 = require("../../constants/contractAbis");
class PYTNYTService {
    constructor(kaiaProvider, feeDelegation, redis) {
        this.kaiaProvider = kaiaProvider;
        this.feeDelegation = feeDelegation;
        this.redis = redis;
        this.orchestratorAddress = contractAbis_1.CONTRACT_ADDRESSES.YIELD_ORCHESTRATOR;
        this.pytTokenAddress = contractAbis_1.CONTRACT_ADDRESSES.PYT_TOKEN;
        this.nytTokenAddress = contractAbis_1.CONTRACT_ADDRESSES.NYT_TOKEN;
    }
    async splitYield(params) {
        try {
            logger_1.default.info(`Yield splitting initiated for user ${params.user}, SY shares: ${params.syShares}`);
            await this.verifySplitSignature(params);
            if (!params.senderRawTransaction) {
                throw new Error('senderRawTransaction is required for fee-delegated splits');
            }
            const result = await this.feeDelegation.executeFeeDelegatedTransaction(params.senderRawTransaction);
            if (!result.success) {
                throw new Error(result.error || 'Split transaction failed');
            }
            const txHash = result.transactionHash;
            const { pytAmount, nytAmount } = await this.getSplitAmounts(txHash);
            await this.updateUserPositionAfterSplit(params.user, params.syShares, pytAmount, nytAmount);
            logger_1.default.info(`Yield splitting completed. TxHash: ${txHash}, PYT: ${pytAmount}, NYT: ${nytAmount}`);
            return { txHash, pytAmount, nytAmount };
        }
        catch (error) {
            logger_1.default.error('Yield splitting failed:', error);
            throw new Error(`Split failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async recombineYield(params) {
        try {
            logger_1.default.info(`Yield recombination initiated for user ${params.user}, PYT: ${params.pytAmount}, NYT: ${params.nytAmount}`);
            await this.verifyRecombineSignature(params);
            if (!params.senderRawTransaction) {
                throw new Error('senderRawTransaction is required for fee-delegated recombines');
            }
            const result = await this.feeDelegation.executeFeeDelegatedTransaction(params.senderRawTransaction);
            if (!result.success) {
                throw new Error(result.error || 'Recombine transaction failed');
            }
            const txHash = result.transactionHash;
            const syShares = await this.getRecombinedShares(txHash);
            await this.updateUserPositionAfterRecombine(params.user, params.pytAmount, params.nytAmount, syShares);
            logger_1.default.info(`Yield recombination completed. TxHash: ${txHash}, SY shares: ${syShares}`);
            return { txHash, syShares };
        }
        catch (error) {
            logger_1.default.error('Yield recombination failed:', error);
            throw new Error(`Recombine failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async getUserPositions(userAddress) {
        try {
            const cached = await this.redis.get(`defi:positions:${userAddress}`);
            if (cached) {
                const position = JSON.parse(cached);
                if (Date.now() - position.lastUpdate < 300000) {
                    return position;
                }
            }
            const provider = await this.kaiaProvider.getProvider();
            const [pytContract, nytContract, orchestratorContract] = [
                (0, contractAbis_1.getContractInstance)('PYT_TOKEN', provider),
                (0, contractAbis_1.getContractInstance)('NYT_TOKEN', provider),
                (0, contractAbis_1.getContractInstance)('YIELD_ORCHESTRATOR', provider)
            ];
            const [pytBalance, nytBalance, pytYieldAccrued, nytPrincipal, nytMaturity, nytMatured] = await Promise.all([
                pytContract.balanceOf(userAddress),
                nytContract.balanceOf(userAddress),
                pytContract.yieldAccrued(userAddress),
                nytContract.principalAmount(userAddress),
                nytContract.maturityTimestamp(),
                nytContract.isMatured()
            ]);
            const positions = {
                syShares: '0',
                pytBalance: pytBalance.toString(),
                nytBalance: nytBalance.toString(),
                portfolioTokens: '0',
                nytMaturity: Number(nytMaturity),
                principalProtected: nytPrincipal.toString(),
                liquidationProtection: false
            };
            await this.redis.setWithTTL(`defi:positions:${userAddress}`, JSON.stringify({
                ...positions,
                lastUpdate: Date.now()
            }), 300);
            return positions;
        }
        catch (error) {
            logger_1.default.error(`Failed to get positions for ${userAddress}:`, error);
            throw new Error('Failed to fetch user positions');
        }
    }
    async getYieldForecast(userAddress, timeframeDays = 30) {
        try {
            const cacheKey = `defi:forecast:${userAddress}:${timeframeDays}`;
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
            const baseYieldRate = 5.0;
            const dailyRate = baseYieldRate / 365;
            const projectedYield = (1000 * dailyRate * timeframeDays).toString();
            const forecast = {
                projectedPYTYield: projectedYield,
                confidenceScore: 75,
                minExpected: (parseFloat(projectedYield) * 0.8).toString(),
                maxExpected: (parseFloat(projectedYield) * 1.2).toString(),
                timeframe: timeframeDays
            };
            await this.redis.setWithTTL(cacheKey, JSON.stringify(forecast), 3600);
            return forecast;
        }
        catch (error) {
            logger_1.default.error(`Failed to get yield forecast for ${userAddress}:`, error);
            throw new Error('Failed to generate yield forecast');
        }
    }
    async verifySplitSignature(params) {
        const domain = {
            name: 'LineX',
            version: '1',
            chainId: parseInt(process.env.KAIA_CHAIN_ID || '1001'),
            verifyingContract: this.orchestratorAddress
        };
        const types = {
            YieldSplit: [
                { name: 'user', type: 'address' },
                { name: 'syShares', type: 'uint256' },
                { name: 'orchestrator', type: 'address' },
                { name: 'nonce', type: 'uint256' },
                { name: 'deadline', type: 'uint256' }
            ]
        };
        const value = {
            user: params.user,
            syShares: params.syShares,
            orchestrator: this.orchestratorAddress,
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
    async verifyRecombineSignature(params) {
        const domain = {
            name: 'LineX',
            version: '1',
            chainId: parseInt(process.env.KAIA_CHAIN_ID || '1001'),
            verifyingContract: this.orchestratorAddress
        };
        const types = {
            YieldRecombine: [
                { name: 'user', type: 'address' },
                { name: 'pytAmount', type: 'uint256' },
                { name: 'nytAmount', type: 'uint256' },
                { name: 'orchestrator', type: 'address' },
                { name: 'nonce', type: 'uint256' },
                { name: 'deadline', type: 'uint256' }
            ]
        };
        const value = {
            user: params.user,
            pytAmount: params.pytAmount,
            nytAmount: params.nytAmount,
            orchestrator: this.orchestratorAddress,
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
    async getSplitAmounts(txHash) {
        try {
            const provider = await this.kaiaProvider.getProvider();
            const receipt = await provider.getTransactionReceipt(txHash);
            const orchestratorInterface = new ethers_1.Interface([
                'event SharesSplit(address indexed user, uint256 syShares, uint256 pytMinted, uint256 nytMinted, uint256 timestamp)'
            ]);
            for (const log of receipt.logs) {
                try {
                    if (log.address.toLowerCase() === this.orchestratorAddress.toLowerCase()) {
                        const parsed = orchestratorInterface.parseLog(log);
                        if (parsed && parsed.name === 'SharesSplit') {
                            return {
                                pytAmount: parsed.args?.pytMinted?.toString() || '0',
                                nytAmount: parsed.args?.nytMinted?.toString() || '0'
                            };
                        }
                    }
                }
                catch (e) {
                }
            }
            throw new Error('SharesSplit event not found in transaction');
        }
        catch (error) {
            logger_1.default.error(`Failed to get split amounts from tx ${txHash}:`, error);
            throw error;
        }
    }
    async getRecombinedShares(txHash) {
        try {
            const provider = await this.kaiaProvider.getProvider();
            const receipt = await provider.getTransactionReceipt(txHash);
            const orchestratorInterface = new ethers_1.Interface([
                'event SharesRecombined(address indexed user, uint256 pytBurned, uint256 nytBurned, uint256 syShares, uint256 timestamp)'
            ]);
            for (const log of receipt.logs) {
                try {
                    if (log.address.toLowerCase() === this.orchestratorAddress.toLowerCase()) {
                        const parsed = orchestratorInterface.parseLog(log);
                        if (parsed && parsed.name === 'SharesRecombined') {
                            return parsed.args?.syShares?.toString() || '0';
                        }
                    }
                }
                catch (e) {
                }
            }
            throw new Error('SharesRecombined event not found in transaction');
        }
        catch (error) {
            logger_1.default.error(`Failed to get recombined shares from tx ${txHash}:`, error);
            throw error;
        }
    }
    async updateUserPositionAfterSplit(userAddress, syShares, pytAmount, nytAmount) {
        try {
            const key = `defi:positions:${userAddress}`;
            const existing = await this.redis.get(key);
            const position = existing ? JSON.parse(existing) : {
                syShares: '0',
                pytBalance: '0',
                nytBalance: '0',
                portfolioTokens: '0',
                lastUpdate: Date.now()
            };
            const currentSY = BigInt(position.syShares || '0');
            const currentPYT = BigInt(position.pytBalance || '0');
            const currentNYT = BigInt(position.nytBalance || '0');
            position.syShares = (currentSY - BigInt(syShares)).toString();
            position.pytBalance = (currentPYT + BigInt(pytAmount)).toString();
            position.nytBalance = (currentNYT + BigInt(nytAmount)).toString();
            position.lastUpdate = Date.now();
            await this.redis.set(key, JSON.stringify(position));
        }
        catch (error) {
            logger_1.default.error(`Failed to update position after split for ${userAddress}:`, error);
        }
    }
    async updateUserPositionAfterRecombine(userAddress, pytAmount, nytAmount, syShares) {
        try {
            const key = `defi:positions:${userAddress}`;
            const existing = await this.redis.get(key);
            const position = existing ? JSON.parse(existing) : {
                syShares: '0',
                pytBalance: '0',
                nytBalance: '0',
                portfolioTokens: '0',
                lastUpdate: Date.now()
            };
            const currentSY = BigInt(position.syShares || '0');
            const currentPYT = BigInt(position.pytBalance || '0');
            const currentNYT = BigInt(position.nytBalance || '0');
            position.syShares = (currentSY + BigInt(syShares)).toString();
            position.pytBalance = (currentPYT - BigInt(pytAmount)).toString();
            position.nytBalance = (currentNYT - BigInt(nytAmount)).toString();
            position.lastUpdate = Date.now();
            await this.redis.set(key, JSON.stringify(position));
        }
        catch (error) {
            logger_1.default.error(`Failed to update position after recombine for ${userAddress}:`, error);
        }
    }
}
exports.PYTNYTService = PYTNYTService;
//# sourceMappingURL=pytNytService.js.map