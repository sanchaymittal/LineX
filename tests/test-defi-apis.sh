#!/bin/bash

# LineX DeFi API Testing Script - Updated for Real Smart Contracts
# Usage: ./test-defi-apis.sh [base_url]
# Default: http://localhost:3000

BASE_URL=${1:-"http://localhost:3000"}
TEST_USER="0x742d35Cc8C29B3C4C4f0e9E0E0b24C2c2e5C5e5C"

echo "🚀 Testing LineX DeFi APIs - Real Smart Contract Integration"
echo "📡 Base URL: $BASE_URL"
echo "👤 Test User: $TEST_USER"
echo ""
echo "📋 Deployed Contracts (Kaia Testnet):"
echo "  🏦 SY Vault: 0x13cFf25b9ce2F409b7e96F7C572234AF8e060420"
echo "  💎 PYT Token: 0x697c8e45e86553A075bFA7DaBDb3C007d9E468Ab"
echo "  🛡️ NYT Token: 0xe10b7374a88139104F0A5Ac848E7C95291F1FA39"
echo "  🎭 Orchestrator: 0x8AcE67656eaf0442886141A10DF2Ea3f9862bA11"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to test endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local description=$3
    local data=$4
    
    echo -e "${YELLOW}Testing: $description${NC}"
    echo "  $method $endpoint"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint" -H "Content-Type: application/json")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" \
                   -H "Content-Type: application/json" \
                   -d "$data")
    fi
    
    # Get HTTP status code (last line)
    http_code=$(echo "$response" | tail -n1)
    # Get response body (everything except last line)
    body=$(echo "$response" | sed '$d')
    
    if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
        echo -e "  ✅ ${GREEN}Status: $http_code${NC}"
        echo "  📝 Response: $(echo "$body" | jq -r '.data.message // .success // "Success"' 2>/dev/null || echo "Success")"
    else
        echo -e "  ❌ ${RED}Status: $http_code${NC}"
        echo "  📝 Error: $(echo "$body" | jq -r '.error // .message // "Unknown error"' 2>/dev/null || echo "Error")"
    fi
    echo ""
}

# Test server connectivity
echo "=== 📡 CONNECTIVITY TESTS ==="
test_endpoint "GET" "/health" "Health Check"
test_endpoint "GET" "/" "API Root"

echo "=== 🏦 CORE VAULT OPERATIONS (Real SY Vault) ==="
test_endpoint "GET" "/api/v1/defi/vault/apy" "Get Vault APY (8% configured)"
test_endpoint "GET" "/api/v1/defi/vault/stats" "Get SY Vault Statistics"
test_endpoint "GET" "/api/v1/defi/vault/balance/$TEST_USER" "Get User SY Balance"
test_endpoint "GET" "/api/v1/defi/vault/metrics" "Get Yield Metrics"

echo "=== 🔄 PYT/NYT OPERATIONS (Real Token Contracts) ==="
test_endpoint "GET" "/api/v1/defi/positions/$TEST_USER" "Get User PYT/NYT Positions"
test_endpoint "GET" "/api/v1/defi/split/preview?syShares=1000" "Preview Split (1000 SY → PYT+NYT)"
test_endpoint "GET" "/api/v1/defi/split/orchestrator-stats" "Get Orchestrator Statistics"
test_endpoint "GET" "/api/v1/defi/forecast/$TEST_USER?timeframe=30" "Get Yield Forecast"

echo "=== 💰 YIELD MANAGEMENT (Real PYT Distribution) ==="
test_endpoint "GET" "/api/v1/defi/yield/pending/$TEST_USER" "Get Pending PYT Yield"
test_endpoint "GET" "/api/v1/defi/yield/history/$TEST_USER" "Get Yield History"
test_endpoint "GET" "/api/v1/defi/yield/distribution-status" "Get Distribution Status"

echo "=== 🛡️ NYT OPERATIONS (Real Principal Protection) ==="
test_endpoint "GET" "/api/v1/defi/nyt/status/$TEST_USER" "Get NYT Status (365-day maturity)"
test_endpoint "GET" "/api/v1/defi/nyt/info/$TEST_USER" "Get NYT Principal Info"
test_endpoint "GET" "/api/v1/defi/nyt/maturity" "Get Maturity & Redemption Status"
test_endpoint "GET" "/api/v1/defi/nyt/protection-status" "Get Liquidation Protection Status"

echo "=== 📊 PORTFOLIO MANAGEMENT ==="
test_endpoint "GET" "/api/v1/defi/portfolio/$TEST_USER" "Get Portfolio Composition"
test_endpoint "GET" "/api/v1/defi/portfolio/performance/$TEST_USER" "Get Portfolio Performance"

echo "=== 🔄 AUTO-COMPOUND VAULT ==="
test_endpoint "GET" "/api/v1/defi/autocompound/balance/$TEST_USER" "Get Auto-Compound Balance"

echo "=== 📈 STRATEGIES & ANALYTICS ==="
test_endpoint "GET" "/api/v1/defi/strategies" "Get All Strategies"
test_endpoint "GET" "/api/v1/defi/strategies/apy" "Get Strategy APYs"
test_endpoint "GET" "/api/v1/defi/strategies/suggestions" "Get Allocation Suggestions"

echo "=== 📊 ANALYTICS DASHBOARD ==="
test_endpoint "GET" "/api/v1/defi/analytics/tvl" "Get TVL Data"
test_endpoint "GET" "/api/v1/defi/analytics/yields" "Get Global Yield Stats"
test_endpoint "GET" "/api/v1/defi/analytics/users" "Get User Statistics"
test_endpoint "GET" "/api/v1/defi/analytics/performance" "Get Performance Metrics"
test_endpoint "GET" "/api/v1/defi/analytics/summary" "Get Analytics Summary"

echo "=== 🔧 CONTRACT STATE VERIFICATION ==="
test_endpoint "GET" "/api/v1/defi/contracts/addresses" "Get All Contract Addresses"
test_endpoint "GET" "/api/v1/defi/contracts/vault-info" "Get SY Vault Contract Info"
test_endpoint "GET" "/api/v1/defi/contracts/token-info" "Get PYT/NYT Token Info"

echo "=== ❌ ERROR HANDLING TESTS ==="
test_endpoint "GET" "/api/v1/defi/vault/balance/invalid-address" "Invalid Address Format"
test_endpoint "GET" "/api/v1/defi/nonexistent-endpoint" "Non-existent Endpoint"

echo ""
echo "🏁 Testing completed!"
echo ""
echo "📝 Notes:"
echo "  • All vault operations now use REAL smart contracts on Kaia testnet"
echo "  • SY Vault: 8% APY with USDT deposits, daily yield distribution"
echo "  • PYT/NYT: 1:1:1 splitting ratio with 365-day maturity"
echo "  • Read-only endpoints work without authentication"
echo "  • Write operations (POST) require valid EIP-712 signatures"
echo "  • Gas fees are handled by platform via fee delegation"
echo ""
echo "🚀 To start the server locally:"
echo "  pnpm run dev:redis"
echo ""
echo "🌐 To test production deployment:"
echo "  ./test-defi-apis.sh https://linex.vercel.app"
echo ""
echo "💡 Next steps for full testing:"
echo "  • Get USDT from faucet: curl -X POST localhost:3000/api/v1/wallet/faucet"
echo "  • Deposit USDT to SY vault (requires EIP-712 signature)"
echo "  • Split SY shares into PYT/NYT tokens"
echo "  • Test yield claiming and recombination flows"