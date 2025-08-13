/**
 * TypeScript interfaces for TestUSDT contract
 * Contract Address: 0x09D48C3b2DE92DDfD26ebac28324F1226da1f400
 * Network: Kaia Testnet (Kairos)
 */

// Use simple types instead of BigNumberish for compatibility
type BigNumberish = string | number | bigint;

export interface TestUSDTContract {
  // Read-only functions
  name(): Promise<string>;
  symbol(): Promise<string>;
  decimals(): Promise<number>;
  totalSupply(): Promise<bigint>;
  balanceOf(account: string): Promise<bigint>;
  allowance(owner: string, spender: string): Promise<bigint>;
  getFormattedBalance(account: string): Promise<bigint>;
  getFormattedTotalSupply(): Promise<bigint>;
  
  // Faucet functions
  FAUCET_AMOUNT(): Promise<bigint>;
  FAUCET_COOLDOWN(): Promise<bigint>;
  lastFaucetClaim(user: string): Promise<bigint>;
  canUseFaucet(user: string): Promise<{ canClaim: boolean; timeLeft: bigint }>;
  faucet(): Promise<void>;
  
  // ERC-20 functions
  transfer(to: string, amount: BigNumberish): Promise<boolean>;
  transferFrom(from: string, to: string, amount: BigNumberish): Promise<boolean>;
  approve(spender: string, value: BigNumberish): Promise<boolean>;
  
  // Admin functions (owner only)
  mint(to: string, amount: BigNumberish): Promise<void>;
  emergencyMint(to: string, usdtAmount: BigNumberish): Promise<void>;
  burn(amount: BigNumberish): Promise<void>;
  burnFrom(from: string, amount: BigNumberish): Promise<void>;
  pause(): Promise<void>;
  unpause(): Promise<void>;
  paused(): Promise<boolean>;
  owner(): Promise<string>;
  transferOwnership(newOwner: string): Promise<void>;
  renounceOwnership(): Promise<void>;
}

export interface ContractEventLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  transactionHash: string;
  transactionIndex: number;
  blockHash: string;
  logIndex: number;
  removed: boolean;
}

export interface TransferEvent {
  from: string;
  to: string;
  value: bigint;
}

export interface ApprovalEvent {
  owner: string;
  spender: string;
  value: bigint;
}

export interface FaucetClaimedEvent {
  user: string;
  amount: bigint;
}

export interface MintedEvent {
  to: string;
  amount: bigint;
}

export interface EmergencyMintEvent {
  to: string;
  amount: bigint;
}

export interface PausedEvent {
  account: string;
}

export interface UnpausedEvent {
  account: string;
}

export interface OwnershipTransferredEvent {
  previousOwner: string;
  newOwner: string;
}

// Contract transaction options
export interface ContractTxOptions {
  gasLimit?: BigNumberish;
  gasPrice?: BigNumberish;
  value?: BigNumberish;
  nonce?: number;
}

// Contract call result
export interface ContractCallResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  transactionHash?: string;
  blockNumber?: number;
  gasUsed?: bigint;
}

// Balance information
export interface BalanceInfo {
  raw: bigint;           // Raw balance in wei (smallest unit)
  formatted: string;     // Human-readable format (e.g., "100.000000")
  usdt: number;          // USDT amount as number
}

// Faucet status
export interface FaucetStatus {
  canClaim: boolean;
  timeLeft: number;      // Time left in seconds
  nextClaimTime: Date;   // Next claim time as Date object
  cooldownHours: number; // Cooldown period in hours
}

// Contract info
export interface ContractInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: BalanceInfo;
  contractOwner: string;
  isPaused: boolean;
  faucetAmount: BalanceInfo;
  faucetCooldown: number; // in seconds
}

// Transaction status
export interface TransactionStatus {
  hash: string;
  status: 'pending' | 'confirmed' | 'failed';
  blockNumber?: number;
  confirmations: number;
  gasUsed?: bigint;
  effectiveGasPrice?: bigint;
  error?: string;
}

// Contract constants
export const CONTRACT_CONSTANTS = {
  ADDRESS: '0x09D48C3b2DE92DDfD26ebac28324F1226da1f400',
  DECIMALS: 6,
  FAUCET_AMOUNT_USDT: 100,
  FAUCET_COOLDOWN_HOURS: 24,
  INITIAL_SUPPLY_USDT: 1000000,
} as const;

// Contract ABI (simplified - key functions only)
export const TESTUSDT_ABI = [
  // Read functions
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() pure returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function getFormattedBalance(address account) view returns (uint256)',
  'function getFormattedTotalSupply() view returns (uint256)',
  
  // Faucet functions
  'function FAUCET_AMOUNT() view returns (uint256)',
  'function FAUCET_COOLDOWN() view returns (uint256)', 
  'function lastFaucetClaim(address user) view returns (uint256)',
  'function canUseFaucet(address user) view returns (bool canClaim, uint256 timeLeft)',
  'function faucet()',
  
  // ERC-20 functions
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 value) returns (bool)',
  
  // Admin functions
  'function mint(address to, uint256 amount)',
  'function emergencyMint(address to, uint256 usdtAmount)',
  'function burn(uint256 amount)',
  'function burnFrom(address from, uint256 amount)',
  'function pause()',
  'function unpause()',
  'function paused() view returns (bool)',
  'function owner() view returns (address)',
  'function transferOwnership(address newOwner)',
  'function renounceOwnership()',
  
  // Events
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
  'event FaucetClaimed(address indexed user, uint256 amount)',
  'event Minted(address indexed to, uint256 amount)',
  'event EmergencyMint(address indexed to, uint256 amount)',
  'event Paused(address account)',
  'event Unpaused(address account)',
  'event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)',
] as const;