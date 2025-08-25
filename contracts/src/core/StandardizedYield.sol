// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/ISY.sol";
import "../interfaces/IYieldStrategy.sol";

/**
 * @title StandardizedYield
 * @dev Simplified version of Pendle's SY wrapper for LineX yield engine
 * Wraps yield strategies and provides standardized interface
 */
contract StandardizedYield is ERC20, ISY, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // Constants
    uint256 public constant INITIAL_EXCHANGE_RATE = 1e18; // 1:1 initial rate
    uint256 public constant MAX_STRATEGIES = 3;
    
    // State variables
    IERC20 public immutable underlyingAsset;
    IYieldStrategy[] public strategies;
    uint256[] public strategyAllocations; // Basis points (10000 = 100%)
    uint256 public totalStrategyAllocation;
    
    // Yield tracking
    uint256 public lastExchangeRate;
    uint256 public lastYieldUpdateTime;
    uint256 public totalYieldAccrued;
    
    // Events
    event StrategyAdded(address indexed strategy, uint256 allocation);
    event StrategyRemoved(address indexed strategy);
    event Rebalance(uint256 timestamp, uint256 totalAssets);
    
    constructor(
        address _asset,
        string memory _name,
        string memory _symbol,
        address _owner
    ) ERC20(_name, _symbol) Ownable(_owner) {
        underlyingAsset = IERC20(_asset);
        lastExchangeRate = INITIAL_EXCHANGE_RATE;
        lastYieldUpdateTime = block.timestamp;
    }
    
    // Core Functions
    function deposit(uint256 assets, address receiver) 
        external 
        override 
        whenNotPaused 
        nonReentrant 
        returns (uint256 shares) 
    {
        require(assets > 0, "Cannot deposit 0 assets");
        require(receiver != address(0), "Invalid receiver");
        
        // Update yield before deposit
        _updateYield();
        
        // Calculate shares based on current exchange rate
        shares = convertToShares(assets);
        
        // Transfer assets from caller
        underlyingAsset.safeTransferFrom(msg.sender, address(this), assets);
        
        // Mint shares to receiver
        _mint(receiver, shares);
        
        // Deploy assets to strategies
        _deployToStrategies(assets);
        
        emit Deposit(msg.sender, receiver, assets, shares);
    }
    
    function withdraw(uint256 shares, address receiver, address owner) 
        external 
        override 
        whenNotPaused 
        nonReentrant 
        returns (uint256 assets) 
    {
        require(shares > 0, "Cannot withdraw 0 shares");
        require(receiver != address(0), "Invalid receiver");
        
        // Check allowance if not owner
        if (msg.sender != owner) {
            uint256 currentAllowance = allowance(owner, msg.sender);
            require(currentAllowance >= shares, "Insufficient allowance");
            _approve(owner, msg.sender, currentAllowance - shares);
        }
        
        // Update yield before withdrawal
        _updateYield();
        
        // Calculate assets based on current exchange rate
        assets = convertToAssets(shares);
        
        // Withdraw from strategies
        _withdrawFromStrategies(assets);
        
        // Burn shares
        _burn(owner, shares);
        
        // Transfer assets to receiver
        underlyingAsset.safeTransfer(receiver, assets);
        
        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }
    
    // View Functions
    function asset() external view override returns (address) {
        return address(underlyingAsset);
    }
    
    function exchangeRate() public view override returns (uint256) {
        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) return INITIAL_EXCHANGE_RATE;
        
        uint256 _totalAssets = totalAssets();
        return (_totalAssets * 1e18) / _totalSupply;
    }
    
    function totalAssets() public view override returns (uint256) {
        uint256 totalInStrategies = 0;
        for (uint256 i = 0; i < strategies.length; i++) {
            totalInStrategies += strategies[i].balanceOf();
        }
        return underlyingAsset.balanceOf(address(this)) + totalInStrategies;
    }
    
    function convertToShares(uint256 assets) public view override returns (uint256) {
        uint256 currentRate = exchangeRate();
        return (assets * 1e18) / currentRate;
    }
    
    function convertToAssets(uint256 shares) public view override returns (uint256) {
        uint256 currentRate = exchangeRate();
        return (shares * currentRate) / 1e18;
    }
    
    function previewDeposit(uint256 assets) external view override returns (uint256) {
        return convertToShares(assets);
    }
    
    function previewWithdraw(uint256 shares) external view override returns (uint256) {
        return convertToAssets(shares);
    }
    
    // Yield Information
    function getAPY() external view override returns (uint256) {
        if (strategies.length == 0) return 0;
        
        uint256 weightedAPY = 0;
        for (uint256 i = 0; i < strategies.length; i++) {
            uint256 strategyAPY = strategies[i].getCurrentAPY();
            uint256 weight = strategyAllocations[i];
            weightedAPY += (strategyAPY * weight) / 10000;
        }
        return weightedAPY;
    }
    
    function getYieldAccrued() external view override returns (uint256) {
        return totalYieldAccrued;
    }
    
    function lastYieldUpdate() external view override returns (uint256) {
        return lastYieldUpdateTime;
    }
    
    // Strategy Management (Owner only)
    function addStrategy(address _strategy, uint256 _allocation) external onlyOwner {
        require(_strategy != address(0), "Invalid strategy");
        require(_allocation > 0, "Invalid allocation");
        require(strategies.length < MAX_STRATEGIES, "Too many strategies");
        require(totalStrategyAllocation + _allocation <= 10000, "Total allocation exceeds 100%");
        
        strategies.push(IYieldStrategy(_strategy));
        strategyAllocations.push(_allocation);
        totalStrategyAllocation += _allocation;
        
        emit StrategyAdded(_strategy, _allocation);
    }
    
    function removeStrategy(uint256 index) external onlyOwner {
        require(index < strategies.length, "Invalid index");
        
        address strategy = address(strategies[index]);
        uint256 allocation = strategyAllocations[index];
        
        // Withdraw all funds from strategy (instead of emergencyExit)
        uint256 strategyBalance = strategies[index].balanceOf();
        if (strategyBalance > 0) {
            strategies[index].withdraw(strategyBalance);
        }
        
        // Remove from arrays
        for (uint256 i = index; i < strategies.length - 1; i++) {
            strategies[i] = strategies[i + 1];
            strategyAllocations[i] = strategyAllocations[i + 1];
        }
        strategies.pop();
        strategyAllocations.pop();
        totalStrategyAllocation -= allocation;
        
        emit StrategyRemoved(strategy);
    }
    
    // Internal Functions
    function _updateYield() internal {
        uint256 newTotalAssets = totalAssets();
        uint256 currentSupply = totalSupply();
        
        if (currentSupply > 0) {
            uint256 newExchangeRate = (newTotalAssets * 1e18) / currentSupply;
            if (newExchangeRate > lastExchangeRate) {
                uint256 yieldGenerated = newTotalAssets - ((currentSupply * lastExchangeRate) / 1e18);
                totalYieldAccrued += yieldGenerated;
                lastExchangeRate = newExchangeRate;
                
                emit YieldUpdated(newExchangeRate, block.timestamp);
            }
        }
        
        lastYieldUpdateTime = block.timestamp;
    }
    
    function _deployToStrategies(uint256 amount) internal {
        if (strategies.length == 0) return;
        
        for (uint256 i = 0; i < strategies.length; i++) {
            uint256 allocation = strategyAllocations[i];
            uint256 strategyAmount = (amount * allocation) / 10000;
            
            if (strategyAmount > 0) {
                underlyingAsset.safeIncreaseAllowance(address(strategies[i]), strategyAmount);
                strategies[i].deposit(strategyAmount);
            }
        }
    }
    
    function _withdrawFromStrategies(uint256 amount) internal {
        uint256 remainingToWithdraw = amount;
        uint256 availableInContract = underlyingAsset.balanceOf(address(this));
        
        // Use available balance first
        if (availableInContract >= remainingToWithdraw) {
            return;
        }
        
        remainingToWithdraw -= availableInContract;
        
        // Withdraw proportionally from strategies
        for (uint256 i = 0; i < strategies.length && remainingToWithdraw > 0; i++) {
            uint256 strategyBalance = strategies[i].balanceOf();
            if (strategyBalance > 0) {
                uint256 toWithdraw = remainingToWithdraw > strategyBalance ? 
                    strategyBalance : remainingToWithdraw;
                
                uint256 actuallyWithdrawn = strategies[i].withdraw(toWithdraw);
                remainingToWithdraw -= actuallyWithdrawn;
            }
        }
    }
    
    // Yield Management
    function updateYield() external {
        _updateYield();
    }
    
    // Missing ISY interface functions
    function getCurrentAPY() external view returns (uint256) {
        if (strategies.length == 0) return 0;
        
        uint256 weightedAPY = 0;
        for (uint256 i = 0; i < strategies.length; i++) {
            uint256 strategyAPY = strategies[i].getCurrentAPY();
            uint256 weight = strategyAllocations[i];
            weightedAPY += (strategyAPY * weight) / 10000;
        }
        return weightedAPY;
    }
    
    function previewRedeem(uint256 shares) external view returns (uint256) {
        return convertToAssets(shares);
    }
    
    // Emergency Functions
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    function emergencyWithdraw() external onlyOwner {
        for (uint256 i = 0; i < strategies.length; i++) {
            uint256 strategyBalance = strategies[i].balanceOf();
            if (strategyBalance > 0) {
                strategies[i].withdraw(strategyBalance);
            }
        }
    }
    
    // View functions for strategies
    function getStrategiesCount() external view returns (uint256) {
        return strategies.length;
    }
    
    function getStrategy(uint256 index) external view returns (address, uint256) {
        require(index < strategies.length, "Invalid index");
        return (address(strategies[index]), strategyAllocations[index]);
    }
}