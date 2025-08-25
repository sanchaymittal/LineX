// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PerpetualYieldToken} from "./PerpetualYieldToken.sol";
import {NegativeYieldToken} from "./NegativeYieldToken.sol";
import {SYVault} from "./SYVault.sol";

/**
 * @title YieldOrchestrator
 * @dev Manages the splitting of SY vault shares into PYT (yield rights) and NYT (principal protection)
 * @notice Coordinates yield distribution and token lifecycle management
 */
contract YieldOrchestrator is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    /// @dev The SY Vault contract
    SYVault public immutable syVault;
    
    /// @dev The underlying asset (USDT)
    IERC20 public immutable asset;
    
    /// @dev The Perpetual Yield Token contract
    PerpetualYieldToken public immutable pytToken;
    
    /// @dev The Negative Yield Token contract
    NegativeYieldToken public immutable nytToken;
    
    /// @dev Minimum time between yield distributions (24 hours)
    uint256 public constant YIELD_DISTRIBUTION_INTERVAL = 1 days;
    
    /// @dev Last yield distribution timestamp
    uint256 public lastYieldDistribution;
    
    /// @dev Total SY shares under management
    uint256 public totalSYShares;
    
    /// @dev Principal protection threshold (90%)
    uint256 public constant PROTECTION_THRESHOLD = 9000; // 90% in basis points
    
    /// @dev Events
    event SharesSplit(
        address indexed user, 
        uint256 syShares, 
        uint256 pytMinted, 
        uint256 nytMinted, 
        uint256 timestamp
    );
    event SharesRecombined(
        address indexed user, 
        uint256 pytBurned, 
        uint256 nytBurned, 
        uint256 syShares, 
        uint256 timestamp
    );
    event YieldHarvested(uint256 yieldAmount, uint256 timestamp);
    event YieldDistributed(uint256 pytYield, uint256 timestamp);
    event LiquidationProtectionTriggered(uint256 vaultValue, uint256 threshold, uint256 timestamp);

    /// @dev Errors
    error InvalidAmount();
    error InsufficientShares();
    error InsufficientTokens();
    error TooEarlyForDistribution();
    error ProtectionThresholdBreached();

    /**
     * @dev Constructor
     * @param _syVault Address of the SY Vault
     * @param _pytToken Address of the PYT token
     * @param _nytToken Address of the NYT token
     * @param _initialOwner Initial owner of the contract
     */
    constructor(
        address _syVault,
        address _pytToken,
        address _nytToken,
        address _initialOwner
    ) Ownable(_initialOwner) {
        syVault = SYVault(_syVault);
        asset = IERC20(syVault.asset());
        pytToken = PerpetualYieldToken(_pytToken);
        nytToken = NegativeYieldToken(_nytToken);
        
        lastYieldDistribution = block.timestamp;
    }

    /**
     * @dev Split SY vault shares into PYT + NYT tokens (1:1:1 ratio)
     * @param syShares Amount of SY shares to split
     * @param recipient Address to receive the PYT and NYT tokens
     */
    function splitShares(uint256 syShares, address recipient) external nonReentrant {
        if (syShares == 0) revert InvalidAmount();
        if (syVault.balanceOf(msg.sender) < syShares) revert InsufficientShares();
        
        // Transfer SY shares from user to this contract
        IERC20(address(syVault)).safeTransferFrom(msg.sender, address(this), syShares);
        
        // Update total shares under management
        totalSYShares += syShares;
        
        // Calculate underlying assets value for principal protection
        uint256 underlyingAssets = syVault.previewRedeem(syShares);
        
        // Mint PYT tokens (1:1 with SY shares)
        pytToken.mint(recipient, syShares);
        
        // Reserve principal and mint NYT tokens
        // Need to approve NYT contract to transfer principal
        asset.safeIncreaseAllowance(address(nytToken), underlyingAssets);
        nytToken.mint(recipient, syShares);
        
        emit SharesSplit(recipient, syShares, syShares, syShares, block.timestamp);
    }

    /**
     * @dev Recombine PYT + NYT tokens back into SY vault shares (1:1:1 ratio)
     * @param tokenAmount Amount of PYT/NYT tokens to recombine (must be equal for both)
     * @param recipient Address to receive the SY shares
     */
    function recombineShares(uint256 tokenAmount, address recipient) external nonReentrant {
        if (tokenAmount == 0) revert InvalidAmount();
        if (pytToken.balanceOf(msg.sender) < tokenAmount || nytToken.balanceOf(msg.sender) < tokenAmount) {
            revert InsufficientTokens();
        }
        
        // Burn PYT tokens (claims any pending yield first)
        pytToken.burn(msg.sender, tokenAmount);
        
        // Burn NYT tokens 
        nytToken.burn(msg.sender, tokenAmount);
        
        // Update total shares under management
        totalSYShares -= tokenAmount;
        
        // Transfer SY shares to recipient
        IERC20(address(syVault)).safeTransfer(recipient, tokenAmount);
        
        emit SharesRecombined(recipient, tokenAmount, tokenAmount, tokenAmount, block.timestamp);
    }

    /**
     * @dev Harvest yield from the SY vault and distribute to PYT holders
     */
    function harvestAndDistributeYield() external nonReentrant {
        if (block.timestamp < lastYieldDistribution + YIELD_DISTRIBUTION_INTERVAL) {
            revert TooEarlyForDistribution();
        }
        
        // Trigger yield distribution in the SY vault
        syVault.distributeYield();
        
        // Calculate current vault value
        uint256 currentVaultValue = syVault.totalAssets();
        uint256 ourShares = totalSYShares;
        
        if (ourShares == 0) return;
        
        // Calculate our portion of vault assets
        uint256 ourAssetValue = (currentVaultValue * ourShares) / syVault.totalSupply();
        
        // Check if liquidation protection should be triggered
        uint256 originalPrincipal = nytToken.totalPrincipalReserved();
        uint256 protectionThreshold = (originalPrincipal * PROTECTION_THRESHOLD) / 10000;
        
        if (ourAssetValue < protectionThreshold && !nytToken.liquidationProtectionActive()) {
            nytToken.activateLiquidationProtection();
            emit LiquidationProtectionTriggered(ourAssetValue, protectionThreshold, block.timestamp);
        }
        
        // Calculate yield (current value minus reserved principal)
        if (ourAssetValue > originalPrincipal) {
            uint256 yieldAmount = ourAssetValue - originalPrincipal;
            
            // Redeem some SY shares to get yield in USDT
            uint256 sharesToRedeem = syVault.previewWithdraw(yieldAmount);
            if (sharesToRedeem > 0 && sharesToRedeem <= ourShares) {
                syVault.redeem(sharesToRedeem, address(this), address(this));
                totalSYShares -= sharesToRedeem;
                
                // Distribute yield to PYT holders
                asset.safeIncreaseAllowance(address(pytToken), yieldAmount);
                pytToken.distributeYield(yieldAmount);
                
                emit YieldHarvested(yieldAmount, block.timestamp);
                emit YieldDistributed(yieldAmount, block.timestamp);
            }
        }
        
        lastYieldDistribution = block.timestamp;
    }

    /**
     * @dev Emergency function to add principal reserves to NYT contract
     * @param amount Amount of principal to add
     */
    function addPrincipalReserves(uint256 amount) external onlyOwner nonReentrant {
        asset.safeTransferFrom(msg.sender, address(this), amount);
        asset.safeIncreaseAllowance(address(nytToken), amount);
        nytToken.addPrincipalReserves(amount);
    }

    /**
     * @dev Get orchestrator statistics
     * @return totalShares Total SY shares under management
     * @return pytSupply Total PYT tokens in circulation
     * @return nytSupply Total NYT tokens in circulation
     * @return lastDistribution Last yield distribution timestamp
     * @return nextDistribution Next possible distribution timestamp
     * @return vaultValue Current value of managed vault shares
     */
    function getStats() external view returns (
        uint256 totalShares,
        uint256 pytSupply,
        uint256 nytSupply,
        uint256 lastDistribution,
        uint256 nextDistribution,
        uint256 vaultValue
    ) {
        totalShares = totalSYShares;
        pytSupply = pytToken.totalSupply();
        nytSupply = nytToken.totalSupply();
        lastDistribution = lastYieldDistribution;
        nextDistribution = lastYieldDistribution + YIELD_DISTRIBUTION_INTERVAL;
        
        if (totalShares > 0 && syVault.totalSupply() > 0) {
            vaultValue = (syVault.totalAssets() * totalShares) / syVault.totalSupply();
        }
    }

    /**
     * @dev Check if yield distribution can be triggered
     * @return canDistribute True if yield can be distributed now
     * @return timeUntilNext Time until next distribution (0 if can distribute now)
     */
    function canDistributeYield() external view returns (bool canDistribute, uint256 timeUntilNext) {
        uint256 nextTime = lastYieldDistribution + YIELD_DISTRIBUTION_INTERVAL;
        canDistribute = block.timestamp >= nextTime;
        timeUntilNext = canDistribute ? 0 : nextTime - block.timestamp;
    }

    /**
     * @dev Get splitting preview (how much PYT/NYT would be minted for given SY shares)
     * @param syShares Amount of SY shares to split
     * @return pytAmount Amount of PYT that would be minted
     * @return nytAmount Amount of NYT that would be minted
     * @return underlyingValue Underlying asset value
     */
    function previewSplit(uint256 syShares) external view returns (
        uint256 pytAmount,
        uint256 nytAmount,
        uint256 underlyingValue
    ) {
        pytAmount = syShares; // 1:1 ratio
        nytAmount = syShares; // 1:1 ratio
        underlyingValue = syVault.previewRedeem(syShares);
    }

    /**
     * @dev Get recombination preview (SY shares that would be received)
     * @param tokenAmount Amount of PYT/NYT tokens to recombine
     * @return syShares Amount of SY shares that would be received
     */
    function previewRecombine(uint256 tokenAmount) external pure returns (uint256 syShares) {
        syShares = tokenAmount; // 1:1 ratio
    }
}