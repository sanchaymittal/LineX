// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/ISY.sol";
import "../tokens/PerpetualYieldToken.sol";
import "../tokens/NegativeYieldToken.sol";
import "../utils/YieldForecaster.sol";

/**
 * @title PYTNYTOrchestrator
 * @dev Orchestrates PYT/NYT splitting and yield distribution
 * Simplified factory and management system without complex Gate mechanics
 */
contract PYTNYTOrchestrator is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // Core components
    ISY public immutable syVault;
    IERC20 public immutable baseAsset;
    PerpetualYieldToken public immutable pytToken;
    NegativeYieldToken public immutable nytToken;
    YieldForecaster public immutable forecaster;
    
    // Splitting state
    uint256 public totalSplit;
    mapping(address => uint256) public userSplitAmount;
    
    // Yield distribution
    uint256 public lastDistribution;
    uint256 public distributionInterval = 1 hours;
    uint256 public totalYieldDistributed;
    
    // Events
    event YieldSplit(address indexed user, uint256 amount, uint256 pytMinted, uint256 nytMinted);
    event YieldRecombined(address indexed user, uint256 pytBurned, uint256 nytBurned, uint256 assetsRecovered);
    event YieldDistributionTriggered(uint256 totalYield, uint256 timestamp);
    event DistributionIntervalUpdated(uint256 oldInterval, uint256 newInterval);
    
    constructor(
        ISY _syVault,
        address _owner
    ) Ownable(_owner) {
        syVault = _syVault;
        baseAsset = IERC20(_syVault.asset());
        
        // Deploy PYT and NYT tokens
        pytToken = new PerpetualYieldToken(
            _syVault,
            "Perpetual Yield Token",
            "PYT",
            address(this)
        );
        
        nytToken = new NegativeYieldToken(
            _syVault,
            "Negative Yield Token", 
            "NYT",
            address(this)
        );
        
        // Deploy yield forecaster
        forecaster = new YieldForecaster(address(this));
        
        // Link PYT and NYT contracts
        pytToken.setNYTContract(address(nytToken));
        nytToken.setPYTContract(address(pytToken));
        
        lastDistribution = block.timestamp;
    }
    
    // Split SY shares into PYT + NYT
    function splitYield(uint256 _syShares, address _to) external whenNotPaused nonReentrant {
        require(_syShares > 0, "Cannot split 0");
        
        // Transfer SY shares from user
        syVault.transferFrom(msg.sender, address(this), _syShares);
        
        // NEW ECONOMICS: Preserve full value in both tokens
        // PYT gets all SY shares for yield generation
        // NYT gets equivalent asset amount for principal protection
        
        uint256 assetEquivalent = syVault.previewRedeem(_syShares);
        
        // Mint PYT (gets yield) - transfer ALL SY shares to PYT contract
        syVault.approve(address(pytToken), _syShares);
        syVault.transfer(address(pytToken), _syShares);
        pytToken.mint(_syShares, _to);
        
        // Mint NYT (gets principal protection) - backed by equivalent asset amount
        // NYT contract needs sufficient backing for principal protection
        require(baseAsset.balanceOf(address(nytToken)) >= assetEquivalent, "Insufficient NYT backing");
        nytToken.mint(assetEquivalent, _to);
        
        // Track splitting
        totalSplit += _syShares;
        userSplitAmount[_to] += _syShares;
        
        emit YieldSplit(_to, _syShares, _syShares, assetEquivalent);
    }
    
    // Recombine PYT + NYT back to SY shares (new 1:1 economics)
    function recombineYield(uint256 _pytAmount, address _to) external whenNotPaused nonReentrant {
        require(_pytAmount > 0, "Cannot recombine 0");
        require(pytToken.balanceOf(msg.sender) >= _pytAmount, "Insufficient PYT");
        
        // Calculate equivalent NYT amount needed (should be equal in new model)
        uint256 nytAmountNeeded = _pytAmount; // 1:1 correspondence in new economics
        require(nytToken.balanceOf(msg.sender) >= nytAmountNeeded, "Insufficient NYT");
        
        // Check allowances for orchestrator to burn tokens
        require(pytToken.allowance(msg.sender, address(this)) >= _pytAmount, "Insufficient PYT allowance");
        require(nytToken.allowance(msg.sender, address(this)) >= nytAmountNeeded, "Insufficient NYT allowance");
        
        // Burn PYT tokens from user and get SY shares back to orchestrator
        uint256 recoveredSyShares = pytToken.burnFrom(msg.sender, _pytAmount, address(this));
        
        // Burn NYT tokens using recombination function (bypasses maturity checks)
        // This returns base assets to the orchestrator as part of the recombination
        uint256 recoveredAssets = nytToken.redeemForRecombination(nytAmountNeeded, msg.sender, address(this));
        
        // For recombination, user gets back what was actually recovered from PYT
        // If less than expected due to yield distribution, compensate with equivalent value
        if (recoveredSyShares < _pytAmount) {
            // Calculate shortfall and compensate with base assets
            uint256 shortfall = _pytAmount - recoveredSyShares;
            uint256 shortfallValue = syVault.convertToAssets(shortfall);
            
            // Use recovered NYT assets to compensate for SY share shortfall
            if (recoveredAssets >= shortfallValue) {
                // Convert shortfall to SY shares using recovered assets
                baseAsset.approve(address(syVault), shortfallValue);
                uint256 compensationShares = syVault.deposit(shortfallValue, address(this));
                recoveredSyShares += compensationShares;
            }
        }
        
        // Transfer final SY shares to user
        syVault.transfer(_to, recoveredSyShares);
        
        // Update tracking based on actual amounts
        totalSplit -= recoveredSyShares;
        userSplitAmount[msg.sender] = userSplitAmount[msg.sender] > recoveredSyShares ? 
            userSplitAmount[msg.sender] - recoveredSyShares : 0;
        
        emit YieldRecombined(msg.sender, _pytAmount, nytAmountNeeded, recoveredSyShares);
    }
    
    // Automated yield distribution
    function distributeYield() external whenNotPaused {
        require(block.timestamp >= lastDistribution + distributionInterval, "Too early");
        
        // Trigger PYT yield distribution
        pytToken.distributeYield();
        
        // Update distribution tracking
        lastDistribution = block.timestamp;
        
        // Get current yield stats
        (uint256 totalDistributed,,,) = pytToken.getYieldInfo();
        totalYieldDistributed = totalDistributed;
        
        emit YieldDistributionTriggered(totalDistributed, block.timestamp);
    }
    
    // Analytics and forecasting
    function getYieldForecast(uint256 _timeHorizon) external view returns (
        uint256 projectedPYTYield,
        uint256 confidenceScore,
        uint256 minExpected,
        uint256 maxExpected
    ) {
        // Get SY vault forecast if available
        try forecaster.generateForecast(address(syVault), _timeHorizon) returns (
            uint256 projectedAPY,
            uint256 confidence,
            uint256 minAPY,
            uint256 maxAPY
        ) {
            return (projectedAPY, confidence, minAPY, maxAPY);
        } catch {
            // Fallback to current APY
            uint256 currentAPY = syVault.getCurrentAPY();
            return (currentAPY, 50, currentAPY * 80 / 100, currentAPY * 120 / 100);
        }
    }
    
    function getPortfolioSummary() external view returns (
        uint256 totalSYShares,
        uint256 totalPYTSupply,
        uint256 totalNYTSupply,
        uint256 totalYieldEarned,
        uint256 currentAPY
    ) {
        return (
            totalSplit,
            pytToken.totalSupply(),
            nytToken.totalSupply(),
            totalYieldDistributed,
            syVault.getCurrentAPY()
        );
    }
    
    function getUserPosition(address _user) external view returns (
        uint256 pytBalance,
        uint256 nytBalance,
        uint256 pendingYield,
        uint256 principalProtected,
        bool liquidationProtection
    ) {
        uint256 pytBal = pytToken.balanceOf(_user);
        uint256 nytBal = nytToken.balanceOf(_user);
        uint256 pending = pytToken.pendingYield(_user);
        
        (,,, bool protected, bool needsProtection,) = nytToken.getUserInfo(_user);
        
        return (pytBal, nytBal, pending, nytBal, protected || needsProtection);
    }
    
    // Owner functions
    function setDistributionInterval(uint256 _interval) external onlyOwner {
        require(_interval >= 1 minutes, "Interval too short");
        require(_interval <= 24 hours, "Interval too long");
        
        uint256 oldInterval = distributionInterval;
        distributionInterval = _interval;
        
        emit DistributionIntervalUpdated(oldInterval, _interval);
    }
    
    function setPYTAutoCompound(bool _enabled) external onlyOwner {
        pytToken.setAutoCompound(_enabled);
    }
    
    function setPYTCompoundThreshold(uint256 _threshold) external onlyOwner {
        pytToken.setCompoundThreshold(_threshold);
    }
    
    function pause() external onlyOwner {
        _pause();
        pytToken.pause();
        nytToken.pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
        pytToken.unpause();
        nytToken.unpause();
    }
    
    // Emergency functions
    function emergencyWithdraw() external onlyOwner {
        // Withdraw from orchestrator
        uint256 balance = syVault.balanceOf(address(this));
        if (balance > 0) {
            syVault.transfer(owner(), balance);
        }
        
        uint256 assetBalance = baseAsset.balanceOf(address(this));
        if (assetBalance > 0) {
            baseAsset.safeTransfer(owner(), assetBalance);
        }
        
        // Emergency withdraw from PYT contract (where SY shares are held)
        uint256 pytSyBalance = syVault.balanceOf(address(pytToken));
        if (pytSyBalance > 0) {
            // Add emergency withdraw function to PYT
            pytToken.emergencyWithdraw(owner());
        }
        
        // Emergency withdraw from NYT contract  
        uint256 nytAssetBalance = baseAsset.balanceOf(address(nytToken));
        if (nytAssetBalance > 0) {
            nytToken.emergencyWithdraw(owner());
        }
    }
}