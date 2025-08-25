// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IYieldStrategy.sol";

/**
 * @title AutoCompoundVault
 * @dev Beefy-style auto-compounding vault with harvest-on-deposit
 * Single strategy focus with automatic yield reinvestment
 */
contract AutoCompoundVault is ERC20, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // Constants
    uint256 public constant INITIAL_EXCHANGE_RATE = 1e18;
    uint256 public constant MAX_WITHDRAWAL_FEE = 500; // 5% max
    uint256 public constant HARVEST_CALL_FEE = 50; // 0.5% to harvester
    uint256 public constant BASIS_POINTS = 10000;
    
    // Core state
    IERC20 public immutable want; // Underlying asset
    IYieldStrategy public strategy; // Single yield strategy
    
    // Auto-compounding state
    uint256 public lastHarvest;
    uint256 public totalYieldHarvested;
    uint256 public harvestCallReward; // Accumulated rewards for harvesters
    
    // Fee structure
    uint256 public withdrawalFeeRate = 0; // Default no withdrawal fee
    
    // Events
    event Harvest(address indexed caller, uint256 yieldHarvested, uint256 callReward);
    event AutoCompound(uint256 amount, uint256 newTotalAssets);
    event StrategyUpdated(address indexed oldStrategy, address indexed newStrategy);
    event WithdrawalFeeUpdated(uint256 oldFee, uint256 newFee);
    
    constructor(
        IERC20 _want,
        IYieldStrategy _strategy,
        string memory _name,
        string memory _symbol,
        address _owner
    ) ERC20(_name, _symbol) Ownable(_owner) {
        want = _want;
        strategy = _strategy;
        lastHarvest = block.timestamp;
    }
    
    // Core vault functions
    function deposit(uint256 _amount) external whenNotPaused nonReentrant {
        require(_amount > 0, "Cannot deposit 0");
        
        // Auto-harvest before deposit to compound existing yield
        _harvest();
        
        uint256 shares = _amount;
        uint256 totalAssetsBefore = totalAssets();
        
        if (totalSupply() > 0 && totalAssetsBefore > 0) {
            shares = (_amount * totalSupply()) / totalAssetsBefore;
        }
        
        // Transfer want tokens from user
        want.safeTransferFrom(msg.sender, address(this), _amount);
        
        // Deploy to strategy
        _earn();
        
        // Mint shares to user
        _mint(msg.sender, shares);
        
        emit Deposit(msg.sender, _amount, shares);
    }
    
    function withdraw(uint256 _shares) external whenNotPaused nonReentrant {
        require(_shares > 0, "Cannot withdraw 0");
        require(_shares <= balanceOf(msg.sender), "Insufficient shares");
        
        // Auto-harvest before withdrawal to ensure accurate pricing
        _harvest();
        
        uint256 totalShares = totalSupply();
        uint256 totalAssetsBefore = totalAssets();
        uint256 assetsToWithdraw = (_shares * totalAssetsBefore) / totalShares;
        
        // Withdraw from strategy if needed
        uint256 availableInVault = want.balanceOf(address(this));
        if (assetsToWithdraw > availableInVault) {
            uint256 needFromStrategy = assetsToWithdraw - availableInVault;
            strategy.withdraw(needFromStrategy);
        }
        
        // Apply withdrawal fee
        uint256 withdrawalFee = (assetsToWithdraw * withdrawalFeeRate) / BASIS_POINTS;
        uint256 assetsAfterFee = assetsToWithdraw - withdrawalFee;
        
        // Burn shares
        _burn(msg.sender, _shares);
        
        // Transfer assets to user
        want.safeTransfer(msg.sender, assetsAfterFee);
        
        emit Withdraw(msg.sender, _shares, assetsAfterFee);
    }
    
    // Auto-compounding logic (Beefy-style)
    function harvest() external whenNotPaused {
        _harvest();
    }
    
    function _harvest() internal {
        if (strategy.canHarvest()) {
            uint256 yieldHarvested = strategy.harvest();
            
            if (yieldHarvested > 0) {
                // Calculate call reward for harvester (if external call)
                uint256 callReward = 0;
                if (msg.sender != address(this)) {
                    callReward = (yieldHarvested * HARVEST_CALL_FEE) / BASIS_POINTS;
                    
                    // Reserve call reward from available balance
                    uint256 availableForReward = want.balanceOf(address(this));
                    if (availableForReward >= callReward) {
                        harvestCallReward += callReward;
                    } else {
                        callReward = 0; // Not enough for reward
                    }
                }
                
                // Compound remaining yield back into strategy
                uint256 toCompound = yieldHarvested - callReward;
                if (toCompound > 0) {
                    _earn();
                }
                
                totalYieldHarvested += yieldHarvested;
                lastHarvest = block.timestamp;
                
                emit Harvest(msg.sender, yieldHarvested, callReward);
                emit AutoCompound(toCompound, totalAssets());
            }
        }
    }
    
    function _earn() internal {
        uint256 availableWant = want.balanceOf(address(this));
        if (availableWant > harvestCallReward) {
            uint256 toInvest = availableWant - harvestCallReward;
            want.safeIncreaseAllowance(address(strategy), toInvest);
            strategy.deposit(toInvest);
        }
    }
    
    // View functions
    function totalAssets() public view returns (uint256) {
        return want.balanceOf(address(this)) + strategy.balanceOf();
    }
    
    function getPricePerFullShare() external view returns (uint256) {
        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) return INITIAL_EXCHANGE_RATE;
        return (totalAssets() * 1e18) / _totalSupply;
    }
    
    function estimateHarvestReward() external view returns (uint256) {
        uint256 pendingYield = strategy.pendingYield();
        return (pendingYield * HARVEST_CALL_FEE) / BASIS_POINTS;
    }
    
    function getCurrentAPY() external view returns (uint256) {
        return strategy.getCurrentAPY();
    }
    
    function canHarvest() external view returns (bool) {
        return strategy.canHarvest() && strategy.pendingYield() > 0;
    }
    
    function getStrategyInfo() external view returns (
        address strategyAddress,
        string memory strategyName,
        uint8 riskLevel,
        uint256 apy,
        uint256 balance
    ) {
        return (
            address(strategy),
            strategy.strategyName(),
            strategy.riskLevel(),
            strategy.getCurrentAPY(),
            strategy.balanceOf()
        );
    }
    
    // Owner functions
    function setStrategy(IYieldStrategy _newStrategy) external onlyOwner {
        require(address(_newStrategy) != address(0), "Invalid strategy");
        require(_newStrategy.asset() == address(want), "Asset mismatch");
        
        // Withdraw all from current strategy
        uint256 currentBalance = strategy.balanceOf();
        if (currentBalance > 0) {
            strategy.withdraw(currentBalance);
        }
        
        address oldStrategy = address(strategy);
        strategy = _newStrategy;
        
        // Deploy to new strategy
        _earn();
        
        emit StrategyUpdated(oldStrategy, address(_newStrategy));
    }
    
    function setWithdrawalFee(uint256 _fee) external onlyOwner {
        require(_fee <= MAX_WITHDRAWAL_FEE, "Fee too high");
        uint256 oldFee = withdrawalFeeRate;
        withdrawalFeeRate = _fee;
        emit WithdrawalFeeUpdated(oldFee, _fee);
    }
    
    function claimHarvestRewards() external onlyOwner {
        uint256 reward = harvestCallReward;
        if (reward > 0) {
            harvestCallReward = 0;
            want.safeTransfer(owner(), reward);
        }
    }
    
    // Emergency functions
    function emergencyWithdraw() external onlyOwner {
        uint256 strategyBalance = strategy.balanceOf();
        if (strategyBalance > 0) {
            strategy.withdraw(strategyBalance);
        }
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // Events for compatibility
    event Deposit(address indexed user, uint256 amount, uint256 shares);
    event Withdraw(address indexed user, uint256 shares, uint256 amount);
}