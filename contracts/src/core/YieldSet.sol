// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IYieldSet.sol";
import "../interfaces/IYieldStrategy.sol";

/**
 * @title YieldSet
 * @dev Set Protocol-inspired yield portfolio manager
 * Manages multiple yield positions with automatic rebalancing
 */
contract YieldSet is ERC20, IYieldSet, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // Constants
    uint256 public constant MAX_POSITIONS = 4;
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant DEFAULT_REBALANCE_THRESHOLD = 200; // 2%
    uint256 public constant MIN_REBALANCE_INTERVAL = 6 hours;
    uint256 public constant PRECISION = 1e18;
    
    // Core state
    IERC20 public immutable baseAsset;
    YieldPosition[] public positions;
    mapping(address => uint256) public strategyToIndex;
    
    // Rebalancing state  
    RebalanceParams public rebalanceParams;
    uint256 public lastRebalanceTime;
    uint256 public totalYieldHarvested;
    
    // APY tracking for oracle
    mapping(address => uint256[24]) public hourlyAPYData; // 24-hour rolling data
    mapping(address => uint256) public lastAPYUpdateTime;
    
    // Events
    event SetTokenIssued(address indexed to, uint256 quantity, uint256 assetsUsed);
    event SetTokenRedeemed(address indexed from, uint256 quantity, uint256 assetsReceived);
    
    constructor(
        address _baseAsset,
        string memory _name,
        string memory _symbol,
        address _owner
    ) ERC20(_name, _symbol) Ownable(_owner) {
        baseAsset = IERC20(_baseAsset);
        
        // Default rebalance parameters
        rebalanceParams = RebalanceParams({
            threshold: DEFAULT_REBALANCE_THRESHOLD,
            minInterval: MIN_REBALANCE_INTERVAL,
            autoRebalance: true
        });
        
        lastRebalanceTime = block.timestamp;
    }
    
    // === Core Set Functions ===
    
    function issue(uint256 setTokenQuantity, address to) 
        external 
        override 
        whenNotPaused 
        nonReentrant 
    {
        require(setTokenQuantity > 0, "Cannot issue 0 tokens");
        require(to != address(0), "Invalid recipient");
        require(positions.length > 0, "No positions configured");
        
        // Auto-rebalance before issuance if needed
        if (rebalanceParams.autoRebalance && canRebalance()) {
            rebalance();
        }
        
        // Calculate required assets based on NAV
        uint256 assetsRequired = _calculateAssetsForSetTokens(setTokenQuantity);
        
        // Transfer assets from user
        baseAsset.safeTransferFrom(msg.sender, address(this), assetsRequired);
        
        // Deploy assets to positions based on target allocation
        _deployToPositions(assetsRequired);
        
        // Mint set tokens to recipient
        _mint(to, setTokenQuantity);
        
        emit SetTokenIssued(to, setTokenQuantity, assetsRequired);
    }
    
    function redeem(uint256 setTokenQuantity, address to) 
        external 
        override 
        whenNotPaused 
        nonReentrant 
    {
        require(setTokenQuantity > 0, "Cannot redeem 0 tokens");
        require(setTokenQuantity <= balanceOf(msg.sender), "Insufficient balance");
        require(to != address(0), "Invalid recipient");
        
        // Auto-rebalance before redemption if needed
        if (rebalanceParams.autoRebalance && canRebalance()) {
            rebalance();
        }
        
        // Calculate proportional withdrawal from each position
        uint256 totalSupply = totalSupply();
        uint256 assetsToRedeem = 0;
        
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].active) {
                uint256 positionWithdrawal = (positions[i].currentBalance * setTokenQuantity) / totalSupply;
                if (positionWithdrawal > 0) {
                    uint256 actualWithdrawn = IYieldStrategy(positions[i].strategy).withdraw(positionWithdrawal);
                    positions[i].currentBalance -= positionWithdrawal;
                    assetsToRedeem += actualWithdrawn;
                }
            }
        }
        
        // Burn set tokens
        _burn(msg.sender, setTokenQuantity);
        
        // Transfer redeemed assets to recipient
        baseAsset.safeTransfer(to, assetsToRedeem);
        
        emit SetTokenRedeemed(msg.sender, setTokenQuantity, assetsToRedeem);
    }
    
    // === Position Management ===
    
    function addPosition(address strategy, uint256 targetAllocation) 
        external 
        override 
        onlyOwner 
    {
        require(strategy != address(0), "Invalid strategy");
        require(targetAllocation > 0, "Invalid allocation");
        require(positions.length < MAX_POSITIONS, "Too many positions");
        require(IYieldStrategy(strategy).asset() == address(baseAsset), "Asset mismatch");
        
        // Check if strategy already exists
        for (uint256 i = 0; i < positions.length; i++) {
            require(positions[i].strategy != strategy, "Strategy already exists");
        }
        
        // Verify total allocation doesn't exceed 100%
        uint256 newTotalAllocation = getTotalAllocation() + targetAllocation;
        require(newTotalAllocation <= BASIS_POINTS, "Total allocation exceeds 100%");
        
        // Add new position
        positions.push(YieldPosition({
            strategy: strategy,
            targetAllocation: targetAllocation,
            currentBalance: 0,
            lastAPY: IYieldStrategy(strategy).getCurrentAPY(),
            active: true
        }));
        
        strategyToIndex[strategy] = positions.length - 1;
        
        emit PositionAdded(strategy, targetAllocation);
    }
    
    function removePosition(address strategy) external override onlyOwner {
        uint256 index = strategyToIndex[strategy];
        require(index < positions.length, "Position not found");
        require(positions[index].strategy == strategy, "Invalid position");
        
        // Withdraw all funds from position
        uint256 balance = positions[index].currentBalance;
        if (balance > 0) {
            IYieldStrategy(strategy).withdraw(balance);
            positions[index].currentBalance = 0;
        }
        
        // Mark as inactive (don't remove to preserve indices)
        positions[index].active = false;
        positions[index].targetAllocation = 0;
        
        emit PositionRemoved(strategy);
    }
    
    function updateAllocation(address strategy, uint256 newAllocation) 
        external 
        override 
        onlyOwner 
    {
        uint256 index = strategyToIndex[strategy];
        require(index < positions.length, "Position not found");
        require(positions[index].strategy == strategy && positions[index].active, "Invalid position");
        
        uint256 oldAllocation = positions[index].targetAllocation;
        
        // Check total allocation constraint
        uint256 totalWithoutThis = getTotalAllocation() - oldAllocation;
        require(totalWithoutThis + newAllocation <= BASIS_POINTS, "Total allocation exceeds 100%");
        
        positions[index].targetAllocation = newAllocation;
        
        emit AllocationUpdated(strategy, oldAllocation, newAllocation);
    }
    
    // === Rebalancing Engine ===
    
    function rebalance() public override onlyOwner returns (bool) {
        require(canRebalance(), "Cannot rebalance now");
        
        uint256 totalAssets = getNetAssetValue();
        if (totalAssets == 0) return false;
        
        // Calculate target balances
        uint256[] memory targetBalances = new uint256[](positions.length);
        address[] memory strategies = new address[](positions.length);
        
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].active) {
                targetBalances[i] = (totalAssets * positions[i].targetAllocation) / BASIS_POINTS;
                strategies[i] = positions[i].strategy;
            }
        }
        
        // Rebalance each position
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].active) {
                uint256 currentBalance = positions[i].currentBalance;
                uint256 targetBalance = targetBalances[i];
                
                if (currentBalance > targetBalance) {
                    // Withdraw excess
                    uint256 excess = currentBalance - targetBalance;
                    IYieldStrategy(positions[i].strategy).withdraw(excess);
                    positions[i].currentBalance = targetBalance;
                } else if (currentBalance < targetBalance) {
                    // Need to deposit more - will be handled in next step
                }
            }
        }
        
        // Deploy available assets to underweight positions
        _deployToPositions(baseAsset.balanceOf(address(this)));
        
        lastRebalanceTime = block.timestamp;
        
        emit Rebalanced(block.timestamp, totalAssets, strategies, targetBalances);
        return true;
    }
    
    function canRebalance() public view override returns (bool) {
        if (block.timestamp < lastRebalanceTime + rebalanceParams.minInterval) {
            return false;
        }
        
        // Check if any position deviates beyond threshold
        uint256 totalAssets = getNetAssetValue();
        if (totalAssets == 0) return false;
        
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].active) {
                uint256 currentAllocation = (positions[i].currentBalance * BASIS_POINTS) / totalAssets;
                uint256 targetAllocation = positions[i].targetAllocation;
                
                uint256 deviation = currentAllocation > targetAllocation ? 
                    currentAllocation - targetAllocation : 
                    targetAllocation - currentAllocation;
                
                if (deviation > rebalanceParams.threshold) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    function getRebalanceInfo() external view override returns (
        bool canRebalanceNow,
        uint256 maxDeviation,
        address[] memory strategies,
        uint256[] memory currentAllocations,
        uint256[] memory targetAllocations
    ) {
        canRebalanceNow = canRebalance();
        
        uint256 activeCount = 0;
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].active) activeCount++;
        }
        
        strategies = new address[](activeCount);
        currentAllocations = new uint256[](activeCount);
        targetAllocations = new uint256[](activeCount);
        
        uint256 totalAssets = getNetAssetValue();
        uint256 activeIndex = 0;
        maxDeviation = 0;
        
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].active) {
                strategies[activeIndex] = positions[i].strategy;
                targetAllocations[activeIndex] = positions[i].targetAllocation;
                
                if (totalAssets > 0) {
                    currentAllocations[activeIndex] = (positions[i].currentBalance * BASIS_POINTS) / totalAssets;
                    
                    uint256 deviation = currentAllocations[activeIndex] > targetAllocations[activeIndex] ?
                        currentAllocations[activeIndex] - targetAllocations[activeIndex] :
                        targetAllocations[activeIndex] - currentAllocations[activeIndex];
                    
                    if (deviation > maxDeviation) {
                        maxDeviation = deviation;
                    }
                }
                
                activeIndex++;
            }
        }
    }
    
    // === Yield Management ===
    
    function harvestAllPositions() external override returns (uint256 harvestedYield) {
        _updateAllAPYData();
        
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].active) {
                IYieldStrategy strategy = IYieldStrategy(positions[i].strategy);
                if (strategy.canHarvest()) {
                    uint256 yieldHarvested = strategy.harvest();
                    harvestedYield += yieldHarvested;
                    
                    // Update position balance
                    positions[i].currentBalance = strategy.balanceOf();
                }
            }
        }
        
        if (harvestedYield > 0) {
            totalYieldHarvested += harvestedYield;
            emit YieldHarvested(harvestedYield, block.timestamp);
        }
        
        return harvestedYield;
    }
    
    function updateYieldData() external override {
        _updateAllAPYData();
    }
    
    // === View Functions ===
    
    function getPositions() external view override returns (YieldPosition[] memory) {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].active) activeCount++;
        }
        
        YieldPosition[] memory activePositions = new YieldPosition[](activeCount);
        uint256 activeIndex = 0;
        
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].active) {
                activePositions[activeIndex] = positions[i];
                activeIndex++;
            }
        }
        
        return activePositions;
    }
    
    function getPosition(address strategy) external view override returns (YieldPosition memory) {
        uint256 index = strategyToIndex[strategy];
        require(index < positions.length, "Position not found");
        require(positions[index].strategy == strategy, "Invalid position");
        return positions[index];
    }
    
    function getWeightedAPY() external view override returns (uint256) {
        uint256 totalAllocation = 0;
        uint256 weightedAPY = 0;
        
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].active) {
                uint256 allocation = positions[i].targetAllocation;
                uint256 apy = _getAverageAPY(positions[i].strategy);
                
                weightedAPY += (apy * allocation) / BASIS_POINTS;
                totalAllocation += allocation;
            }
        }
        
        return totalAllocation > 0 ? weightedAPY : 0;
    }
    
    function getNetAssetValue() public view override returns (uint256) {
        uint256 totalValue = baseAsset.balanceOf(address(this));
        
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].active) {
                totalValue += IYieldStrategy(positions[i].strategy).balanceOf();
            }
        }
        
        return totalValue;
    }
    
    function getTotalAllocation() public view override returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].active) {
                total += positions[i].targetAllocation;
            }
        }
        return total;
    }
    
    // === Internal Functions ===
    
    function _calculateAssetsForSetTokens(uint256 setTokenQuantity) internal view returns (uint256) {
        uint256 totalSupply = totalSupply();
        if (totalSupply == 0) {
            return setTokenQuantity; // 1:1 initial ratio
        }
        
        uint256 nav = getNetAssetValue();
        return (setTokenQuantity * nav) / totalSupply;
    }
    
    function _deployToPositions(uint256 amount) internal {
        if (amount == 0) return;
        
        uint256 totalAllocation = getTotalAllocation();
        if (totalAllocation == 0) return;
        
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].active) {
                uint256 allocationAmount = (amount * positions[i].targetAllocation) / totalAllocation;
                
                // Check minimum deposit requirement
                IYieldStrategy strategy = IYieldStrategy(positions[i].strategy);
                uint256 minDeposit = strategy.minimumDeposit();
                
                if (allocationAmount >= minDeposit) {
                    baseAsset.safeIncreaseAllowance(positions[i].strategy, allocationAmount);
                    strategy.deposit(allocationAmount);
                    positions[i].currentBalance += allocationAmount;
                } else if (allocationAmount > 0) {
                    // Amount too small, keep in contract for later deployment
                    // This ensures funds aren't lost due to minimum deposit requirements
                }
            }
        }
    }
    
    function _updateAllAPYData() internal {
        uint256 currentHour = block.timestamp / 3600;
        
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].active) {
                address strategy = positions[i].strategy;
                uint256 lastUpdateHour = lastAPYUpdateTime[strategy] / 3600;
                
                // Only update if at least 1 hour has passed
                if (currentHour > lastUpdateHour) {
                    uint256 currentAPY = IYieldStrategy(strategy).getCurrentAPY();
                    uint256 slot = currentHour % 24;
                    
                    hourlyAPYData[strategy][slot] = currentAPY;
                    lastAPYUpdateTime[strategy] = block.timestamp;
                    positions[i].lastAPY = currentAPY;
                }
            }
        }
    }
    
    function _getAverageAPY(address strategy) internal view returns (uint256) {
        uint256 sum = 0;
        uint256 count = 0;
        
        for (uint256 i = 0; i < 24; i++) {
            if (hourlyAPYData[strategy][i] > 0) {
                sum += hourlyAPYData[strategy][i];
                count++;
            }
        }
        
        return count > 0 ? sum / count : IYieldStrategy(strategy).getCurrentAPY();
    }
    
    // === Owner Functions ===
    
    function setRebalanceParams(
        uint256 threshold,
        uint256 minInterval,
        bool autoRebalance
    ) external onlyOwner {
        require(threshold <= 1000, "Threshold too high"); // Max 10%
        require(minInterval >= 1 hours, "Interval too short");
        
        rebalanceParams = RebalanceParams({
            threshold: threshold,
            minInterval: minInterval,
            autoRebalance: autoRebalance
        });
    }
    
    function forceRebalance() external onlyOwner {
        uint256 oldTime = lastRebalanceTime;
        lastRebalanceTime = 0; // Temporarily allow rebalancing
        rebalance();
        lastRebalanceTime = oldTime;
    }
    
    // === Emergency Functions ===
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    function emergencyWithdrawAll() external onlyOwner {
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].active && positions[i].currentBalance > 0) {
                IYieldStrategy(positions[i].strategy).withdraw(positions[i].currentBalance);
                positions[i].currentBalance = 0;
            }
        }
    }
}