type BigNumberish = string | number | bigint;
export interface TestUSDTContract {
    name(): Promise<string>;
    symbol(): Promise<string>;
    decimals(): Promise<number>;
    totalSupply(): Promise<bigint>;
    balanceOf(account: string): Promise<bigint>;
    allowance(owner: string, spender: string): Promise<bigint>;
    getFormattedBalance(account: string): Promise<bigint>;
    getFormattedTotalSupply(): Promise<bigint>;
    FAUCET_AMOUNT(): Promise<bigint>;
    FAUCET_COOLDOWN(): Promise<bigint>;
    lastFaucetClaim(user: string): Promise<bigint>;
    canUseFaucet(user: string): Promise<{
        canClaim: boolean;
        timeLeft: bigint;
    }>;
    faucet(): Promise<void>;
    transfer(to: string, amount: BigNumberish): Promise<boolean>;
    transferFrom(from: string, to: string, amount: BigNumberish): Promise<boolean>;
    approve(spender: string, value: BigNumberish): Promise<boolean>;
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
export interface ContractTxOptions {
    gasLimit?: BigNumberish;
    gasPrice?: BigNumberish;
    value?: BigNumberish;
    nonce?: number;
}
export interface ContractCallResult<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    transactionHash?: string;
    blockNumber?: number;
    gasUsed?: bigint;
}
export interface BalanceInfo {
    raw: bigint;
    formatted: string;
    usdt: number;
}
export interface FaucetStatus {
    canClaim: boolean;
    timeLeft: number;
    nextClaimTime: Date;
    cooldownHours: number;
}
export interface ContractInfo {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: BalanceInfo;
    contractOwner: string;
    isPaused: boolean;
    faucetAmount: BalanceInfo;
    faucetCooldown: number;
}
export interface TransactionStatus {
    hash: string;
    status: 'pending' | 'confirmed' | 'failed';
    blockNumber?: number;
    confirmations: number;
    gasUsed?: bigint;
    effectiveGasPrice?: bigint;
    error?: string;
}
export declare const CONTRACT_CONSTANTS: {
    readonly ADDRESS: "0x0692640d5565735C67fcB40f45251DD5D3f8fb9f";
    readonly DECIMALS: 6;
    readonly FAUCET_AMOUNT_USDT: 100;
    readonly FAUCET_COOLDOWN_HOURS: 0;
    readonly INITIAL_SUPPLY_USDT: 1000000;
};
export declare const TESTUSDT_ABI: readonly ["function name() view returns (string)", "function symbol() view returns (string)", "function decimals() pure returns (uint8)", "function totalSupply() view returns (uint256)", "function balanceOf(address account) view returns (uint256)", "function allowance(address owner, address spender) view returns (uint256)", "function getFormattedBalance(address account) view returns (uint256)", "function getFormattedTotalSupply() view returns (uint256)", "function FAUCET_AMOUNT() view returns (uint256)", "function FAUCET_COOLDOWN() view returns (uint256)", "function lastFaucetClaim(address user) view returns (uint256)", "function canUseFaucet(address user) view returns (bool canClaim, uint256 timeLeft)", "function faucet()", "function transfer(address to, uint256 amount) returns (bool)", "function transferFrom(address from, address to, uint256 amount) returns (bool)", "function approve(address spender, uint256 value) returns (bool)", "function mint(address to, uint256 amount)", "function emergencyMint(address to, uint256 usdtAmount)", "function burn(uint256 amount)", "function burnFrom(address from, uint256 amount)", "function pause()", "function unpause()", "function paused() view returns (bool)", "function owner() view returns (address)", "function transferOwnership(address newOwner)", "function renounceOwnership()", "event Transfer(address indexed from, address indexed to, uint256 value)", "event Approval(address indexed owner, address indexed spender, uint256 value)", "event FaucetClaimed(address indexed user, uint256 amount)", "event Minted(address indexed to, uint256 amount)", "event EmergencyMint(address indexed to, uint256 amount)", "event Paused(address account)", "event Unpaused(address account)", "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)"];
export {};
//# sourceMappingURL=contracts.d.ts.map