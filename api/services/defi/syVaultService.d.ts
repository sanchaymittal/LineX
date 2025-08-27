import { KaiaProviderManager } from '../blockchain/provider';
import { FeeDelegationService } from '../blockchain/feeDelegationService';
import { RedisService } from '../redis/redisService';
export interface SYDepositParams {
    user: string;
    amount: string;
    signature: string;
    nonce: number;
    deadline: number;
    senderRawTransaction?: string;
}
export interface SYWithdrawParams {
    user: string;
    shares: string;
    signature: string;
    nonce: number;
    deadline: number;
    senderRawTransaction?: string;
}
export interface SYBalance {
    syShares: string;
    underlyingAssets: string;
    sharePrice: string;
}
export interface SYVaultInfo {
    totalAssets: string;
    totalSupply: string;
    apy: number;
    strategies: Array<{
        address: string;
        allocation: number;
        apy: number;
    }>;
}
export declare class SYVaultService {
    private kaiaProvider;
    private feeDelegation;
    private redis;
    private syVaultAddress;
    constructor(kaiaProvider: KaiaProviderManager, feeDelegation: FeeDelegationService, redis: RedisService);
    deposit(params: SYDepositParams): Promise<{
        txHash: string;
        shares: string;
    }>;
    withdraw(params: SYWithdrawParams): Promise<{
        txHash: string;
        assets: string;
    }>;
    getBalance(userAddress: string): Promise<SYBalance>;
    getVaultInfo(): Promise<SYVaultInfo>;
    private verifyDepositSignature;
    private verifyWithdrawSignature;
    private getDepositedShares;
    private getWithdrawnAssets;
    private updateUserPosition;
}
//# sourceMappingURL=syVaultService.d.ts.map