# LineX DeFi Smart Contracts Guide

This document provides an overview of all smart contracts in the LineX DeFi ecosystem deployed on Kaia testnet.

## Contract Architecture Overview

LineX implements a comprehensive DeFi yield farming system with four core contracts and several supporting contracts:

```
TestUSDT (ERC-20 Token)
    ↓
StandardizedYield (Multi-Strategy Vault)
    ↓
├── AutoCompoundVault (Single Strategy Auto-Compound)
├── PYTNYTOrchestrator (Yield Token Splitting)
└── YieldSet (Portfolio Management)
```

## Core Contracts

### 1. StandardizedYield (SY)
**File**: `contracts/src/core/StandardizedYield.sol`
**Purpose**: Multi-strategy yield vault following Pendle's SY standard

**Key Features**:
- ERC4626-compatible vault interface
- Multiple yield strategy support (max 3 strategies)
- Proportional strategy allocation with basis points
- Real-time yield tracking and exchange rate updates
- Automated yield deployment and withdrawal
- Emergency functions and pausability

**Strategy Allocation Example**:
- MockLendingStrategy: 40% (10% APY) 
- MockStakingStrategy: 35% (8% APY)
- MockLPStrategy: 25% (12% volatile APY)
- **Blended APY**: ~9.5%

**Core Functions**:
- `deposit(uint256 assets, address receiver)` - ERC4626 deposit
- `withdraw(uint256 shares, address receiver, address owner)` - ERC4626 withdrawal  
- `addStrategy(address strategy, uint256 allocation)` - Owner only
- `exchangeRate()` - Current asset/share ratio

### 2. AutoCompoundVault
**File**: `contracts/src/core/AutoCompoundVault.sol`
**Purpose**: Beefy-style auto-compounding vault with harvest-on-deposit

**Key Features**:
- Single strategy focus for maximum efficiency
- Automatic yield harvesting on deposit/withdraw
- Harvest call rewards (0.5% to harvester)
- Optional withdrawal fees (default 0%)
- Auto-compounding mechanism increases share value

**Core Functions**:
- `deposit(uint256 amount)` - Single parameter deposit
- `withdraw(uint256 shares)` - Withdraw with auto-harvest
- `harvest()` - Manual harvest trigger (rewards caller)
- `totalAssets()` - Total underlying assets managed

**Expected Performance**: 10-12% effective APY with compounding

### 3. PYTNYTOrchestrator  
**File**: `contracts/src/core/PYTNYTOrchestrator.sol`
**Purpose**: Splits SY vault positions into Principal (PYT) and Yield (NYT) tokens

**Key Features**:
- Yield tokenization - separate principal from yield
- PYT tokens: Claim all future yield from positions
- NYT tokens: Principal protection until maturity
- Automated yield distribution (1-hour intervals)
- Yield forecasting for risk assessment

**Core Functions**:
- `splitYield(uint256 amount)` - Split SY position into PYT/NYT
- `recombineYield(uint256 pytAmount, uint256 nytAmount)` - Recombine tokens
- `distributeYield()` - Trigger yield distribution to PYT holders
- `claimYield(address user)` - Claim accumulated yield

**Use Cases**:
- Yield speculation: Buy PYT to capture all yield
- Principal protection: Hold NYT for downside protection
- Sophisticated yield strategies

### 4. YieldSet
**File**: `contracts/src/core/YieldSet.sol`
**Purpose**: Set Protocol-inspired portfolio manager for multiple yield positions

**Key Features**:
- Multi-position portfolio management (max 4 positions)
- Automatic rebalancing based on target allocations
- 24-hour rolling APY tracking for optimization
- Set token minting/redemption for portfolio exposure
- Dynamic strategy weighting

**Core Functions**:
- `issue(uint256 quantity)` - Mint set tokens with proportional allocation
- `redeem(uint256 quantity)` - Burn set tokens and withdraw assets
- `rebalance()` - Trigger portfolio rebalancing
- `updateWeights(uint256[] weights)` - Update target allocations

**Rebalancing Triggers**:
- Allocation drift >2% from target
- Minimum 6-hour interval between rebalances
- Manual triggers available

## Supporting Contracts

### TestUSDT
**File**: `contracts/src/TestUSDT.sol`
**Purpose**: Test USDT token for Kaia testnet with faucet functionality

**Specifications**:
- ERC-20 token with 6 decimals (matching real USDT)
- 1,000,000 USDT initial supply
- Unlimited faucet (100 USDT per claim, no cooldown)
- Pausable transfers for emergency situations
- Burn functionality

### Yield Strategies (Mock Implementations)
**Purpose**: Simulate different yield generation mechanisms for testing

#### MockLendingStrategy
- Simulates lending protocol yields (10% APY)
- Safest strategy with predictable returns
- Used for conservative allocation

#### MockStakingStrategy  
- Simulates staking rewards (8% APY)
- Medium risk with stable returns
- Used in AutoCompound vault

#### MockLPStrategy
- Simulates liquidity provision (12% volatile APY)
- Highest risk/reward with variable returns
- Adds volatility to portfolio

### Token Contracts

#### PerpetualYieldToken (PYT)
- ERC-20 token representing future yield rights
- Minted when splitting SY positions
- Accumulates yield from underlying strategies

#### NegativeYieldToken (NYT)  
- ERC-20 token representing principal protection
- Paired with PYT tokens in 1:1 ratio
- Provides downside protection until maturity

### Utility Contracts

#### YieldForecaster
- Provides yield predictions and risk metrics
- Analyzes historical performance data
- Used by PYTNYTOrchestrator for yield estimates

## Deployment Strategy

### Fresh Deployment Parameters

**TestUSDT**:
- Owner: Deployer address
- Initial supply: 1M USDT to owner
- Faucet: 100 USDT, no cooldown

**StandardizedYield**:
- Asset: TestUSDT address
- Name: "LineX Standardized Yield"  
- Symbol: "SY-USDT"
- Owner: Deployer address
- Strategies: All 3 mock strategies with allocations

**AutoCompoundVault**:
- Asset: TestUSDT address
- Strategy: MockStakingStrategy
- Name: "LineX Auto-Compound Vault"
- Symbol: "AC-USDT"
- Owner: Deployer address

**PYTNYTOrchestrator**:
- SY Vault: StandardizedYield address
- Owner: Deployer address
- Creates PYT/NYT tokens automatically

**YieldSet**:
- Base Asset: TestUSDT address  
- Name: "LineX Yield Set"
- Symbol: "YS-USDT"
- Owner: Deployer address
- Positions: Added post-deployment

## Integration Points

### API Service Endpoints
- Bob's workflow: StandardizedYield deposit/withdraw
- Alice's workflow: AutoCompoundVault deposit/withdraw  
- Charlie's workflow: PYTNYTOrchestrator split/recombine/claim

### Fee Delegation
All contracts support gasless transactions via Kaia's KIP-247 fee delegation:
- Users sign EIP-712 messages authorizing transactions
- Platform pays gas fees while users retain full asset control
- Seamless UX without requiring native KAIA tokens

### Contract Interdependencies
1. **TestUSDT** → Base asset for all vaults
2. **StandardizedYield** → Required by PYTNYTOrchestrator
3. **Mock Strategies** → Required by SY and AutoCompound vaults
4. **PYT/NYT Tokens** → Created by PYTNYTOrchestrator
5. **YieldSet** → Can use any yield-bearing position

## Security Features

### Access Control
- **Ownable**: Critical functions restricted to contract owner
- **Pausable**: Emergency pause capability for all user functions  
- **ReentrancyGuard**: Protection against reentrancy attacks

### Asset Protection
- **SafeERC20**: Safe token transfer operations
- **Exchange Rate Protection**: Prevents share price manipulation
- **Strategy Limits**: Max allocation and strategy count limits
- **Emergency Functions**: Owner can withdraw from strategies in emergencies

### User Protection
- **EIP-712 Signatures**: User authorization for gasless transactions
- **Allowance Patterns**: Users approve specific amounts only
- **View Functions**: Transparent asset tracking and yield calculations

## Testing & Verification

### E2E Test Scenarios
- **Bob**: StandardizedYield deposit → yield accrual → withdrawal
- **Alice**: AutoCompoundVault deposit → auto-harvest → compounding → withdrawal
- **Charlie**: SY deposit → PYT/NYT split → yield claim → recombine → withdrawal

### Contract Verification
All contracts can be verified on Kaia testnet with:
- Source code matching deployed bytecode
- Constructor parameters documented
- ABI exported for frontend integration

## Upgrade Path

### Future Enhancements
- **Real Strategy Integration**: Replace mock strategies with actual DeFi protocols
- **Cross-Chain Yield**: Extend to multiple blockchain networks
- **Advanced Rebalancing**: ML-based portfolio optimization
- **Governance**: Community-driven parameter adjustment

### Migration Strategy
- Deploy new versions with migration functions
- Time-locked upgrades for user protection
- Backward compatibility during transition periods

---

*This guide covers the complete LineX DeFi smart contract ecosystem. For implementation details, refer to the individual contract source files and deployment scripts.*