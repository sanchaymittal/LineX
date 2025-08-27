export interface User {
    walletAddress: string;
    firstTransferAt: string;
    lastTransferAt: string;
    transferCount: number;
    createdAt: string;
    updatedAt: string;
}
export interface Wallet {
    address: string;
    createdAt: string;
}
export interface Quote {
    id: string;
    fromCurrency: 'KRW' | 'USD';
    toCurrency: 'PHP' | 'USDT';
    amount: number;
    amountType: 'source' | 'destination';
    exchangeRate: number;
    platformFee: number;
    networkFee: number;
    totalAmount: number;
    destinationAmount: number;
    expiresAt: string;
    createdAt: string;
}
export type TransferStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
export interface Transfer {
    id: string;
    quoteId: string;
    status: TransferStatus;
    senderAddress: string;
    recipientAddress: string;
    fromCurrency: string;
    toCurrency: string;
    fromAmount: number;
    toAmount: number;
    exchangeRate: number;
    platformFeeAmount: number;
    transactionHash?: string;
    signature: string;
    nonce: number;
    deadline: number;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
    error?: string;
}
export interface TransferAuthorization {
    from: string;
    to: string;
    amount: bigint;
    nonce: number;
    deadline: number;
}
export interface AuthorizedTransferRequest {
    from: string;
    to: string;
    amount: number;
    signature: string;
    nonce: number;
    deadline: number;
}
export interface UserSession {
    token: string;
    walletAddress: string;
    expiresAt: string;
    createdAt: string;
}
export interface ApiResponse<T = any> {
    success: boolean;
    data: T | null;
    error: {
        code: string;
        message: string;
        details?: any;
    } | null;
    metadata?: {
        timestamp: string;
        requestId: string;
    };
}
export interface QuoteRequest {
    fromCurrency: 'KRW' | 'USD';
    toCurrency: 'PHP' | 'USDT';
    amount: number;
    amountType: 'source' | 'destination';
}
export interface QuoteResponse {
    quote: Quote;
}
export interface TransferRequest {
    quoteId: string;
    from: string;
    to: string;
    signature: string;
    nonce: number;
    deadline: number;
}
export interface TransferResponse {
    transferId: string;
    status: TransferStatus;
    transactionHash?: string;
}
export interface GaslessTransactionResult {
    success: boolean;
    transactionHash?: string;
    blockNumber?: number;
    error?: string;
    gasUsed?: bigint;
    cost?: string;
}
export interface FaucetRequest {
    userAddress: string;
    signature: string;
    message: string;
}
//# sourceMappingURL=index.d.ts.map