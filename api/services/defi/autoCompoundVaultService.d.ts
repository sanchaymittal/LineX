import { KaiaProviderManager } from '../blockchain/provider';
import { FeeDelegationService } from '../blockchain/feeDelegationService';
import { RedisService } from '../redis/redisService';
export interface AutoCompoundDepositParams {
    user: string;
    amount: string;
    signature: string;
    nonce: number;
    deadline: number;
    senderRawTransaction?: string;
}
export interface AutoCompoundWithdrawParams {
    user: string;
    amount: string;
    signature: string;
    nonce: number;
    deadline: number;
    senderRawTransaction?: string;
}
export interface AutoCompoundBalance {
    shares: string;
    underlyingAssets: string;
    sharePrice: string;
}
export interface AutoCompoundVaultInfo {
    totalAssets: string;
    totalSupply: string;
    apy: number;
    riskLevel: number;
    compoundingRate: string;
    lastCompound: number;
}
export declare class AutoCompoundVaultService {
    private kaiaProvider;
    private feeDelegation;
    private redis;
    private vaultAddress;
    constructor(kaiaProvider: KaiaProviderManager, feeDelegation: FeeDelegationService, redis: RedisService);
    deposit(params: AutoCompoundDepositParams): Promise<{
        txHash: string;
        shares: string;
    }>;
    withdraw(params: AutoCompoundWithdrawParams): Promise<{
        txHash: string;
        assets: string;
    }>;
    getBalance(userAddress: string): Promise<AutoCompoundBalance>;
    getVaultInfo(): Promise<AutoCompoundVaultInfo>;
    triggerCompounding(userAddress: string): Promise<{
        txHash: string;
        compoundedAmount: string;
    }>;
    private verifyDepositSignature;
    private verifyWithdrawSignature;
    private getDepositedShares;
    private getWithdrawnAssets;
    private updateUserPosition;
}
//# sourceMappingURL=autoCompoundVaultService.d.ts.map