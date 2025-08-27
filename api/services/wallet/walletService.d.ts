import { FaucetRequest, GaslessTransactionResult, User } from '../../types';
export declare class WalletService {
    getUser(address: string): Promise<User | null>;
    getWalletBalance(address: string): Promise<{
        success: boolean;
        balance?: {
            usdt: number;
        };
        error?: string;
    }>;
    claimFaucet(request: FaucetRequest): Promise<GaslessTransactionResult>;
    getUserTransfers(address: string, limit?: number): Promise<any[]>;
    private isValidAddress;
}
export declare const walletService: WalletService;
export default walletService;
//# sourceMappingURL=walletService.d.ts.map