# LineX API Documentation

## Overview

LineX provides a comprehensive REST API for cross-border remittance using USDT stablecoins on the Kaia blockchain. This API enables instant, low-cost transfers between Korea and Southeast Asia with gasless transactions.

## Documentation Access

### Interactive Swagger UI
- **Local Development**: http://localhost:3000/api-docs
- **Production**: https://api.linex.io/api-docs (TBD)

### OpenAPI Specification
- **YAML Format**: http://localhost:3000/api-docs/openapi.yaml
- **JSON Format**: http://localhost:3000/api-docs/openapi.json

## Quick Start

### 1. Health Check
```bash
curl http://localhost:3000/health
```

### 2. Connect Wallet
```bash
curl -X POST http://localhost:3000/api/v1/wallet/connect \
  -H "Content-Type: application/json" \
  -d '{
    "lineUserId": "U123456789",
    "walletAddress": "0x1234567890123456789012345678901234567890"
  }'
```

### 3. Generate Quote
```bash
curl -X POST http://localhost:3000/api/v1/quote \
  -H "Content-Type: application/json" \
  -d '{
    "fromCurrency": "USD",
    "toCurrency": "KRW",
    "fromAmount": 100,
    "lineUserId": "U123456789"
  }'
```

### 4. Create Transfer
```bash
curl -X POST http://localhost:3000/api/v1/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "quoteId": "quote-uuid-here",
    "sender": {
      "lineUserId": "U123456789",
      "country": "US",
      "name": "John Doe"
    },
    "recipient": {
      "lineUserId": "U987654321",
      "country": "KR",
      "name": "Jane Kim"
    },
    "gasless": true
  }'
```

### 5. Check Transfer Status
```bash
curl http://localhost:3000/api/v1/transfer/{transferId}
```

## API Endpoints

### Health & Monitoring
- `GET /` - API root with endpoint discovery
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed system health
- `GET /health/ready` - Readiness probe
- `GET /health/live` - Liveness probe

### Wallet Management
- `POST /api/v1/wallet/connect` - Connect LINE user to wallet
- `GET /api/v1/wallet/{lineUserId}` - Get user wallet info
- `GET /api/v1/wallet/{lineUserId}/balance` - Get wallet balance
- `POST /api/v1/wallet/faucet` - Request test USDT (100 USDT/day)

### Quote Operations
- `POST /api/v1/quote` - Generate new quote
- `GET /api/v1/quote/{quoteId}` - Get quote details
- `GET /api/v1/quote/rates` - Get current exchange rates

### Transfer Operations
- `POST /api/v1/transfer` - Create new transfer
- `GET /api/v1/transfer/{transferId}` - Get transfer status
- `POST /api/v1/transfer/{transferId}/execute` - Execute transfer
- `POST /api/v1/transfer/{transferId}/cancel` - Cancel transfer
- `GET /api/v1/transfer/user/{lineUserId}` - Get user's transfer history

### Webhooks
- `POST /api/v1/webhook/dappportal` - DappPortal signing callbacks

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

The transfer lifecycle follows these states:

1. **PENDING** - Transfer created, awaiting validation
2. **QUOTE_VALIDATED** - Quote validated, ready for signing
3. **SIGNING** - User signing transaction
4. **PROCESSING** - Transaction being processed on blockchain
5. **COMPLETED** - Transfer completed successfully
6. **FAILED** - Transfer failed
7. **EXPIRED** - Transfer expired
8. **CANCELLED** - Transfer cancelled by user

## Exchange Rates

Current fixed exchange rates (includes 0.5% platform fee):
- 1 USD = 1,150 KRW
- 1 USD = 56 PHP
- 1 KRW = 0.00087 USD
- 1 PHP = 0.0179 USD

## Authentication

Currently using simple Bearer token authentication (demo mode). Include the token in the Authorization header:

```bash
Authorization: Bearer {token}
```

## Rate Limits

- Global rate limit: 100 requests per minute
- Quote generation: 20 per minute
- Transfer creation: 10 per minute
- Faucet requests: 1 per day per user

## Webhook Security

DappPortal webhooks are verified using HMAC-SHA256 signatures:

```
X-Webhook-Signature: sha256=<signature>
```

## Error Codes

Common error codes:
- `VALIDATION_ERROR` - Invalid request parameters
- `WALLET_NOT_FOUND` - Wallet not connected for user
- `QUOTE_EXPIRED` - Quote has expired (5 minute TTL)
- `TRANSFER_NOT_FOUND` - Transfer ID not found
- `INSUFFICIENT_BALANCE` - Insufficient USDT balance
- `DAILY_LIMIT_REACHED` - Faucet daily limit reached
- `SYSTEM_UNHEALTHY` - One or more services are down

## Testing

### Test Wallet Addresses
- Sender: `0x1234567890123456789012345678901234567890`
- Recipient: `0x9876543210987654321098765432109876543210`

### Test LINE User IDs
- Sender: `test-user-123`
- Recipient: `test-recipient-456`

### Test USDT Contract
- Address: `0x09D48C3b2DE92DDfD26ebac28324F1226da1f400`
- Network: Kaia Testnet (Kairos)
- Chain ID: 1001

## Support

For API support or questions:
- Email: support@linex.io
- GitHub: https://github.com/lineX/backend
- Documentation: http://localhost:3000/api-docs