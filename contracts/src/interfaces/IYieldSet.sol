// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IYieldSet
 * @dev Interface for Set Protocol-inspired yield portfolio management
 * Simplified for 3-4 yield strategies maximum
 */
interface IYieldSet is IERC20 {
    // Structs
    struct YieldPosition {
        address strategy;          // Strategy contract address
        uint256 targetAllocation;  // Target allocation in basis points (10000 = 100%)
        uint256 currentBalance;    // Current balance in this strategy
        uint256 lastAPY;          // Last recorded APY for this strategy
        bool active;              // Whether this position is active
    }
    
    struct RebalanceParams {
        uint256 threshold;        // Rebalance threshold in basis points (200 = 2%)
        uint256 minInterval;      // Minimum time between rebalances
        bool autoRebalance;       // Whether automatic rebalancing is enabled
    }
    
    // Core Set Functions
    function issue(uint256 setTokenQuantity, address to) external;
    function redeem(uint256 setTokenQuantity, address to) external;
    
    // Position Management
    function addPosition(address strategy, uint256 targetAllocation) external;
    function removePosition(address strategy) external;
    function updateAllocation(address strategy, uint256 newAllocation) external;
    
    // Rebalancing
    function rebalance() external returns (bool);
    function canRebalance() external view returns (bool);
    function getRebalanceInfo() external view returns (
        bool canRebalanceNow,
        uint256 maxDeviation,
        address[] memory strategies,
        uint256[] memory currentAllocations,
        uint256[] memory targetAllocations
    );
    
    // Yield Management
    function harvestAllPositions() external returns (uint256 totalYieldHarvested);
    function updateYieldData() external;
    
    // View Functions
    function getPositions() external view returns (YieldPosition[] memory);
    function getPosition(address strategy) external view returns (YieldPosition memory);
    function getWeightedAPY() external view returns (uint256);
    function getNetAssetValue() external view returns (uint256);
    function getTotalAllocation() external view returns (uint256);
    
    // Events
    event PositionAdded(address indexed strategy, uint256 targetAllocation);
    event PositionRemoved(address indexed strategy);
    event AllocationUpdated(address indexed strategy, uint256 oldAllocation, uint256 newAllocation);
    event Rebalanced(uint256 timestamp, uint256 totalValue, address[] strategies, uint256[] newBalances);
    event YieldHarvested(uint256 totalYield, uint256 timestamp);
}