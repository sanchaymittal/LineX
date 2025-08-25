// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/IYieldStrategy.sol";

/**
 * @title MockLPStrategy
 * @dev Mock liquidity provision strategy with 12% APY (volatile, higher risk)
 * Simulates LP farming with variable yields and impermanent loss risk
 */
contract MockLPStrategy is IYieldStrategy, Ownable, Pausable {
    using SafeERC20 for IERC20;
    
    // Constants
    uint256 public constant SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
    uint256 public constant BASE_APY = 1200; // 12.00% (basis points)
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant HARVEST_COOLDOWN = 30 minutes; // Frequent harvesting for LP
    uint256 public constant VOLATILITY_FACTOR = 300; // 3% volatility range
    
    // State variables
    IERC20 public immutable underlyingAsset;
    uint256 public totalDeposits;
    uint256 public lastHarvestTime;
    uint256 public accumulatedYield;
    uint256 public withdrawalFeeRate = 0; // No fees
    
    // LP-specific variables
    uint256 public liquidityProvided;
    uint256 public tradingFees;
    uint256 public impermanentLoss; // Simulated IL
    
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
        liquidityProvided += amount;
        
        emit Deposit(msg.sender, amount);
    }
    
    function withdraw(uint256 amount) external override whenNotPaused returns (uint256) {
        require(amount > 0, "Amount must be > 0");
        require(balanceOf() >= amount, "Insufficient balance in strategy");
        
        // No withdrawal fees for LP (fees are in trading spreads)
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
        
        // Only reduce liquidityProvided by the actual principal, not yield
        uint256 principalWithdrawn = amount > liquidityProvided ? liquidityProvided : amount;
        liquidityProvided -= principalWithdrawn;
        
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
            tradingFees += yieldGenerated;
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
            liquidityProvided = 0;
            tradingFees = 0;
            
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
    
    function getCurrentAPY() external view override returns (uint256) {
        // Simulate volatility: APY varies between 9-15% based on block timestamp
        uint256 variation = (block.timestamp % 1000) * VOLATILITY_FACTOR / 1000;
        if ((block.timestamp / 1000) % 2 == 0) {
            return BASE_APY + variation; // 12% + 0-3%
        } else {
            return BASE_APY > variation ? BASE_APY - variation : BASE_APY / 2; // 12% - 0-3%
        }
    }
    
    function pendingYield() public view override returns (uint256) {
        if (totalDeposits == 0) return 0;
        
        // Calculate time-based yield with current APY
        uint256 timeElapsed = block.timestamp - lastHarvestTime;
        uint256 currentAPY = this.getCurrentAPY();
        uint256 timeBasedYield = (totalDeposits * currentAPY * timeElapsed) / (BASIS_POINTS * SECONDS_PER_YEAR);
        
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
        return "Mock LP Farming Strategy";
    }
    
    function riskLevel() external pure override returns (uint8) {
        return 6; // Medium-high risk (1-10 scale) - higher volatility
    }
    
    function minimumDeposit() public pure override returns (uint256) {
        return 50e6; // 50 USDT minimum (higher for LP)
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
    
    // LP-specific view functions
    function getLiquidityProvided() external view returns (uint256) {
        return liquidityProvided;
    }
    
    function getTradingFees() external view returns (uint256) {
        return tradingFees;
    }
    
    function getImpermanentLoss() external view returns (uint256) {
        return impermanentLoss;
    }
    
    function getUserDeposit(address user) external view returns (uint256) {
        return userDeposits[user];
    }
    
    // Admin Functions - Simulate market conditions
    function simulateImpermanentLoss(uint256 _loss) external onlyOwner {
        impermanentLoss = _loss;
    }
    
    function simulateTradingFees(uint256 _fees) external onlyOwner {
        tradingFees += _fees;
    }
}