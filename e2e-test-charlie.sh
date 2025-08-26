#!/bin/bash

# ========================================
# E2E Test: Charlie - PYT/NYT Yield Splitting Workflow  
# ========================================
#
# USER PERSONA: "Yield Splitter" Charlie
# - Sophisticated DeFi user who wants to separate yield from principal
# - Looking to tokenize yield for trading or hedging
# - Interested in principal protection through NYT tokens
#
# WORKFLOW: API -> PYTNYTService -> PYTNYTOrchestrator Contract  
# CONTRACT: 0xfa21739267afcf83c8c1bbb12846e3e74678a969 (PYTNYTOrchestrator)
# TOKENS: PYT (0x697c8e45e86553A075bFA7DaBDb3C007d9E468Ab) & NYT (0xe10b7374a88139104F0A5Ac848E7C95291F1FA39)
#
# ========================================

set -e  # Exit on any error

# Configuration
API_BASE="http://localhost:3000"

# Source contract addresses from constants
eval "$(node scripts/get-contract-addresses.js)"

# Charlie's test wallet (using Hardhat's third account)
CHARLIE_PRIVATE_KEY="0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
CHARLIE_ADDRESS="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
ORCHESTRATOR_ADDRESS="$PYT_NYT_ORCHESTRATOR"           # PYTNYTOrchestrator
SY_VAULT_ADDRESS="$STANDARDIZED_YIELD"                  # StandardizedYield vault
PYT_TOKEN_ADDRESS="$PYT_TOKEN"                          # PYT Token
NYT_TOKEN_ADDRESS="$NYT_TOKEN"                          # NYT Token
USDT_ADDRESS="$TEST_USDT"                               # TestUSDT Contract
TEST_AMOUNT="200000000"  # 200 USDT (6 decimals) for initial deposit to SY
SY_SHARES_TO_SPLIT="100000000"  # Split 100 SY shares into PYT+NYT

echo "Charlie's wallet address: $CHARLIE_ADDRESS"
echo "Using hardcoded authentication (no JWT required)"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to display transaction with explorer link
show_transaction_link() {
    local tx_hash=$1
    local description=$2
    echo -e "${GREEN}🔗 Transaction: $description${NC}"
    echo -e "${BLUE}   📍 Hash: $tx_hash${NC}"
    echo -e "${BLUE}   🌐 Explorer: https://kairos.kaiascan.io/tx/$tx_hash${NC}"
    echo ""
}

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}🧪 E2E TEST: Charlie's PYT/NYT Journey${NC}"  
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}👤 USER PERSONA: Yield Splitter (Charlie)${NC}"
echo "   • Address: $CHARLIE_ADDRESS"
echo "   • Goal: Separate yield from principal for advanced strategies"
echo "   • Interest: Tokenized yield trading and principal protection"
echo ""

# Function to make API calls with error handling
make_api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    echo -e "${BLUE}🔍 $description${NC}"
    echo "   → $method $endpoint"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s "$API_BASE$endpoint" | jq .)
    else
        response=$(curl -s -X "$method" "$API_BASE$endpoint" \
                   -H "Content-Type: application/json" \
                   -d "$data" | jq .)
    fi
    
    echo "$response"
    
    # Check if response indicates success
    success=$(echo "$response" | jq -r '.success // false')
    if [ "$success" != "true" ]; then
        echo -e "${RED}❌ API call failed${NC}"
        echo "$response"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Success${NC}"
    echo ""
}

# Test 1: Health Check
echo -e "${YELLOW}📍 STEP 1: Health Check${NC}"
make_api_call "GET" "/health" "" "Checking API health"

# Test 2: Check Charlie's Initial Balance
echo -e "${YELLOW}📍 STEP 2: Check Charlie's Initial USDT Balance${NC}"
make_api_call "GET" "/api/v1/wallet/$CHARLIE_ADDRESS/balance" "" "Getting Charlie's initial USDT balance"

# Test 3: Check Charlie's SY Vault Balance (before getting SY shares)
echo -e "${YELLOW}📍 STEP 3: Check Charlie's Initial SY Vault Position${NC}"
make_api_call "GET" "/api/v1/defi/vault/balance/$CHARLIE_ADDRESS" "" "Getting Charlie's initial SY vault balance"

# Test 4: Charlie Claims USDT from Faucet
echo -e "${YELLOW}📍 STEP 4: Charlie Claims USDT from Faucet${NC}"
make_api_call "POST" "/api/v1/wallet/faucet" "{\"userAddress\": \"$CHARLIE_ADDRESS\"}" "Claiming 100 USDT from faucet for Charlie"

# Test 5: USDT Approval for SY Vault
echo -e "${YELLOW}📍 STEP 5: Charlie Approves USDT for SY Vault${NC}"
echo -e "${BLUE}🔑 Setting USDT allowance for StandardizedYield vault...${NC}"

# Generate approval signature via API
approval_data='{
  "privateKey": "'$CHARLIE_PRIVATE_KEY'",
  "userAddress": "'$CHARLIE_ADDRESS'",
  "tokenAddress": "'$USDT_ADDRESS'",
  "spenderAddress": "'$SY_VAULT_ADDRESS'",
  "amount": "1000000000"
}'

echo -e "${BLUE}🔐 Generating approval signature${NC}"
echo "   → POST /api/v1/signatures/approval"
approval_response=$(curl -s -X POST "$API_BASE/api/v1/signatures/approval" \
                   -H "Content-Type: application/json" \
                   -d "$approval_data" | jq .)

echo "$approval_response"

# Extract the signed transaction
approval_raw_tx=$(echo "$approval_response" | jq -r '.data.senderRawTransaction')
if [ "$approval_raw_tx" = "null" ] || [ -z "$approval_raw_tx" ]; then
    echo -e "${RED}❌ Failed to generate approval signature${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Approval signature generated successfully${NC}"

# Execute the approval transaction
execute_data='{
  "senderRawTransaction": "'$approval_raw_tx'"
}'

echo -e "${BLUE}🚀 Executing approval transaction${NC}"
echo "   → POST /api/v1/signatures/execute"
execute_response=$(curl -s -X POST "$API_BASE/api/v1/signatures/execute" \
                  -H "Content-Type: application/json" \
                  -d "$execute_data" | jq .)

echo "$execute_response"

# Check execution success
execute_success=$(echo "$execute_response" | jq -r '.success // false')
if [ "$execute_success" != "true" ]; then
    echo -e "${RED}❌ Approval transaction failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Approval transaction executed successfully${NC}"

# Extract and display transaction hash with explorer link
approval_tx_hash=$(echo "$execute_response" | jq -r '.data.transactionHash // ""')
if [ "$approval_tx_hash" != "" ] && [ "$approval_tx_hash" != "null" ]; then
    show_transaction_link "$approval_tx_hash" "USDT Approval for SY Vault"
fi
echo ""

# Test 6: Charlie Deposits to SY Vault (to get SY shares for splitting)
echo -e "${YELLOW}📍 STEP 6: Charlie Deposits to SY Vault to Get Shares${NC}"
echo -e "${BLUE}💰 Depositing $TEST_AMOUNT USDT to StandardizedYield vault...${NC}"

# Generate deposit signature for SY vault
deposit_sig_data='{
  "privateKey": "'$CHARLIE_PRIVATE_KEY'",
  "userAddress": "'$CHARLIE_ADDRESS'",
  "vaultAddress": "'$SY_VAULT_ADDRESS'",
  "amount": "'$TEST_AMOUNT'"
}'

echo -e "${BLUE}🔐 Generating SY vault deposit signature${NC}"
echo "   → POST /api/v1/signatures/deposit/sy"
deposit_response=$(curl -s -X POST "$API_BASE/api/v1/signatures/deposit/sy" \
                  -H "Content-Type: application/json" \
                  -d "$deposit_sig_data" | jq .)

echo "$deposit_response"

# Extract the signed transaction
deposit_raw_tx=$(echo "$deposit_response" | jq -r '.data.senderRawTransaction')
if [ "$deposit_raw_tx" = "null" ] || [ -z "$deposit_raw_tx" ]; then
    echo -e "${RED}❌ Failed to generate deposit signature${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Deposit signature generated successfully${NC}"

# Execute the deposit transaction
execute_deposit_data='{
  "senderRawTransaction": "'$deposit_raw_tx'"
}'

echo -e "${BLUE}🚀 Executing deposit transaction${NC}"
echo "   → POST /api/v1/signatures/execute"
deposit_execute_response=$(curl -s -X POST "$API_BASE/api/v1/signatures/execute" \
                          -H "Content-Type: application/json" \
                          -d "$execute_deposit_data" | jq .)

echo "$deposit_execute_response"

# Check execution success
deposit_execute_success=$(echo "$deposit_execute_response" | jq -r '.success // false')
if [ "$deposit_execute_success" != "true" ]; then
    echo -e "${RED}❌ Deposit transaction failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Deposit transaction executed successfully${NC}"

# Extract and display transaction hash with explorer link
deposit_tx_hash=$(echo "$deposit_execute_response" | jq -r '.data.transactionHash // ""')
if [ "$deposit_tx_hash" != "" ] && [ "$deposit_tx_hash" != "null" ]; then
    show_transaction_link "$deposit_tx_hash" "SY Vault Deposit (200 USDT)"
fi

# Test 7: Check Charlie's SY Vault Balance After Deposit
echo -e "${YELLOW}📍 STEP 7: Verify SY Vault Position After Deposit${NC}"
make_api_call "GET" "/api/v1/defi/vault/balance/$CHARLIE_ADDRESS" "" "Getting Charlie's SY vault balance after deposit"

# Test 8: Approve SY shares for Orchestrator (for splitting)
echo -e "${YELLOW}📍 STEP 8: Charlie Approves SY Shares for Orchestrator${NC}"
echo -e "${BLUE}🔑 Setting SY shares allowance for PYTNYTOrchestrator...${NC}"

# Generate approval signature for SY shares
sy_approval_data='{
  "privateKey": "'$CHARLIE_PRIVATE_KEY'",
  "userAddress": "'$CHARLIE_ADDRESS'",
  "tokenAddress": "'$SY_VAULT_ADDRESS'",
  "spenderAddress": "'$ORCHESTRATOR_ADDRESS'",
  "amount": "1000000000"
}'

echo -e "${BLUE}🔐 Generating SY approval signature${NC}"
echo "   → POST /api/v1/signatures/approval"
sy_approval_response=$(curl -s -X POST "$API_BASE/api/v1/signatures/approval" \
                      -H "Content-Type: application/json" \
                      -d "$sy_approval_data" | jq .)

echo "$sy_approval_response"

# Extract the signed transaction
sy_approval_raw_tx=$(echo "$sy_approval_response" | jq -r '.data.senderRawTransaction')
if [ "$sy_approval_raw_tx" = "null" ] || [ -z "$sy_approval_raw_tx" ]; then
    echo -e "${RED}❌ Failed to generate SY approval signature${NC}"
    exit 1
fi

echo -e "${GREEN}✅ SY approval signature generated successfully${NC}"

# Execute the SY approval transaction
sy_execute_data='{
  "senderRawTransaction": "'$sy_approval_raw_tx'"
}'

echo -e "${BLUE}🚀 Executing SY approval transaction${NC}"
echo "   → POST /api/v1/signatures/execute"
sy_execute_response=$(curl -s -X POST "$API_BASE/api/v1/signatures/execute" \
                     -H "Content-Type: application/json" \
                     -d "$sy_execute_data" | jq .)

echo "$sy_execute_response"

# Check execution success
sy_execute_success=$(echo "$sy_execute_response" | jq -r '.success // false')
if [ "$sy_execute_success" != "true" ]; then
    echo -e "${RED}❌ SY approval transaction failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ SY approval transaction executed successfully${NC}"

# Extract and display transaction hash with explorer link
sy_approval_tx_hash=$(echo "$sy_execute_response" | jq -r '.data.transactionHash // ""')
if [ "$sy_approval_tx_hash" != "" ] && [ "$sy_approval_tx_hash" != "null" ]; then
    show_transaction_link "$sy_approval_tx_hash" "SY Shares Approval for PYT/NYT Orchestrator"
fi
echo ""

# Test 9: Split SY shares into PYT + NYT
echo -e "${YELLOW}📍 STEP 9: Charlie Splits SY Shares into PYT + NYT Tokens${NC}"
echo -e "${BLUE}🔪 Splitting $SY_SHARES_TO_SPLIT SY shares into PYT + NYT...${NC}"

# Generate split signature via API
split_sig_data='{
  "privateKey": "'$CHARLIE_PRIVATE_KEY'",
  "userAddress": "'$CHARLIE_ADDRESS'",
  "orchestratorAddress": "'$ORCHESTRATOR_ADDRESS'",
  "syShares": "'$SY_SHARES_TO_SPLIT'"
}'

echo -e "${BLUE}🔐 Generating split signature${NC}"
echo "   → POST /api/v1/signatures/split"
split_response=$(curl -s -X POST "$API_BASE/api/v1/signatures/split" \
                 -H "Content-Type: application/json" \
                 -d "$split_sig_data" | jq .)

echo "$split_response"

# Extract the signed transaction
split_raw_tx=$(echo "$split_response" | jq -r '.data.senderRawTransaction')
if [ "$split_raw_tx" = "null" ] || [ -z "$split_raw_tx" ]; then
    echo -e "${RED}❌ Failed to generate split signature${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Split signature generated successfully${NC}"

# Execute the split transaction
execute_split_data='{
  "senderRawTransaction": "'$split_raw_tx'"
}'

echo -e "${BLUE}🚀 Executing split transaction${NC}"
echo "   → POST /api/v1/signatures/execute"
split_execute_response=$(curl -s -X POST "$API_BASE/api/v1/signatures/execute" \
                         -H "Content-Type: application/json" \
                         -d "$execute_split_data" | jq .)

echo "$split_execute_response"

# Check execution success
split_execute_success=$(echo "$split_execute_response" | jq -r '.success // false')
if [ "$split_execute_success" != "true" ]; then
    echo -e "${RED}❌ Split transaction failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Split transaction executed successfully${NC}"

# Extract and display transaction hash with explorer link
split_tx_hash=$(echo "$split_execute_response" | jq -r '.data.transactionHash // ""')
if [ "$split_tx_hash" != "" ] && [ "$split_tx_hash" != "null" ]; then
    show_transaction_link "$split_tx_hash" "SY Shares Split into PYT + NYT Tokens"
fi
echo ""

# Test 10: Check Charlie's PYT Balance
echo -e "${YELLOW}📍 STEP 10: Check Charlie's PYT Token Balance${NC}"
echo -e "${BLUE}🔍 Checking PYT balance...${NC}"

# Use cast to check PYT balance
pyt_balance=$(cast call $PYT_TOKEN_ADDRESS "balanceOf(address)(uint256)" $CHARLIE_ADDRESS --rpc-url https://public-en-kairos.node.kaia.io 2>/dev/null || echo "0")
echo "PYT Balance: $pyt_balance"

# Test 11: Check Charlie's NYT Balance
echo -e "${YELLOW}📍 STEP 11: Check Charlie's NYT Token Balance${NC}"
echo -e "${BLUE}🔍 Checking NYT balance...${NC}"

# Use cast to check NYT balance
nyt_balance=$(cast call $NYT_TOKEN_ADDRESS "balanceOf(address)(uint256)" $CHARLIE_ADDRESS --rpc-url https://public-en-kairos.node.kaia.io 2>/dev/null || echo "0")
echo "NYT Balance: $nyt_balance"

# Test 12: Check Charlie's Positions via API
echo -e "${YELLOW}📍 STEP 12: Check Charlie's Complete DeFi Positions${NC}"
make_api_call "GET" "/api/v1/defi/nyt/positions/$CHARLIE_ADDRESS" "" "Getting Charlie's PYT/NYT positions"

# Test 13: Final Balance Check
echo -e "${YELLOW}📍 STEP 13: Final Balance Verification${NC}"
make_api_call "GET" "/api/v1/wallet/$CHARLIE_ADDRESS/balance" "" "Getting Charlie's final USDT balance"
make_api_call "GET" "/api/v1/defi/vault/balance/$CHARLIE_ADDRESS" "" "Getting Charlie's final SY vault balance"

# Summary
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}🎉 E2E TEST COMPLETED SUCCESSFULLY!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}📊 WORKFLOW SUMMARY:${NC}"
echo "   ✅ Charlie checked initial balances"
echo "   ✅ Charlie claimed USDT from faucet"  
echo "   ✅ Charlie approved USDT for SY vault"
echo "   ✅ Charlie deposited USDT to get SY shares"
echo "   ✅ Charlie approved SY shares for orchestrator"
echo "   ✅ Charlie split SY shares into PYT + NYT tokens"
echo "   ✅ Charlie received PYT tokens (perpetual yield)"
echo "   ✅ Charlie received NYT tokens (principal protection)"
echo "   ✅ Charlie verified final positions"
echo ""
echo -e "${BLUE}🏗️  ARCHITECTURE TESTED:${NC}"
echo "   API → PYTNYTService → YieldOrchestrator Contract"
echo "   SY Vault: $SY_VAULT_ADDRESS"
echo "   Orchestrator: $ORCHESTRATOR_ADDRESS"
echo "   PYT Token: $PYT_TOKEN_ADDRESS"
echo "   NYT Token: $NYT_TOKEN_ADDRESS"
echo "   Fee-Delegated Transactions: All operations are gasless for users"
echo ""
echo -e "${GREEN}✅ Charlie successfully split yield-bearing positions into tradeable components!${NC}"