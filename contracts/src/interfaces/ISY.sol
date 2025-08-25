// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ISY (Standardized Yield Interface)
 * @dev Simplified version of Pendle's SY interface for LineX yield engine
 * Provides standardized interface for yield-bearing tokens
 */
interface ISY is IERC20 {
    
    // Events
    event Deposit(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
    event Withdraw(address indexed caller, address indexed receiver, address indexed owner, uint256 assets, uint256 shares);
    event YieldUpdated(uint256 newExchangeRate, uint256 timestamp);
    
    // Core Functions
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function withdraw(uint256 shares, address receiver, address owner) external returns (uint256 assets);
    
    // View Functions
    function asset() external view returns (address);
    function exchangeRate() external view returns (uint256);
    function totalAssets() external view returns (uint256);
    function convertToShares(uint256 assets) external view returns (uint256);
    function convertToAssets(uint256 shares) external view returns (uint256);
    function previewDeposit(uint256 assets) external view returns (uint256);
    function previewWithdraw(uint256 shares) external view returns (uint256);
    function previewRedeem(uint256 shares) external view returns (uint256);
    
    // Yield Information  
    function getAPY() external view returns (uint256);
    function getCurrentAPY() external view returns (uint256);
    function getYieldAccrued() external view returns (uint256);
    function lastYieldUpdate() external view returns (uint256);
}