// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/IYieldStrategy.sol";

/**
 * @title MockStakingStrategy
 * @dev Mock staking protocol that generates 8% APY (stable, lower risk)
 * Simulates a staking platform with more predictable returns
 */
contract MockStakingStrategy is IYieldStrategy, Ownable, Pausable {
    using SafeERC20 for IERC20;
    
    // Constants
    uint256 public constant SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
    uint256 public constant BASE_APY = 800; // 8.00% (basis points)
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant HARVEST_COOLDOWN = 6 hours; // More frequent harvesting
    
    // State variables
    IERC20 public immutable underlyingAsset;
    uint256 public totalDeposits;
    uint256 public lastHarvestTime;
    uint256 public accumulatedYield;
    uint256 public withdrawalFeeRate = 0; // No fees for staking
    
    // Staking-specific variables
    uint256 public stakingRewards;
    uint256 public unstakingPeriod = 0; // Instant unstaking for testing
    
    // Tracking
    mapping(address => uint256) public userDeposits;
    mapping(address => uint256) public userDepositTime;
    
    constructor(address _asset, address _owner) Ownable(_owner) {
        underlyingAsset = IERC20(_asset);
        lastHarvestTime = block.timestamp;
    }
    
    // Core Strategy Functions
    function deposit(uint256 amount) external override whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        require(amount >= minimumDeposit(), "Below minimum deposit");
        
        // Transfer tokens from user
        underlyingAsset.safeTransferFrom(msg.sender, address(this), amount);
        
        // Update user tracking
        userDeposits[msg.sender] += amount;
        userDepositTime[msg.sender] = block.timestamp;
        totalDeposits += amount;
        
        emit Deposit(msg.sender, amount);
    }
    
    function withdraw(uint256 amount) external override whenNotPaused returns (uint256) {
        require(amount > 0, "Amount must be > 0");
        require(balanceOf() >= amount, "Insufficient balance in strategy");
        
        // No withdrawal fees for staking
        uint256 amountAfterFee = amount;
        
        // Update state tracking - handle both direct user deposits and vault deposits
        if (userDeposits[msg.sender] >= amount) {
            // Direct user withdrawal
            userDeposits[msg.sender] -= amount;
            totalDeposits -= amount;
        } else {
            // Vault withdrawal - only reduce totalDeposits by what we actually had deposited
            uint256 actualWithdrawal = amount > totalDeposits ? totalDeposits : amount;
            totalDeposits -= actualWithdrawal;
        }
        
        // Transfer tokens back to user
        underlyingAsset.safeTransfer(msg.sender, amountAfterFee);
        
        emit Withdraw(msg.sender, amountAfterFee);
        return amountAfterFee;
    }
    
    function harvest() external override whenNotPaused returns (uint256) {
        require(canHarvest(), "Harvest cooldown active");
        
        uint256 yieldGenerated = pendingYield();
        if (yieldGenerated > 0) {
            accumulatedYield += yieldGenerated;
            stakingRewards += yieldGenerated;
            lastHarvestTime = block.timestamp;
            
            emit Harvest(yieldGenerated, block.timestamp);
        }
        
        return yieldGenerated;
    }
    
    function emergencyExit() external override onlyOwner returns (uint256) {
        uint256 totalBalance = balanceOf();
        if (totalBalance > 0) {
            underlyingAsset.safeTransfer(owner(), totalBalance);
            totalDeposits = 0;
            stakingRewards = 0;
            
            emit EmergencyExit(totalBalance);
        }
        return totalBalance;
    }
    
    // View Functions
    function asset() external view override returns (address) {
        return address(underlyingAsset);
    }
    
    function balanceOf() public view override returns (uint256) {
        return underlyingAsset.balanceOf(address(this));
    }
    
    function getCurrentAPY() external pure override returns (uint256) {
        return BASE_APY; // 8.00% fixed for mock staking
    }
    
    function pendingYield() public view override returns (uint256) {
        if (totalDeposits == 0) return 0;
        
        // Calculate time-based yield (more stable than lending)
        uint256 timeElapsed = block.timestamp - lastHarvestTime;
        uint256 timeBasedYield = (totalDeposits * BASE_APY * timeElapsed) / (BASIS_POINTS * SECONDS_PER_YEAR);
        
        // Also include any external yield (tokens minted directly to strategy)
        uint256 currentBalance = balanceOf();
        uint256 expectedBalance = totalDeposits + accumulatedYield;
        uint256 externalYield = currentBalance > expectedBalance ? currentBalance - expectedBalance : 0;
        
        return timeBasedYield + externalYield;
    }
    
    function canHarvest() public view override returns (bool) {
        return block.timestamp >= lastHarvestTime + HARVEST_COOLDOWN;
    }
    
    function lastHarvest() external view override returns (uint256) {
        return lastHarvestTime;
    }
    
    // Strategy Information
    function strategyName() external pure override returns (string memory) {
        return "Mock Staking Strategy";
    }
    
    function riskLevel() external pure override returns (uint8) {
        return 2; // Low risk (1-10 scale) - more stable than lending
    }
    
    function minimumDeposit() public pure override returns (uint256) {
        return 10e6; // 10 USDT minimum (higher than lending)
    }
    
    function withdrawalFee() external view override returns (uint256) {
        return withdrawalFeeRate;
    }
    
    // Emergency Functions
    function pause() external override onlyOwner {
        _pause();
    }
    
    function unpause() external override onlyOwner {
        _unpause();
    }
    
    function paused() public view override(IYieldStrategy, Pausable) returns (bool) {
        return super.paused();
    }
    
    // Staking-specific view functions
    function getStakingRewards() external view returns (uint256) {
        return stakingRewards;
    }
    
    function getUnstakingPeriod() external view returns (uint256) {
        return unstakingPeriod;
    }
    
    function getUserDeposit(address user) external view returns (uint256) {
        return userDeposits[user];
    }
    
    // Admin Functions
    function setUnstakingPeriod(uint256 _period) external onlyOwner {
        unstakingPeriod = _period;
    }
}