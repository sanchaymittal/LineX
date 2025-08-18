// User Types - Address-based identity
export interface User {
  walletAddress: string; // Primary identifier (was lineUserId)
  firstTransferAt: string;
  lastTransferAt: string;
  transferCount: number;
  createdAt: string;
  updatedAt: string;
}

// Wallet Types - Simplified
export interface Wallet {
  address: string;
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
  | 'PENDING'           // Transfer created, awaiting validation
  | 'PROCESSING'        // Transaction being processed on blockchain
  | 'COMPLETED'         // Transfer completed successfully
  | 'FAILED'            // Transfer failed
  | 'EXPIRED';          // Transfer expired

export interface Transfer {
  id: string;
  quoteId: string;
  status: TransferStatus;
  
  // Address-based participants
  senderAddress: string;
  recipientAddress: string;
  
  // Financial details (from quote)
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  toAmount: number;
  exchangeRate: number;
  platformFeeAmount: number;
  
  // Execution details
  transactionHash?: string;
  
  // Authorization details
  signature: string;
  nonce: number;
  deadline: number;
  
  // Timing
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  
  // Error handling
  error?: string;
}

// User Authorization Types for EIP-712 signatures
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
  amount: number; // USDT amount
  signature: string;
  nonce: number;
  deadline: number;
}

// Session Types - Address-based
export interface UserSession {
  token: string;
  walletAddress: string; // Changed from lineUserId
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

// Transfer Request/Response Types - User-authorized
export interface TransferRequest {
  quoteId: string;
  from: string; // Sender wallet address
  to: string; // Recipient wallet address
  signature: string; // User's EIP-712 authorization signature
  nonce: number;
  deadline: number;
}

export interface TransferResponse {
  transferId: string;
  status: TransferStatus;
  transactionHash?: string;
}

// Gasless Transaction Result Types
export interface GaslessTransactionResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  error?: string;
  gasUsed?: bigint;
  cost?: string; // Cost in KAIA
}

// Faucet Request Types
export interface FaucetRequest {
  userAddress: string;
  signature: string; // User authorization signature
  message: string; // Signed message
}