import { Transfer } from '../../types';
export interface CreateTransferRequest {
    quoteId: string;
    from: string;
    to: string;
    signature: string;
    nonce: number;
    deadline: number;
    senderRawTransaction?: string;
}
export interface TransferResult {
    success: boolean;
    transfer?: Transfer;
    error?: string;
}
export declare class TransferService {
    private readonly TRANSFER_TTL;
    private readonly TRANSFER_KEY_PREFIX;
    private readonly MAX_RETRY_COUNT;
    createTransfer(request: CreateTransferRequest): Promise<TransferResult>;
    getTransfer(transferId: string): Promise<Transfer | null>;
    getUserTransfers(address: string, limit?: number): Promise<Transfer[]>;
    cancelTransfer(transferId: string, reason?: string): Promise<TransferResult>;
    private updateTransferStatus;
    private storeTransfer;
    private isValidAddress;
    private ensureUserExists;
}
export declare const transferService: TransferService;
export default transferService;
//# sourceMappingURL=transferService.d.ts.map