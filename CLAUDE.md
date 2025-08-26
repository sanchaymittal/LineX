# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LineX is a cross-border remittance platform built as a LINE Mini DApp, leveraging Kaia blockchain for instant, low-cost transfers between Korea and Southeast Asia using KRW/USDT Stablecoins as the settlement layer. The platform features a **Web3-first architecture** with frontend wallet connections and user-authorized gasless transactions.

**NEW: Streamlined DeFi Integration** - LineX features a clean, economically sound DeFi yield farming system with 2 core contracts on Kaia testnet: StandardizedYield (multi-strategy diversification) and AutoCompoundVault (single-strategy optimization) for profitable stablecoin yield farming.

## Technology Stack

### Backend (Web3 Architecture)
- **Runtime**: Node.js 20+ with TypeScript
- **Package Manager**: pnpm (fast, efficient dependency management)
- **Framework**: Express.js
- **Storage**: Redis 7+ (primary storage with persistence)
- **Blockchain**: Kaia testnet (Kairos) with @kaiachain/ethers-ext SDK
- **Smart Contracts**: Foundry + OpenZeppelin v5.x
- **Wallet Integration**: Frontend-first Web3 connections (Web3Auth, WalletConnect, etc.)

### Key Technologies
- **Smart Contract Development**: Foundry toolchain with OpenZeppelin v5.1.0 contracts
- **TestUSDT Contract**: Production-ready ERC-20 token with faucet functionality for Kaia testnet
- **DeFi Smart Contracts**: StandardizedYield (ERC4626 multi-strategy) and AutoCompoundVault (single-strategy auto-compound) deployed on Kaia testnet
- **Authentication**: Simple JWT tokens with wallet address as identifier
- **API Design**: RESTful with standardized JSON responses
- **State Management**: Redis key-value store with TTL
- **Wallet Flow**: User-authorized gasless transfers with EIP-712 signatures
- **DeFi Integration**: Clean yield farming system focused on profitable stablecoin strategies without complex tokenomics

## Architecture Transformation

### Web3-First Design
The platform has been completely refactored from LINE-centric to Web3-native:
- **Frontend Wallet Connections**: Frontend handles all wallet provider connections (Web3Auth, MetaMask, WalletConnect)
- **Address-Based Identity**: Wallet addresses are the primary user identifier (no LINE user IDs)
- **Anonymous Quotes**: Quote generation requires no user identification
- **User-Authorized Transfers**: Users sign EIP-712 messages to authorize transfers while platform pays gas
- **Implicit User Creation**: Users are created automatically on first transfer

### Core Service Architecture

```
Frontend (Web3 Wallets) 
    ↓ HTTP API calls with wallet signatures
Express.js Server (Vercel Serverless)
    ↓ Data persistence (address-based keys)
Redis (Upstash - hosted)
    ↓ Blockchain operations (user-authorized)
Kaia Network (Testnet)
    ↓ Smart contract interactions (gasless)
TestUSDT Contract (Base Asset)
    ↓ Clean DeFi Architecture
├── StandardizedYield - Multi-strategy diversified vault (Bob's workflow)
└── AutoCompoundVault - Single-strategy auto-compound vault (Alice's workflow)
```

### Request Flow Architecture
1. **Frontend connects wallet** → Any Web3 provider (Web3Auth, MetaMask, etc.)
2. **API Request with signature** → Express middleware (validation, logging)
3. **Service Layer** → Business logic with EIP-712 signature verification
4. **Data Layer** → Redis operations using wallet addresses as keys
5. **Blockchain Layer** → User-authorized gasless transactions via fee delegation

## Development Commands

### Essential Commands
- **Install**: `pnpm install` (faster than npm)
- **Backend Dev**: `pnpm run dev` (auto-recompile with nodemon)
- **Dev with Redis**: `pnpm run dev:redis` (starts Redis in Docker then dev server)
- **Build**: `pnpm run build` (TypeScript → dist/ + copies to api/ for Vercel)
- **Start Production**: `pnpm run start` (runs built dist/index.js)
- **Clean**: `pnpm run clean` (removes dist/ and logs/)

### Smart Contract Commands
- **Contract Build**: `pnpm run forge:build`
- **Contract Test**: `pnpm run forge:test`
- **Deploy to Testnet**: `pnpm run forge:deploy:testnet`

### Code Quality
- **Lint**: `pnpm run lint` (ESLint check)
- **Lint Fix**: `pnpm run lint:fix` (auto-fix ESLint issues)
- **Format**: `pnpm run format` (Prettier formatting)
- **Format Check**: `pnpm run format:check` (check formatting)

### Testing
- **Backend Testing**: No test framework currently implemented (test script is placeholder)
- **API Testing**: Manual testing via curl commands (all endpoints validated)
- **Contract Testing**: `pnpm run forge:test` (50+ passing tests across 4 comprehensive test files)
  - **TestUSDT.t.sol**: 9 tests - ERC-20 functionality, minting, pausing, permits
  - **StandardizedYield.t.sol**: 17 tests - Multi-strategy allocation, ERC4626 compliance, yield accrual
  - **AutoCompoundVault.t.sol**: 23 tests - Auto-harvest, compounding, strategy migration
  - **Integration.t.sol**: 4+ tests - Cross-vault comparison, workflow testing, stress scenarios

### Local Development Setup
```bash
# Start Redis in Docker (via script)
./scripts/start-redis.sh

# Or manually with Docker
docker run -d -p 6379:6379 redis:7-alpine
```

## Core Service Layers

### Blockchain Services (`src/services/blockchain/`)
- **KaiaProviderManager**: Connection management with reconnection logic
- **FeeDelegationService**: User-authorized gasless transfers with EIP-712 verification
- **SimpleContractService**: TestUSDT contract interactions and balance queries

### Business Logic Services (`src/services/`)
- **QuoteService**: Anonymous quote generation with fixed exchange rates
- **TransferService**: User-authorized transfer orchestration with immediate execution
- **WalletService**: Address-based user management and faucet operations
- **RedisService**: JSON data storage with TTL support

### API Layer (`src/api/`)
- **Routes**: RESTful endpoints for quotes, transfers, wallets
- **Middleware**: Auth (wallet-based), validation, error handling
- **Webhooks**: Mock payment webhooks (simplified from DappPortal approach)

## Key Architectural Principles

### Frontend-First Wallet Management
- Frontend handles all wallet provider connections
- Backend receives connected wallet addresses and user signatures
- No private key storage or complex signing session management
- Supports any Web3 wallet provider (Web3Auth, MetaMask, WalletConnect, etc.)

### User-Authorized Gasless Transactions
- Users sign EIP-712 messages to authorize transfers
- Platform pays gas fees using KIP-247 fee delegation
- Users maintain full control over their funds
- No backend wallet management complexity

### Address-Based Data Storage
Redis key patterns:
```
user:{walletAddress} → User data (JSON)
transfer:{id} → Transfer state (JSON)  
quote:{id} → Quote data (JSON, TTL: 5min)
session:{token} → User session (JSON, TTL: 12hr)
```

## API Endpoints

### Core Endpoints
- `POST /api/v1/quote` - Generate anonymous transfer quote
- `POST /api/v1/transfer` - Create and execute user-authorized transfer
- `GET /api/v1/transfer/:id` - Get transfer status
- `GET /api/v1/transfer/user/:address` - Get user's transfer history
- `GET /api/v1/wallet/:address` - Get user information
- `GET /api/v1/wallet/:address/balance` - Get wallet balance
- `POST /api/v1/wallet/faucet` - User-authorized faucet claim
- `GET /health` - Health check

### Transfer Flow (Simplified)
1. Frontend generates anonymous quote
2. User signs EIP-712 transfer authorization
3. Frontend sends signed transfer request to backend
4. Backend executes gasless transfer immediately
5. Transfer status returned (COMPLETED/FAILED)

## Environment Configuration

Required environment variables:
- **Storage**: `REDIS_URL`
- **Blockchain**: `KAIA_RPC_URL`, `KAIA_CHAIN_ID=1001`
- **Smart Contracts**: 
  - `TEST_USDT_CONTRACT_ADDRESS` - Base ERC-20 stablecoin for yield farming
  - `STANDARDIZED_YIELD_ADDRESS` - Multi-strategy diversified vault (ERC4626)
  - `AUTO_COMPOUND_VAULT_ADDRESS` - Single-strategy auto-compound vault
- **Security**: `JWT_SECRET`
- **Gas Delegation**: `GAS_PAYER_PRIVATE_KEY`
- **Demo**: `DEMO_MODE=true`, `LOG_LEVEL=info`

## Deployment Architecture

### Vercel Serverless Deployment ✅ 
- **Build Process**: TypeScript compiles to `dist/`, then copies to `api/` directory
- **Entry Point**: `api/index.js` (Vercel serverless function)
- **Function Timeout**: 10 seconds (configured for service initialization)
- **Cold Start Handling**: Services initialize with graceful degradation
- **Connection Management**: Redis and Kaia connections cached between invocations

### Build Pipeline
```
Source (src/) → TypeScript Compile (dist/) → Copy to API (api/) → Vercel Deploy
```

## Implementation Status

### ✅ Completed: Web3 Architecture Refactoring
- **Complete LINE User ID Removal**: All `lineUserId` dependencies eliminated
- **Web3-First Design**: Frontend-first wallet connections with any Web3 provider
- **User-Authorized Gasless Transfers**: EIP-712 signature verification for secure fund control
- **Anonymous Quotes**: Quote generation requires no user identification  
- **Address-Based Storage**: Redis patterns using wallet addresses as primary keys
- **API Modernization**: All endpoints converted to address-based operations
- **Security Enhancement**: Fixed fee delegation to require user authorization
- **Implicit User Management**: Users created automatically on first transfer

### ✅ Completed: Core Infrastructure
- **Express Server**: Full middleware stack with CORS, auth, validation, error handling
- **Redis Integration**: Connection management with TTL support
- **Kaia Blockchain**: Provider management with testnet connection (Kairos)
- **TestUSDT Contract**: Production-ready ERC-20 with faucet functionality for testing
- **Fee Delegation**: KIP-247 gasless transactions with user authorization via EIP-712 signatures
- **Production Deployment**: Live on Vercel with all services operational
- **API Validation**: All endpoints tested and working correctly (health, quotes, transfers, wallet balance, DeFi operations)

### ✅ Completed: Streamlined DeFi Smart Contract Architecture
- **Clean Architecture**: 2-contract system focused on profitable stablecoin yield farming
- **StandardizedYield (ERC4626)**: Multi-strategy diversified vault with risk management (~9.5% blended APY)
- **AutoCompoundVault**: Single-strategy auto-compound vault with maximum efficiency (~10-12% compounded APY)
- **Eliminated Complex Tokenomics**: Removed PYT/NYT splitting that doesn't add value for pegged assets
- **Fee Delegation Service**: Real blockchain calls for deposit, withdraw, harvest, and rebalancing
- **DeFi Service Layer**: 2 focused services (StandardizedYield, AutoCompound) without redundant complexity
- **Type Safety**: Full TypeScript integration with Kaia SDK (@kaiachain/ethers-ext v2.0.8)

### ✅ Completed: Architectural Cleanup and Simplification
- **Removed Flawed Economics**: Eliminated PYT/NYT tokenization system that doesn't work for stablecoins
- **Eliminated Redundancy**: Removed YieldSet contract redundant with StandardizedYield functionality
- **Contract Cleanup**: Removed 10+ unnecessary contracts, wrapper layers, and utility files
- **Service Streamlining**: Consolidated from 7 services to 2 focused services
- **Test Suite Optimization**: Updated to 50+ passing tests across 4 focused test files
- **Deployment Simplification**: Clean deployment scripts for 2-contract architecture
- **Economic Soundness**: Focus on profitable yield farming without broken backing requirements

### Smart Contract Specifications ✅
- **TestUSDT Contract**: ERC-20 with 6 decimals, faucet functionality for testing
- **StandardizedYield**: ERC4626-compatible multi-strategy vault with automated rebalancing
- **AutoCompoundVault**: Beefy-style single-strategy vault with harvest-on-deposit
- **Gas Delegation**: Platform pays gas while users control funds via EIP-712 signatures
- **Foundry**: v1.2.3 with OpenZeppelin v5.1.0 for security and reliability
- **Comprehensive Testing**: 50+ tests across 4 test files validating all functionality

## DeFi Architecture Philosophy

### Economic Principles
LineX DeFi was deliberately simplified from a complex multi-contract system to focus on **economic fundamentals**:

**What Was Removed and Why:**
- ❌ **PYT/NYT Token Splitting** - Complex tokenization doesn't add economic value for stablecoins (pegged assets)
- ❌ **YieldSet Portfolio Manager** - Redundant functionality already provided by StandardizedYield
- ❌ **Wrapper Contracts** - Unnecessary abstraction layers that complicate user experience
- ❌ **Complex Backing Requirements** - Broken economics requiring extensive funding without clear value

**What Remains - Core Value:**
- ✅ **Two Distinct Products** with clear value propositions and target users
- ✅ **Profitable Yield Farming** without unsustainable economic models
- ✅ **Clean Architecture** for long-term maintainability and user understanding
- ✅ **Real Economic Benefits** - diversification (SY) vs optimization (AutoCompound)

### Product Differentiation

| Feature | StandardizedYield (Bob) | AutoCompoundVault (Alice) |
|---------|-------------------------|---------------------------|
| **Strategy** | Multi-strategy (diversified) | Single-strategy (focused) |
| **Risk Level** | Lower (risk management) | Higher (concentrated) |
| **Expected APY** | ~9.5% blended | ~10-12% compounded |
| **Target User** | Risk-averse, diversification seekers | Yield maximalists, efficiency seekers |
| **Composability** | ERC4626 standard compliance | Custom optimized interface |

## Development Guidelines

### Package Management
- **Use pnpm** instead of npm for all operations
- Deterministic builds with pnpm-lock.yaml
- Optimized dependency resolution and disk usage

### Code Standards
- Use TypeScript strict mode with explicit type annotations
- Follow functional programming principles where appropriate
- Implement comprehensive error handling with typed errors
- Log all critical operations with structured logging

### Security Best Practices
- Never log sensitive information (private keys, passwords, tokens)
- Validate all inputs and EIP-712 signatures
- Store only public wallet addresses (no private keys)
- Use environment variables for all configuration

### Performance Targets
- API response time: < 500ms
- Quote generation: < 1 second
- Transfer execution: < 15 seconds
- Health checks: < 200ms

## API Testing Procedures

### Manual API Testing
Use curl commands to test endpoints after starting dev server:
```bash
# Start development server with Redis
pnpm run dev:redis

# Test health check
curl -s http://localhost:3000/health | jq

# Test anonymous quote generation
curl -s -X POST http://localhost:3000/api/v1/quote \
  -H "Content-Type: application/json" \
  -d '{"fromCurrency": "USD", "toCurrency": "PHP", "fromAmount": 100}' | jq

# Test wallet balance (USDT only, no KAIA needed)
curl -s http://localhost:3000/api/v1/wallet/0x742d35Cc8C29B3C4C4f0e9E0E0b24C2c2e5C5e5C/balance | jq

# Test user-authorized transfer (requires valid EIP-712 signature)
curl -s -X POST http://localhost:3000/api/v1/transfer \
  -H "Content-Type: application/json" \
  -d '{"quoteId": "...", "from": "0x...", "to": "0x...", "signature": "0x...", "nonce": 1, "deadline": 1723605600}' | jq
```

### Expected API Behavior
- **Anonymous Quotes**: Work without user identification
- **EIP-712 Validation**: All user-authorized operations require valid signatures
- **Implicit Users**: Users created automatically on first transfer attempt
- **Gasless Design**: Only USDT balance shown (platform pays gas fees)

## Troubleshooting

### Common Development Issues
1. **"Cannot connect to Redis"**: Start Redis with `./scripts/start-redis.sh`
2. **"Cannot find module './app'"**: Run `pnpm run build` to generate api/ directory
3. **TypeScript errors on build**: Check explicit type annotations in routes and middleware
4. **Contract call failures**: Verify KAIA_RPC_URL and contract address in environment
5. **BigInt serialization errors**: Ensure all BigInt values converted to strings before JSON response

### Contract Documentation
For comprehensive details about the smart contract architecture, see `contract_guide.md` which includes:
- Complete architectural overview and philosophy
- Detailed contract specifications and interactions
- Product comparison and economic analysis
- Testing strategy and verification results
- Deployment information and integration points

### Production Deployment Issues
1. **Function timeout**: Increase maxDuration in vercel.json (current: 10s)
2. **Module resolution errors**: Ensure `cp -r dist/* api/` copies all files
3. **Environment variables**: Configure all required vars in Vercel dashboard
4. **Cold start failures**: Check service initialization graceful degradation

---

## Summary

LineX represents a **streamlined, economically sound** approach to cross-border remittance with integrated DeFi yield farming:

- **🌐 Cross-Border Platform**: Web3-first remittance using Kaia blockchain and USDT stablecoins
- **🏦 StandardizedYield**: Multi-strategy diversified vault for risk-conscious users (Bob's workflow)
- **🚀 AutoCompoundVault**: Single-strategy optimized vault for yield maximalists (Alice's workflow)
- **⚡ Clean Architecture**: Eliminated complex tokenomics, focused on profitable fundamentals
- **🧪 Comprehensive Testing**: 50+ tests validating all critical functionality
- **💰 Real Economic Value**: Sustainable yield farming without broken economics

*This guide provides complete technical context for working with the LineX codebase. For detailed smart contract information, refer to `contract_guide.md`.*