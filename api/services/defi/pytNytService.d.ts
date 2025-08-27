import { KaiaProviderManager } from '../blockchain/provider';
import { FeeDelegationService } from '../blockchain/feeDelegationService';
import { RedisService } from '../redis/redisService';
export interface SplitParams {
    user: string;
    syShares: string;
    signature: string;
    nonce: number;
    deadline: number;
    senderRawTransaction?: string;
}
export interface RecombineParams {
    user: string;
    pytAmount: string;
    nytAmount: string;
    signature: string;
    nonce: number;
    deadline: number;
    senderRawTransaction?: string;
}
export interface UserPositions {
    syShares: string;
    pytBalance: string;
    nytBalance: string;
    portfolioTokens: string;
    pytMaturity?: number;
    nytMaturity?: number;
    principalProtected: string;
    liquidationProtection: boolean;
}
export interface YieldForecast {
    projectedPYTYield: string;
    confidenceScore: number;
    minExpected: string;
    maxExpected: string;
    timeframe: number;
}
export declare class PYTNYTService {
    private kaiaProvider;
    private feeDelegation;
    private redis;
    private orchestratorAddress;
    private pytTokenAddress;
    private nytTokenAddress;
    constructor(kaiaProvider: KaiaProviderManager, feeDelegation: FeeDelegationService, redis: RedisService);
    splitYield(params: SplitParams): Promise<{
        txHash: string;
        pytAmount: string;
        nytAmount: string;
    }>;
    recombineYield(params: RecombineParams): Promise<{
        txHash: string;
        syShares: string;
    }>;
    getUserPositions(userAddress: string): Promise<UserPositions>;
    getYieldForecast(userAddress: string, timeframeDays?: number): Promise<YieldForecast>;
    private verifySplitSignature;
    private verifyRecombineSignature;
    private getSplitAmounts;
    private getRecombinedShares;
    private updateUserPositionAfterSplit;
    private updateUserPositionAfterRecombine;
}
//# sourceMappingURL=pytNytService.d.ts.map