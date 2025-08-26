# Multi-User Flow Scenarios for LineX DeFi Platform

## 🏗️ Contract Architecture Overview

### Core Contracts:
1. **StandardizedYield (SY)** - Multi-strategy yield wrapper
2. **AutoCompoundVault** - Single strategy auto-compounder  
3. **PYT/NYT System** - Yield splitting/trading
4. **TestUSDT** - Base asset with faucet

## 👥 User Personas & Flow Scenarios

### 1. **Conservative Alice** - Simple Yield Farmer
**Profile**: New to DeFi, wants safe, simple yield
**Strategy**: Uses SY Vault for diversified exposure

**Flow**: 
- Get USDT from faucet → Deposit to SY Vault → Earn yield → Withdraw

### 2. **Aggressive Bob** - Yield Trader  
**Profile**: Advanced DeFi user, wants to trade yield
**Strategy**: Uses PYT/NYT system for yield speculation

**Flow**:
- Get USDT → Deposit to SY → Split to PYT+NYT → Trade positions → Claim yield → Recombine → Exit

### 3. **Passive Charlie** - Set & Forget
**Profile**: Busy investor, wants automatic compounding
**Strategy**: Uses AutoCompoundVault for hands-off approach

**Flow**:
- Get USDT → Deposit to AutoCompound → Let it compound automatically → Check periodically → Withdraw

### 4. **Arbitrage Dave** - Advanced Trader
**Profile**: Expert user, exploits price differences
**Strategy**: Uses multiple contracts for arbitrage opportunities

**Flow**:
- Multi-contract interactions → Find yield/price discrepancies → Execute arbitrage → Profit

## 🔄 Individual User Flows

### Alice's Conservative Flow
```
1. Faucet: Get 100 USDT
2. SY Deposit: 50 USDT → lxSY shares
3. Hold: Earn 8% APY automatically
4. Check: Monitor vault performance via analytics
5. Withdraw: Convert lxSY back to USDT (with gains)
```

### Bob's Advanced Trading Flow  
```
1. Faucet: Get 100 USDT
2. SY Deposit: 80 USDT → lxSY shares  
3. Split: lxSY → PYT (yield rights) + NYT (principal protection)
4. Trade: Sell NYT, keep PYT for max yield exposure
5. Claim: Regular yield claims from PYT
6. Recombine: (Optional) PYT + NYT → lxSY shares
7. Exit: Withdraw to USDT
```

### Charlie's Passive Flow
```
1. Faucet: Get 100 USDT
2. AutoCompound Deposit: 100 USDT → acUSDT shares
3. Wait: Automatic compounding increases share value
4. Monitor: Check APY and total value growth
5. Withdraw: Convert acUSDT → USDT (compounded)
```

### Dave's Arbitrage Flow
```
1. Multi-source: Get USDT from multiple sources
2. Analyze: Compare yields across SY, AutoCompound, PYT markets
3. Execute: Complex multi-step arbitrage
   - Deposit to highest yield
   - Short overpriced PYT
   - Long underpriced NYT  
4. Rebalance: Continuous optimization
5. Profit: Extract arbitrage gains
```

## 🤝 Integrated Multi-User Scenarios

### Scenario A: Yield Discovery Market
**Participants**: Alice (SY holder) + Bob (PYT buyer)
```
Alice: Deposits 100 USDT → SY → Splits to PYT+NYT
Bob: Buys Alice's PYT for premium (future yield rights)
Alice: Keeps NYT (principal protection) + gets immediate premium
Result: Alice gets guaranteed principal + premium, Bob gets all future yield
```

### Scenario B: Risk Transfer Market  
**Participants**: Conservative Charlie + Risk-seeking Dave
```
Charlie: Wants principal protection, deposits to SY → splits → keeps NYT
Dave: Wants max yield, buys PYT from Charlie
Charlie: Gets principal protection at maturity
Dave: Gets all yield rights, takes on risk
```

### Scenario C: Liquidity Provision
**Participants**: Multiple users creating liquid markets
```
User 1: Provides PYT liquidity to DEX
User 2: Provides NYT liquidity to DEX  
User 3: Arbitrages between SY direct deposits and PYT/NYT market prices
Result: Efficient price discovery and liquid secondary markets
```

### Scenario D: Cross-Strategy Optimization
**Participants**: Smart users maximizing across all strategies
```
User 1: 40% SY (diversification), 30% AutoCompound (passive), 30% PYT trading
User 2: Provides liquidity between different strategies
User 3: Runs arbitrage bots across all strategies
Result: Ecosystem-wide yield optimization
```

## 📊 Testing Matrix

### Single User Tests (per persona):
| User Type | Contract | Actions | Expected Results |
|-----------|----------|---------|------------------|
| Alice | SY Vault | Deposit → Hold → Withdraw | 8% APY, simple UX |
| Bob | PYT/NYT | Deposit → Split → Trade → Claim | Advanced yield control |
| Charlie | AutoCompound | Deposit → Wait → Withdraw | Automatic compounding |
| Dave | Multi-contract | Complex arbitrage flows | Profit from inefficiencies |

### Multi-User Integration Tests:
| Scenario | Contracts | Users | Interaction Type |
|----------|-----------|-------|------------------|
| Yield Transfer | SY + PYT/NYT | Alice + Bob | PYT trading |
| Risk Transfer | SY + PYT/NYT | Charlie + Dave | NYT trading |
| Arbitrage | All | Dave + Others | Cross-strategy arbitrage |
| Liquidity | PYT/NYT + DEX | Multiple | Market making |

## 🎯 Implementation Priority

### Phase 1: Individual Flows ✅
- [x] Faucet system working
- [x] SY Vault basic operations  
- [ ] PYT/NYT splitting/recombining
- [ ] AutoCompound functionality

### Phase 2: Advanced Features
- [ ] Yield claiming from PYT
- [ ] NYT maturity handling
- [ ] Cross-contract arbitrage
- [ ] Strategy rebalancing

### Phase 3: Multi-User Integration  
- [ ] PYT/NYT secondary markets
- [ ] Cross-user yield transfers
- [ ] Liquidity provision incentives
- [ ] Advanced arbitrage bots

## 🧪 E2E Test Scenarios

### Test 1: Simple Alice Journey
```bash
./test-alice-conservative-flow.sh
# Tests: Faucet → SY Deposit → Yield Accrual → Withdraw
```

### Test 2: Advanced Bob Journey  
```bash
./test-bob-trading-flow.sh
# Tests: Faucet → SY → Split → PYT/NYT → Claim → Recombine → Exit
```

### Test 3: Passive Charlie Journey
```bash
./test-charlie-passive-flow.sh  
# Tests: Faucet → AutoCompound → Wait → Compound → Withdraw
```

### Test 4: Multi-User Integration
```bash
./test-multi-user-integration.sh
# Tests: Multiple users interacting across all contracts simultaneously
```

Each test script will validate:
- ✅ Contract state changes
- ✅ Token balance updates  
- ✅ Gas delegation working
- ✅ Event emissions
- ✅ Cross-contract interactions
- ✅ User experience flows