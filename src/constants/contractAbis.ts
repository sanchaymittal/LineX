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
  'function getAPY() view returns (uint256)',
  'function getCurrentAPY() view returns (uint256)',
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
  'event ManagementFeeUpdated(uint256 newFee)',
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
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
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
  'event WithdrawalFeeUpdated(uint256 oldFee, uint256 newFee)',
] as const;

// Contract addresses from deployment - Single source of truth for deployed addresses
export const CONTRACT_ADDRESSES = {
  // Core contracts - Fresh deployment on Kaia testnet (Kairos) - August 27, 2024
  STANDARDIZED_YIELD_VAULT: '0x36033918321ec4C81aF68434aD6A9610983CCB63', // Fresh StandardizedYield deployment
  AUTO_COMPOUND_VAULT: '0x02c83bD37d55AA5c3c2B4ba9D56613dD4c16A7D0', // Fresh AutoCompoundVault deployment
  
  // Token contracts - Fresh deployment
  TEST_USDT: '0x0692640d5565735C67fcB40f45251DD5D3f8fb9f', // Fresh TestUSDT deployment

  // Mock strategies - Fresh deployment addresses used in StandardizedYield
  MOCK_LENDING_STRATEGY: '0xbaf58d8208137598fB9AcFbA6737554A12B42BD0', // MockLendingStrategy (fresh deployment)
  MOCK_STAKING_STRATEGY: '0x9A4d5239fC2257717d886f64632B3884839F055C', // MockStakingStrategy (fresh deployment)  
  MOCK_LP_STRATEGY: '0xaCe325ba665D6c579b0A8786A71525ad855b3De7', // MockLPStrategy (fresh deployment)
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
    case 'STANDARDIZED_YIELD_VAULT':
      abi = SY_VAULT_ABI;
      break;
    case 'AUTO_COMPOUND_VAULT':
      abi = AUTO_COMPOUND_VAULT_ABI;
      break;
    case 'TEST_USDT':
      abi = TEST_USDT_ABI;
      break;
    default:
      throw new Error(`Unknown contract: ${contractName}`);
  }

  return new BaseContract(address, abi, runner);
}
