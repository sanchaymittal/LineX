// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/IYieldStrategy.sol";
import "../core/AutoCompoundVault.sol";

/**
 * @title AutoCompoundVaultWrapper
 * @dev Wraps AutoCompoundVault to be compatible with IYieldStrategy interface
 * Allows YieldSet to interact with AutoCompoundVault as a yield strategy
 */
contract AutoCompoundVaultWrapper is IYieldStrategy, Ownable, Pausable {
    using SafeERC20 for IERC20;
    
    AutoCompoundVault public immutable vault;
    IERC20 public immutable baseAsset;
    
    constructor(
        address _vault,
        address _owner
    ) Ownable(_owner) {
        vault = AutoCompoundVault(_vault);
        baseAsset = IERC20(vault.want());
    }
    
    // === IYieldStrategy Implementation ===
    
    function deposit(uint256 amount) external override whenNotPaused {
        require(amount > 0, "Cannot deposit 0");
        
        // Transfer assets from caller to this wrapper
        baseAsset.safeTransferFrom(msg.sender, address(this), amount);
        
        // Approve vault to spend assets
        baseAsset.safeIncreaseAllowance(address(vault), amount);
        
        // Deposit into vault (gets shares back)
        vault.deposit(amount);
        
        emit Deposit(msg.sender, amount);
    }
    
    function withdraw(uint256 amount) external override whenNotPaused returns (uint256) {
        require(amount > 0, "Cannot withdraw 0");
        
        // Calculate shares needed for the requested amount
        uint256 totalShares = vault.balanceOf(address(this));
        uint256 totalAssets = vault.totalAssets();
        
        if (totalShares == 0 || totalAssets == 0) return 0;
        
        uint256 sharesToWithdraw = (amount * totalShares) / totalAssets;
        if (sharesToWithdraw > totalShares) {
            sharesToWithdraw = totalShares;
        }
        
        // Withdraw from vault (doesn't return value)
        vault.withdraw(sharesToWithdraw);
        uint256 assetsReceived = baseAsset.balanceOf(address(this));
        
        // Transfer assets to caller
        baseAsset.safeTransfer(msg.sender, assetsReceived);
        
        emit Withdraw(msg.sender, assetsReceived);
        return assetsReceived;
    }
    
    function harvest() external override whenNotPaused returns (uint256) {
        // Trigger vault's harvest
        vault.harvest();
        
        // Return estimated yield (vault auto-compounds, so no direct yield to us)
        uint256 estimatedYield = vault.estimateHarvestReward();
        
        emit Harvest(estimatedYield, block.timestamp);
        return estimatedYield;
    }
    
    function emergencyExit() external override onlyOwner returns (uint256) {
        uint256 totalShares = vault.balanceOf(address(this));
        if (totalShares > 0) {
            vault.withdraw(totalShares);
            uint256 assetsRecovered = baseAsset.balanceOf(address(this));
            baseAsset.safeTransfer(owner(), assetsRecovered);
            
            emit EmergencyExit(assetsRecovered);
            return assetsRecovered;
        }
        return 0;
    }
    
    // === View Functions ===
    
    function asset() external view override returns (address) {
        return address(baseAsset);
    }
    
    function balanceOf() external view override returns (uint256) {
        // Return our share of vault's total assets
        uint256 ourShares = vault.balanceOf(address(this));
        uint256 totalShares = vault.totalSupply();
        
        if (totalShares == 0) return 0;
        
        return (ourShares * vault.totalAssets()) / totalShares;
    }
    
    function getCurrentAPY() external view override returns (uint256) {
        return vault.getCurrentAPY();
    }
    
    function pendingYield() external view override returns (uint256) {
        return vault.estimateHarvestReward();
    }
    
    function canHarvest() external view override returns (bool) {
        return vault.canHarvest();
    }
    
    function lastHarvest() external view override returns (uint256) {
        return vault.lastHarvest();
    }
    
    // === Strategy Information ===
    
    function strategyName() external pure override returns (string memory) {
        return "AutoCompound Vault Wrapper";
    }
    
    function riskLevel() external pure override returns (uint8) {
        return 4; // Medium risk (auto-compounding vault)
    }
    
    function minimumDeposit() external pure override returns (uint256) {
        return 1e6; // 1 USDT minimum
    }
    
    function withdrawalFee() external pure override returns (uint256) {
        return 0; // No withdrawal fee at wrapper level
    }
    
    // === Emergency Functions ===
    
    function pause() external override onlyOwner {
        _pause();
    }
    
    function unpause() external override onlyOwner {
        _unpause();
    }
    
    function paused() public view override(IYieldStrategy, Pausable) returns (bool) {
        return super.paused();
    }
}