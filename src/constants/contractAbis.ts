/**
 * Contract ABIs extracted from Foundry deployments
 * These are the actual ABIs from our deployed smart contracts
 */

// SYVault ABI - ERC4626 compliant vault for USDT
export const SY_VAULT_ABI = [
  // View functions
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function asset() view returns (address)',
  'function totalAssets() view returns (uint256)',
  'function convertToShares(uint256 assets) view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function maxDeposit(address receiver) view returns (uint256)',
  'function maxMint(address receiver) view returns (uint256)',
  'function maxWithdraw(address owner) view returns (uint256)',
  'function maxRedeem(address owner) view returns (uint256)',
  'function previewDeposit(uint256 assets) view returns (uint256)',
  'function previewMint(uint256 shares) view returns (uint256)',
  'function previewWithdraw(uint256 assets) view returns (uint256)',
  'function previewRedeem(uint256 shares) view returns (uint256)',
  'function yieldRate() view returns (uint256)',
  'function managementFee() view returns (uint256)',
  'function lastYieldDistribution() view returns (uint256)',
  'function totalYieldDistributed() view returns (uint256)',
  'function getVaultStats() view returns (uint256 totalAssets, uint256 totalShares, uint256 currentYieldRate, uint256 totalYield)',
  
  // State-changing functions
  'function deposit(uint256 assets, address receiver) returns (uint256)',
  'function mint(uint256 shares, address receiver) returns (uint256)',
  'function withdraw(uint256 assets, address receiver, address owner) returns (uint256)',
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function distributeYield() external',
  'function setYieldRate(uint256 _yieldRate) external',
  'function setManagementFee(uint256 _fee) external',
  
  // Events
  'event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)',
  'event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)',
  'event YieldDistributed(uint256 amount, uint256 timestamp)',
  'event YieldRateUpdated(uint256 newRate)',
  'event ManagementFeeUpdated(uint256 newFee)'
] as const;

// PerpetualYieldToken (PYT) ABI
export const PYT_TOKEN_ABI = [
  // View functions
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function gate() view returns (address)',
  'function vault() view returns (address)',
  'function yieldAccrued(address user) view returns (uint256)',
  'function lastYieldUpdate(address user) view returns (uint256)',
  'function getTotalYield() view returns (uint256)',
  
  // State-changing functions
  'function mint(address to, uint256 amount) external',
  'function burn(address from, uint256 amount) external',
  'function claimYield() external returns (uint256)',
  'function updateYield(address user) external',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  
  // Events
  'event YieldClaimed(address indexed user, uint256 amount)',
  'event YieldUpdated(address indexed user, uint256 amount)'
] as const;

// NegativeYieldToken (NYT) ABI
export const NYT_TOKEN_ABI = [
  // View functions
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function gate() view returns (address)',
  'function vault() view returns (address)',
  'function maturityTimestamp() view returns (uint256)',
  'function principalAmount(address user) view returns (uint256)',
  'function isMatured() view returns (bool)',
  'function getRedemptionValue(uint256 nytAmount) view returns (uint256)',
  
  // State-changing functions
  'function mint(address to, uint256 amount) external',
  'function burn(address from, uint256 amount) external',
  'function redeem(uint256 amount) external returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  
  // Events
  'event Redeemed(address indexed user, uint256 nytAmount, uint256 underlyingAmount)',
  'event MaturityReached(uint256 timestamp)'
] as const;

// YieldOrchestrator ABI
export const YIELD_ORCHESTRATOR_ABI = [
  // View functions
  'function syVault() view returns (address)',
  'function pytToken() view returns (address)',
  'function nytToken() view returns (address)',
  'function asset() view returns (address)',
  'function totalSplits() view returns (uint256)',
  'function totalRecombinations() view returns (uint256)',
  'function getUserSplitHistory(address user) view returns (uint256[] memory timestamps, uint256[] memory amounts)',
  'function getOrchestratorStats() view returns (uint256 totalSplits, uint256 totalRecombinations, uint256 totalSYLocked, uint256 totalPYTMinted, uint256 totalNYTMinted)',
  'function getStats() view returns (uint256 totalShares, uint256 pytSupply, uint256 nytSupply, uint256 lastDistribution, uint256 nextDistribution, uint256 vaultValue)',
  
  // State-changing functions
  'function splitShares(uint256 syShares, address recipient) external',
  'function recombineTokens(uint256 tokenAmount, address recipient) external',
  'function emergencyWithdraw(address token, uint256 amount) external',
  
  // Events
  'event SharesSplit(address indexed user, uint256 syShares, uint256 pytMinted, uint256 nytMinted)',
  'event TokensRecombined(address indexed user, uint256 pytAmount, uint256 nytAmount, uint256 syShares)',
  'event EmergencyWithdrawal(address indexed token, uint256 amount)'
] as const;

// TestUSDT ABI
export const TEST_USDT_ABI = [
  // View functions
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function FAUCET_AMOUNT() view returns (uint256)',
  'function FAUCET_COOLDOWN() view returns (uint256)',
  'function lastFaucetClaim(address user) view returns (uint256)',
  'function canUseFaucet(address user) view returns (bool canClaim, uint256 timeLeft)',
  'function getFormattedBalance(address account) view returns (uint256)',
  'function getFormattedTotalSupply() view returns (uint256)',
  'function paused() view returns (bool)',
  'function owner() view returns (address)',
  
  // State-changing functions
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function mint(address to, uint256 amount) external',
  'function emergencyMint(address to, uint256 usdtAmount) external',
  'function faucet() external',
  'function faucetFor(address user) external',
  'function burn(uint256 amount) external',
  'function burnFrom(address from, uint256 amount) external',
  'function pause() external',
  'function unpause() external',
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external',
  
  // Events
  'event Minted(address indexed to, uint256 amount)',
  'event FaucetClaimed(address indexed user, uint256 amount)',
  'event EmergencyMint(address indexed to, uint256 amount)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)'
] as const;

// AutoCompoundVault Direct ABI (Beefy-style vault)
export const AUTO_COMPOUND_VAULT_ABI = [
  // ERC20 functions
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  
  // Vault functions
  'function want() view returns (address)',
  'function strategy() view returns (address)',
  'function totalAssets() view returns (uint256)',
  'function getPricePerFullShare() view returns (uint256)',
  'function getCurrentAPY() view returns (uint256)',
  'function canHarvest() view returns (bool)',
  'function estimateHarvestReward() view returns (uint256)',
  'function lastHarvest() view returns (uint256)',
  'function totalYieldHarvested() view returns (uint256)',
  'function harvestCallReward() view returns (uint256)',
  'function withdrawalFeeRate() view returns (uint256)',
  'function getStrategyInfo() view returns (address, string, uint8, uint256, uint256)',
  'function paused() view returns (bool)',
  
  // State-changing functions
  'function deposit(uint256 _amount) external',
  'function withdraw(uint256 _shares) external', 
  'function harvest() external',
  'function setStrategy(address _newStrategy) external',
  'function setWithdrawalFee(uint256 _fee) external',
  'function claimHarvestRewards() external',
  'function emergencyWithdraw() external',
  'function pause() external',
  'function unpause() external',
  
  // Events
  'event Deposit(address indexed user, uint256 amount, uint256 shares)',
  'event Withdraw(address indexed user, uint256 shares, uint256 amount)',
  'event Harvest(address indexed caller, uint256 yieldHarvested, uint256 callReward)',
  'event AutoCompound(uint256 amount, uint256 newTotalAssets)',
  'event StrategyUpdated(address indexed oldStrategy, address indexed newStrategy)',
  'event WithdrawalFeeUpdated(uint256 oldFee, uint256 newFee)'
] as const;

// AutoCompoundVault Wrapper ABI (IYieldStrategy compatible)
export const AUTO_COMPOUND_VAULT_WRAPPER_ABI = [
  // View functions
  'function asset() view returns (address)',
  'function totalAssets() view returns (uint256)',
  'function convertToShares(uint256 assets) view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function riskLevel() view returns (uint8)',
  'function apy() view returns (uint256)',
  'function vault() view returns (address)',
  'function paused() view returns (bool)',
  
  // State-changing functions
  'function deposit(uint256 amount) external',
  'function withdraw(uint256 amount) external',
  'function emergencyWithdraw() external',
  
  // Events
  'event Deposit(address indexed user, uint256 amount)',
  'event Withdraw(address indexed user, uint256 amount)',
  'event EmergencyWithdraw(address indexed user, uint256 amount)'
] as const;

// PYTNYTOrchestrator Wrapper ABI (IYieldStrategy compatible)
export const PYT_NYT_ORCHESTRATOR_WRAPPER_ABI = [
  // View functions
  'function asset() view returns (address)',
  'function totalAssets() view returns (uint256)',
  'function convertToShares(uint256 assets) view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function riskLevel() view returns (uint8)',
  'function apy() view returns (uint256)',
  'function orchestrator() view returns (address)',
  'function paused() view returns (bool)',
  
  // State-changing functions
  'function deposit(uint256 amount) external',
  'function withdraw(uint256 amount) external',
  'function emergencyWithdraw() external',
  
  // Events
  'event Deposit(address indexed user, uint256 amount)',
  'event Withdraw(address indexed user, uint256 amount)',
  'event EmergencyWithdraw(address indexed user, uint256 amount)'
] as const;

// YieldSet ABI (Set Protocol-inspired portfolio manager)
export const YIELD_SET_ABI = [
  // View functions
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function asset() view returns (address)',
  'function totalAssets() view returns (uint256)',
  'function convertToShares(uint256 assets) view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function getPositions() view returns (address[] memory, uint256[] memory)',
  'function getPositionWeight(address position) view returns (uint256)',
  'function getTotalPositions() view returns (uint256)',
  'function getRebalanceParams() view returns (uint256 threshold, uint256 interval, bool enabled)',
  'function lastRebalance() view returns (uint256)',
  'function canRebalance() view returns (bool)',
  'function getPortfolioValue() view returns (uint256)',
  'function riskLevel() view returns (uint8)',
  'function managementFee() view returns (uint256)',
  'function performanceFee() view returns (uint256)',
  
  // State-changing functions
  'function deposit(uint256 assets, address receiver) returns (uint256)',
  'function withdraw(uint256 assets, address receiver, address owner) returns (uint256)',
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256)',
  'function addPosition(address position, uint256 weight) external',
  'function removePosition(address position) external',
  'function updatePositionWeight(address position, uint256 newWeight) external',
  'function rebalance() external',
  'function setRebalanceParams(uint256 threshold, uint256 interval, bool enabled) external',
  'function harvestYield() external',
  'function emergencyWithdraw(address position) external',
  
  // Events
  'event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)',
  'event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)',
  'event PositionAdded(address indexed position, uint256 weight)',
  'event PositionRemoved(address indexed position)',
  'event PositionWeightUpdated(address indexed position, uint256 oldWeight, uint256 newWeight)',
  'event Rebalanced(uint256 timestamp, uint256 totalValue)',
  'event YieldHarvested(uint256 amount, uint256 timestamp)'
] as const;

// Contract addresses from deployment - Single source of truth for deployed addresses
export const CONTRACT_ADDRESSES = {
  // Core contracts - Deployed on Kaia testnet (Kairos)
  STANDARDIZED_YIELD: '0x121F0fe66052e7da2c223b972Fc81a7881a2643a',
  AUTO_COMPOUND_VAULT: '0x7d5aa1e9ecdd8c228d3328d2ac6c4ddf63970c36',
  AUTO_COMPOUND_VAULT_WRAPPER: '0xC036c2f2F64c06546cd1E2a487139058d4B9Dc4F',
  PYT_NYT_ORCHESTRATOR: '0x0a92B94D0fD3A4014aBCbF84f0BBe6273eA4d5B9',
  PYT_NYT_ORCHESTRATOR_WRAPPER: '0x2ba13d854b5a12ebc07c96fab10bf8aefbb15aa8',
  YIELD_SET: '0x5d6949c357a6127064363799e83fa3c0dfb362a6',
  
  // Token contracts - Deployed addresses
  PYT_TOKEN: '0x3DfdD7FbcDad98Dc507F2843C3f4B62CF1A4c453',
  NYT_TOKEN: '0x4995F9B78Fc9085445C5ed195266E999d8725640',
  TEST_USDT: '0xb5Ad080243b3de7ee561F3D85AD3521C3238D0eb', // Fresh deployment with no faucet cooldown
  
  // Forecaster - Deployed address  
  YIELD_FORECASTER: '0xa41779530d5001795b11f6EABdB382d628A29f1c',
  
  // Mock strategies - Deployed addresses
  MOCK_LENDING_STRATEGY: '0x0a3FFc636d13fDC90D5cd6a305Fbd2Cff8d07115',
  MOCK_STAKING_STRATEGY: '0x44d2624dD1925875bD35d68185B49d2d0c90430B',
  MOCK_LP_STRATEGY: '0x373AE28C9e5b9D2426ECEb36B0C18CB7d0CCEB91',
  
  // Legacy aliases for backward compatibility
  SY_VAULT: '0x121F0fe66052e7da2c223b972Fc81a7881a2643a'
} as const;

// Helper function to get contract instance
import { BaseContract } from 'ethers';
import type { ContractRunner } from 'ethers';

export function getContractInstance(
  contractName: keyof typeof CONTRACT_ADDRESSES,
  runner: ContractRunner
): BaseContract {
  const address = CONTRACT_ADDRESSES[contractName];
  let abi: readonly string[];
  
  switch (contractName) {
    case 'STANDARDIZED_YIELD':
    case 'SY_VAULT':
      abi = SY_VAULT_ABI;
      break;
    case 'AUTO_COMPOUND_VAULT':
      abi = AUTO_COMPOUND_VAULT_ABI;
      break;
    case 'AUTO_COMPOUND_VAULT_WRAPPER':
      abi = AUTO_COMPOUND_VAULT_WRAPPER_ABI;
      break;
    case 'PYT_NYT_ORCHESTRATOR':
    case 'YIELD_FORECASTER':
      abi = YIELD_ORCHESTRATOR_ABI;
      break;
    case 'PYT_NYT_ORCHESTRATOR_WRAPPER':
      abi = PYT_NYT_ORCHESTRATOR_WRAPPER_ABI;
      break;
    case 'YIELD_SET':
      abi = YIELD_SET_ABI;
      break;
    case 'PYT_TOKEN':
      abi = PYT_TOKEN_ABI;
      break;
    case 'NYT_TOKEN':
      abi = NYT_TOKEN_ABI;
      break;
    case 'TEST_USDT':
      abi = TEST_USDT_ABI;
      break;
    default:
      throw new Error(`Unknown contract: ${contractName}`);
  }
  
  return new BaseContract(address, abi, runner);
}