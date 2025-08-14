# LineX API Documentation

## Overview

LineX provides a comprehensive REST API for cross-border remittance using USDT stablecoins on the Kaia blockchain. This API features a **Web3-first architecture** with frontend wallet connections, anonymous quotes, and user-authorized gasless transactions.

## Deployment Status ✅

- **Production API**: https://linex-backend-qahxq1b0f-sanchaymittals-projects.vercel.app
- **Status**: Fully operational with validated endpoints
- **Network**: Kaia Testnet (Kairos) - Chain ID: 1001
- **TestUSDT Contract**: `0x09D48C3b2DE92DDfD26ebac28324F1226da1f400`
- **Performance**: Cold start ~2-3s, warm requests <500ms
- **Architecture**: Address-based, gasless transactions with EIP-712 signatures

## Web3-First Architecture

### Key Features
- **Frontend Wallet Connections**: Any Web3 provider (Web3Auth, MetaMask, WalletConnect)
- **Anonymous Quotes**: No user identification required
- **User-Authorized Transfers**: EIP-712 signatures for secure fund control
- **Gasless Transactions**: Platform pays gas fees, users control funds
- **Implicit User Creation**: Users created automatically on first transfer

### Base URLs
- **Local Development**: `http://localhost:3000`
- **Production**: `https://linex-backend-qahxq1b0f-sanchaymittals-projects.vercel.app`

## Quick Start Examples

### 1. Health Check
```bash
# Local
curl http://localhost:3000/health | jq

# Production
curl https://linex-backend-qahxq1b0f-sanchaymittals-projects.vercel.app/health | jq
```

### 2. Generate Anonymous Quote
```bash
curl -X POST http://localhost:3000/api/v1/quote \
  -H "Content-Type: application/json" \
  -d '{
    "fromCurrency": "USD",
    "toCurrency": "PHP",
    "fromAmount": 100
  }' | jq
```

### 3. Check Wallet Balance (USDT only)
```bash
curl http://localhost:3000/api/v1/wallet/0x742d35Cc8C29B3C4C4f0e9E0E0b24C2c2e5C5e5C/balance | jq
```

### 4. User-Authorized Transfer (Requires Valid EIP-712 Signature)
```bash
curl -X POST http://localhost:3000/api/v1/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "quoteId": "quote-uuid-here",
    "from": "0x742d35Cc8C29B3C4C4f0e9E0E0b24C2c2e5C5e5C",
    "to": "0x123d35Cc8C29B3C4C4f0e9E0E0b24C2c2e5C1234",
    "signature": "0x1234567890...",
    "nonce": 1,
    "deadline": 1723605600
  }' | jq
```

### 5. Check Transfer Status
```bash
curl http://localhost:3000/api/v1/transfer/{transferId} | jq
```

## API Endpoints

### Health & Monitoring
- `GET /health` - Comprehensive health check (Redis, blockchain, contract)

### Quote Operations (Anonymous)
- `POST /api/v1/quote` - Generate anonymous quote
- `GET /api/v1/quote/{quoteId}` - Get quote details
- `GET /api/v1/quote/{quoteId}/validate` - Validate quote
- `GET /api/v1/quote/rates/current` - Get current exchange rates
- `GET /api/v1/quote/currencies/pairs` - Get supported currency pairs

### Wallet Management (Address-Based)
- `GET /api/v1/wallet/{address}` - Get user information by wallet address
- `GET /api/v1/wallet/{address}/balance` - Get USDT balance (no KAIA needed)
- `GET /api/v1/wallet/{address}/transfers` - Get user's transfer history
- `POST /api/v1/wallet/faucet` - User-authorized faucet claim (requires signature)

### Transfer Operations (User-Authorized)
- `POST /api/v1/transfer` - Create and execute user-authorized transfer
- `GET /api/v1/transfer/{transferId}` - Get transfer status
- `GET /api/v1/transfer/user/{address}` - Get user's transfer history
- `POST /api/v1/transfer/{transferId}/cancel` - Cancel transfer

### Webhooks (Simplified)
- `POST /api/v1/webhook/mock` - Mock payment webhook for testing

## Response Format

All API responses follow a standard format:

### Success Response
```json
{
  "success": true,
  "data": {
    // Response data here
  },
  "error": null,
  "metadata": {
    "timestamp": "2024-01-01T00:00:00Z",
    "requestId": "uuid-here"
  }
}
```

### Error Response
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {}
  },
  "metadata": {
    "timestamp": "2024-01-01T00:00:00Z",
    "requestId": "uuid-here"
  }
}
```

## Transfer States

Simplified transfer lifecycle:

1. **PENDING** - Transfer created, awaiting execution
2. **PROCESSING** - Transaction being processed on blockchain
3. **COMPLETED** - Transfer completed successfully
4. **FAILED** - Transfer failed (invalid signature, insufficient balance, etc.)
5. **EXPIRED** - Transfer expired due to deadline

## EIP-712 Signature Requirements

### Transfer Authorization
Users must sign EIP-712 messages to authorize transfers:

```javascript
const domain = {
  name: 'LineX Transfer',
  version: '1',
  chainId: 1001, // Kaia testnet
  verifyingContract: '0x09D48C3b2DE92DDfD26ebac28324F1226da1f400'
};

const types = {
  Transfer: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ]
};

const value = {
  from: '0x742d35Cc8C29B3C4C4f0e9E0E0b24C2c2e5C5e5C',
  to: '0x123d35Cc8C29B3C4C4f0e9E0E0b24C2c2e5C1234',
  amount: '100000000', // 100 USDT (6 decimals)
  nonce: 1,
  deadline: 1723605600
};
```

### Faucet Authorization
Similar EIP-712 signature required for faucet claims.

## Exchange Rates

Current fixed exchange rates (includes 0.5% platform fee):
- 1 USD = 1,150 KRW
- 1 USD = 56 PHP
- 1 KRW = 0.00087 USD
- 1 PHP = 0.0179 USD

## Authentication

Currently no authentication required for most endpoints (demo mode). Future implementation may include:
- JWT tokens with wallet address as identifier
- Message signing for authentication

## Error Codes

Common error codes:
- `VALIDATION_ERROR` - Invalid request parameters
- `QUOTE_NOT_FOUND` - Quote not found or expired
- `QUOTE_GENERATION_FAILED` - Failed to generate quote
- `TRANSFER_NOT_FOUND` - Transfer ID not found
- `TRANSFER_CREATION_FAILED` - Failed to create transfer
- `FAUCET_CLAIM_FAILED` - Failed to claim faucet
- `BALANCE_FETCH_FAILED` - Failed to fetch wallet balance
- `USER_NOT_FOUND` - No user found for wallet address
- `INVALID_TOKEN` - Invalid or expired token
- `UNAUTHORIZED` - Authorization required
- `INTERNAL_ERROR` - Server error

## Specific Error Messages

### EIP-712 Signature Validation
- `Invalid authorization signature` - Signature verification failed
- `Invalid faucet authorization signature` - Faucet signature invalid
- `Signature deadline has passed` - Signature expired

### Currency Validation
- `Invalid from currency. Supported: USD, KRW, PHP` - Unsupported source currency
- `Invalid to currency. Supported: USD, KRW, PHP` - Unsupported destination currency

## Testing

### Test Wallet Addresses
- Sender: `0x742d35Cc8C29B3C4C4f0e9E0E0b24C2c2e5C5e5C`
- Recipient: `0x123d35Cc8C29B3C4C4f0e9E0E0b24C2c2e5C1234`

### Test USDT Contract
- Address: `0x09D48C3b2DE92DDfD26ebac28324F1226da1f400`
- Network: Kaia Testnet (Kairos)
- Chain ID: 1001
- Decimals: 6
- Faucet: 100 USDT per claim (24-hour cooldown)

### Expected API Behavior
- **Anonymous Quotes**: Work without user identification
- **EIP-712 Validation**: All user-authorized operations require valid signatures
- **Implicit Users**: Users created automatically on first transfer attempt
- **Gasless Design**: Only USDT balance shown (platform pays gas fees)
- **Immediate Execution**: Transfers execute immediately upon creation (no separate execute step)

## Rate Limits

- Global rate limit: 100 requests per minute per IP
- Quote generation: 20 per minute per IP
- Transfer creation: 10 per minute per IP  
- Faucet requests: 1 per day per wallet address

## Frontend Integration

### Recommended Flow
1. **Connect Wallet**: Frontend handles wallet connection (Web3Auth, MetaMask, etc.)
2. **Generate Quote**: Call quote API anonymously
3. **Sign Authorization**: User signs EIP-712 message for transfer
4. **Submit Transfer**: Send signed transfer request to API
5. **Monitor Status**: Poll transfer status endpoint for completion

### Web3 Provider Support
- ✅ Web3Auth (social login wallets)
- ✅ MetaMask
- ✅ WalletConnect
- ✅ Any ethers.js compatible provider

## Support

For API support or questions:
- GitHub: https://github.com/sanchaymittal/LineX
- API Documentation: http://localhost:3000/api-docs (when available)

## Changelog

### v2.0.0 - Web3 Architecture Refactoring
- ✅ Complete removal of LINE user ID dependencies
- ✅ Anonymous quote generation
- ✅ Address-based user management
- ✅ EIP-712 signature verification
- ✅ Gasless transaction implementation
- ✅ Simplified transfer flow with immediate execution
- ✅ USDT-only balance reporting
- ✅ All endpoints validated and working