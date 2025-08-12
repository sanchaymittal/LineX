// User Types
export interface User {
  lineUserId: string;
  walletAddress?: string;
  createdAt: string;
  updatedAt: string;
}

// Wallet Types
export interface Wallet {
  address: string;
  lineUserId: string;
  createdAt: string;
}

// Quote Types
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

// Transfer Types
export type TransferStatus = 
  | 'PENDING_SIGNATURE'
  | 'SIGNING' 
  | 'PROCESSING' 
  | 'COMPLETED' 
  | 'FAILED';

export interface Transfer {
  id: string;
  quoteId: string;
  senderLineUserId: string;
  recipientWallet: string;
  status: TransferStatus;
  signingSessionId?: string;
  transactionHash?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

// Signing Session Types
export interface SigningSession {
  id: string;
  transferId: string;
  signingUrl: string;
  status: 'PENDING' | 'SIGNED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
}

// Session Types
export interface UserSession {
  token: string;
  lineUserId: string;
  expiresAt: string;
  createdAt: string;
}

// API Response Types
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

// Quote Request/Response Types
export interface QuoteRequest {
  fromCurrency: 'KRW' | 'USD';
  toCurrency: 'PHP' | 'USDT';
  amount: number;
  amountType: 'source' | 'destination';
}

export interface QuoteResponse {
  quote: Quote;
}

// Transfer Request/Response Types
export interface TransferRequest {
  quoteId: string;
  recipientWallet: string;
  paymentMethod: 'onramp' | 'blockchain';
}

export interface TransferResponse {
  transferId: string;
  signingUrl: string;
  status: TransferStatus;
}

// Webhook Types
export interface DappPortalWebhookPayload {
  sessionId: string;
  status: 'transaction_signed' | 'transaction_failed';
  transactionData?: {
    hash: string;
    signedTransaction: string;
  };
  timestamp: string;
}

// Mock Provider Types
export interface MockPaymentProvider {
  processPayment(amount: number, currency: string): Promise<{
    success: boolean;
    transactionId: string;
    processingTime: number;
  }>;
}