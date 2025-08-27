import { KaiaProviderManager } from '../blockchain/provider';
import { FeeDelegationService } from '../blockchain/feeDelegationService';
import { RedisService } from '../redis/redisService';
export interface YieldSetDepositParams {
    user: string;
    amount: string;
    signature: string;
    nonce: number;
    deadline: number;
    senderRawTransaction?: string;
}
export interface YieldSetWithdrawParams {
    user: string;
    shares: string;
    signature: string;
    nonce: number;
    deadline: number;
    senderRawTransaction?: string;
}
export interface YieldSetBalance {
    portfolioShares: string;
    underlyingAssets: string;
    sharePrice: string;
}
export interface YieldSetPosition {
    address: string;
    name: string;
    weight: number;
    value: string;
    apy: number;
    riskLevel: number;
}
export interface YieldSetPortfolioInfo {
    totalAssets: string;
    totalSupply: string;
    portfolioValue: string;
    positions: YieldSetPosition[];
    rebalanceInfo: {
        threshold: number;
        interval: number;
        enabled: boolean;
        lastRebalance: number;
        canRebalance: boolean;
    };
    fees: {
        managementFee: number;
        performanceFee: number;
    };
    expectedApy: number;
    riskLevel: number;
}
export declare class YieldSetService {
    private kaiaProvider;
    private feeDelegation;
    private redis;
    private yieldSetAddress;
    constructor(kaiaProvider: KaiaProviderManager, feeDelegation: FeeDelegationService, redis: RedisService);
    deposit(params: YieldSetDepositParams): Promise<{
        txHash: string;
        shares: string;
    }>;
    withdraw(params: YieldSetWithdrawParams): Promise<{
        txHash: string;
        assets: string;
    }>;
    getBalance(userAddress: string): Promise<YieldSetBalance>;
    getPortfolioInfo(): Promise<YieldSetPortfolioInfo>;
    rebalancePortfolio(userAddress: string): Promise<{
        txHash: string;
        rebalancedPositions: number;
    }>;
    harvestYield(userAddress: string): Promise<{
        txHash: string;
        harvestedAmount: string;
    }>;
    private getPositionName;
    private getPositionStats;
    private verifyDepositSignature;
    private verifyWithdrawSignature;
    private getDepositedShares;
    private getWithdrawnAssets;
    private updateUserPosition;
}
//# sourceMappingURL=yieldSetService.d.ts.map