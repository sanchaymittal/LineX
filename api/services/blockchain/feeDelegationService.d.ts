import { Wallet, TxType } from '@kaiachain/ethers-ext';
import { GaslessTransactionResult } from '../../types';
export declare class FeeDelegationService {
    private gasPayerWallet;
    constructor();
    private initializeGasPayer;
    private ensureGasPayer;
    getGasPayerAddress(): string;
    createFeeDelegatedTransaction(params: {
        type: TxType;
        from: string;
        to: string;
        value?: bigint;
        data?: string;
        gasLimit?: number;
    }): Promise<any>;
    signTransactionEIP712(userWallet: Wallet, transaction: any): Promise<string>;
    signTransaction(userWallet: Wallet, transaction: any): Promise<string>;
    executeFeeDelegatedTransaction(senderTxHashRLP: string): Promise<GaslessTransactionResult>;
    executeGaslessApproval(request: {
        userAddress: string;
        amount: number;
        spenderAddress?: string;
        senderRawTransaction?: string;
    }): Promise<GaslessTransactionResult>;
    executeAuthorizedFaucetClaim(request: {
        userAddress: string;
        signature: string;
        message: string;
        senderRawTransaction?: string;
    }): Promise<GaslessTransactionResult>;
    private buildMintCall;
    createApproveTransaction(userAddress: string, spenderAddress: string, amount: bigint): Promise<any>;
    private buildApproveCall;
}
export declare const feeDelegationService: FeeDelegationService;
//# sourceMappingURL=feeDelegationService.d.ts.map