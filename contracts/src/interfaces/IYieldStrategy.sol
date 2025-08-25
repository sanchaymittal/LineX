// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IYieldStrategy
 * @dev Interface for yield-generating strategies
 * Inspired by Beefy's strategy architecture
 */
interface IYieldStrategy {
    
    // Events
    event Harvest(uint256 yieldGenerated, uint256 timestamp);
    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event EmergencyExit(uint256 amountRecovered);
    
    // Core Strategy Functions
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external returns (uint256);
    function harvest() external returns (uint256);
    function emergencyExit() external returns (uint256);
    
    // View Functions
    function asset() external view returns (address);
    function balanceOf() external view returns (uint256);
    function getCurrentAPY() external view returns (uint256);
    function pendingYield() external view returns (uint256);
    function canHarvest() external view returns (bool);
    function lastHarvest() external view returns (uint256);
    
    // Strategy Information
    function strategyName() external view returns (string memory);
    function riskLevel() external view returns (uint8); // 1-10 scale
    function minimumDeposit() external view returns (uint256);
    function withdrawalFee() external view returns (uint256);
    
    // Emergency Functions
    function pause() external;
    function unpause() external;
    function paused() external view returns (bool);
}