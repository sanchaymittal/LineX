// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/IYieldStrategy.sol";
import "../core/PYTNYTOrchestrator.sol";
import "../tokens/PerpetualYieldToken.sol";
import "../tokens/NegativeYieldToken.sol";

/**
 * @title PYTNYTOrchestratorWrapper
 * @dev Wraps PYTNYTOrchestrator to be compatible with IYieldStrategy interface
 * Allows YieldSet to interact with PYT/NYT system as a yield strategy
 */
contract PYTNYTOrchestratorWrapper is IYieldStrategy, Ownable, Pausable {
    using SafeERC20 for IERC20;
    
    PYTNYTOrchestrator public immutable orchestrator;
    IERC20 public immutable baseAsset;
    PerpetualYieldToken public immutable pytToken;
    NegativeYieldToken public immutable nytToken;
    
    // Tracking for deposits into SY vault via orchestrator
    uint256 public totalDeposited;
    uint256 public lastYieldClaim;
    
    constructor(
        address _orchestrator,
        address _owner
    ) Ownable(_owner) {
        orchestrator = PYTNYTOrchestrator(_orchestrator);
        baseAsset = IERC20(orchestrator.syVault().asset()); // Get base asset from SY vault
        pytToken = orchestrator.pytToken();
        nytToken = orchestrator.nytToken();
        lastYieldClaim = block.timestamp;
    }
    
    // === IYieldStrategy Implementation ===
    
    function deposit(uint256 amount) external override whenNotPaused {
        require(amount > 0, "Cannot deposit 0");
        
        // Transfer assets from caller
        baseAsset.safeTransferFrom(msg.sender, address(this), amount);
        
        // Approve orchestrator to spend assets
        baseAsset.safeIncreaseAllowance(address(orchestrator), amount);
        
        // First need to deposit into SY vault to get SY shares
        // Then split those SY shares into PYT/NYT through orchestrator
        orchestrator.syVault().deposit(amount, address(this));
        uint256 syShares = orchestrator.syVault().balanceOf(address(this));
        orchestrator.splitYield(syShares, address(this));
        
        totalDeposited += amount;
        
        emit Deposit(msg.sender, amount);
    }
    
    function withdraw(uint256 amount) external override whenNotPaused returns (uint256) {
        require(amount > 0, "Cannot withdraw 0");
        
        // Calculate how much PYT/NYT we need to recombine
        uint256 pytBalance = pytToken.balanceOf(address(this));
        uint256 nytBalance = nytToken.balanceOf(address(this));
        uint256 maxRecombine = pytBalance < nytBalance ? pytBalance : nytBalance;
        
        if (maxRecombine == 0) return 0;
        
        // Calculate proportional amount to recombine
        uint256 toRecombine = (amount * maxRecombine) / totalDeposited;
        if (toRecombine > maxRecombine) toRecombine = maxRecombine;
        
        // Recombine PYT/NYT back to SY shares, then withdraw from SY vault
        orchestrator.recombineYield(toRecombine, address(this));
        uint256 syShares = orchestrator.syVault().balanceOf(address(this));
        uint256 assetsRecovered = orchestrator.syVault().withdraw(syShares, address(this), address(this));
        
        // Update tracking
        totalDeposited = totalDeposited > assetsRecovered ? totalDeposited - assetsRecovered : 0;
        
        // Transfer recovered assets to caller
        baseAsset.safeTransfer(msg.sender, assetsRecovered);
        
        emit Withdraw(msg.sender, assetsRecovered);
        return assetsRecovered;
    }
    
    function harvest() external override whenNotPaused returns (uint256) {
        // Claim yield from PYT tokens
        uint256 yieldClaimed = 0;
        uint256 pytBalance = pytToken.balanceOf(address(this));
        
        if (pytBalance > 0) {
            // For now, just return estimated pending yield
            // PYT yield claiming mechanism may need to be implemented differently
            yieldClaimed = pendingYield();
            lastYieldClaim = block.timestamp;
        }
        
        emit Harvest(yieldClaimed, block.timestamp);
        return yieldClaimed;
    }
    
    function emergencyExit() external override onlyOwner returns (uint256) {
        uint256 pytBalance = pytToken.balanceOf(address(this));
        uint256 nytBalance = nytToken.balanceOf(address(this));
        uint256 maxRecombine = pytBalance < nytBalance ? pytBalance : nytBalance;
        
        uint256 totalRecovered = 0;
        
        if (maxRecombine > 0) {
            orchestrator.recombineYield(maxRecombine, address(this));
            uint256 syShares = orchestrator.syVault().balanceOf(address(this));
            if (syShares > 0) {
                totalRecovered = orchestrator.syVault().withdraw(syShares, address(this), address(this));
            }
        }
        
        // Transfer any remaining base assets
        uint256 baseBalance = baseAsset.balanceOf(address(this));
        if (baseBalance > 0) {
            totalRecovered += baseBalance;
        }
        
        if (totalRecovered > 0) {
            baseAsset.safeTransfer(owner(), totalRecovered);
        }
        
        emit EmergencyExit(totalRecovered);
        return totalRecovered;
    }
    
    // === View Functions ===
    
    function asset() external view override returns (address) {
        return address(baseAsset);
    }
    
    function balanceOf() external view override returns (uint256) {
        // Return value of our PYT/NYT positions
        uint256 pytBalance = pytToken.balanceOf(address(this));
        uint256 nytBalance = nytToken.balanceOf(address(this));
        
        // Value is minimum of PYT/NYT (since we need both to recombine)
        // Plus any pending yield from PYT
        uint256 principalValue = pytBalance < nytBalance ? pytBalance : nytBalance;
        uint256 yieldValue = pendingYield();
        
        return principalValue + yieldValue;
    }
    
    function getCurrentAPY() external view override returns (uint256) {
        // Get APY from underlying SY vault
        return orchestrator.syVault().getCurrentAPY();
    }
    
    function pendingYield() public view override returns (uint256) {
        // Estimate pending yield from PYT tokens
        uint256 pytBalance = pytToken.balanceOf(address(this));
        if (pytBalance == 0) return 0;
        
        // Simple estimation based on time elapsed and APY
        uint256 timeElapsed = block.timestamp - lastYieldClaim;
        uint256 apy = this.getCurrentAPY();
        
        return (totalDeposited * apy * timeElapsed) / (10000 * 365 days);
    }
    
    function canHarvest() external view override returns (bool) {
        return pytToken.balanceOf(address(this)) > 0 && block.timestamp >= lastYieldClaim + 1 hours;
    }
    
    function lastHarvest() external view override returns (uint256) {
        return lastYieldClaim;
    }
    
    // === Strategy Information ===
    
    function strategyName() external pure override returns (string memory) {
        return "PYT/NYT Orchestrator Wrapper";
    }
    
    function riskLevel() external pure override returns (uint8) {
        return 6; // Medium-high risk (yield derivatives)
    }
    
    function minimumDeposit() external pure override returns (uint256) {
        return 10e6; // 10 USDT minimum (higher for derivatives)
    }
    
    function withdrawalFee() external pure override returns (uint256) {
        return 50; // 0.5% fee for complexity of recombining
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
    
    // === Additional View Functions ===
    
    function getPYTNYTBalances() external view returns (uint256 pytBalance, uint256 nytBalance) {
        return (
            pytToken.balanceOf(address(this)),
            nytToken.balanceOf(address(this))
        );
    }
}