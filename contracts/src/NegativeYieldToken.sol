// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title NegativeYieldToken (NYT)
 * @dev Token representing principal protection with time-locked redemption
 * @notice NYT holders can redeem their principal at maturity or during liquidation protection
 */
contract NegativeYieldToken is ERC20, ERC20Permit, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev The underlying asset (USDT)
    address public immutable asset;
    
    /// @dev Maturity timestamp (365 days from deployment)
    uint256 public immutable maturity;
    
    /// @dev Principal protection threshold (90% of initial value)
    uint256 public constant PROTECTION_THRESHOLD = 9000; // 90% in basis points
    
    /// @dev Initial principal amount per token (1:1 with underlying asset)
    uint256 public constant PRINCIPAL_PER_TOKEN = 1e6; // 1 USDT (6 decimals) per NYT
    
    /// @dev Total principal reserved for redemption
    uint256 public totalPrincipalReserved;
    
    /// @dev Emergency liquidation flag
    bool public liquidationProtectionActive;
    
    /// @dev Events
    event NYTMinted(address indexed to, uint256 amount, uint256 principalReserved, uint256 timestamp);
    event NYTRedeemed(address indexed from, uint256 nytAmount, uint256 principalAmount, uint256 timestamp);
    event LiquidationProtectionActivated(uint256 timestamp);
    event PrincipalReserved(uint256 amount, uint256 timestamp);

    /// @dev Errors
    error InvalidAddress();
    error NotMatured();
    error InsufficientPrincipal();
    error RedemptionNotAllowed();
    error OnlyYieldOrchestrator();
    error InvalidAmount();

    /// @dev Modifier to restrict access to yield orchestrator
    modifier onlyYieldOrchestrator() {
        if (msg.sender != owner()) revert OnlyYieldOrchestrator();
        _;
    }

    /// @dev Modifier to check if redemption is allowed
    modifier whenRedemptionAllowed() {
        if (!canRedeem()) revert RedemptionNotAllowed();
        _;
    }

    /**
     * @dev Constructor
     * @param _asset Address of the underlying asset (USDT)
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _initialOwner Initial owner (yield orchestrator)
     */
    constructor(
        address _asset,
        string memory _name,
        string memory _symbol,
        address _initialOwner
    ) 
        ERC20(_name, _symbol) 
        ERC20Permit(_name)
        Ownable(_initialOwner)
    {
        if (_asset == address(0)) revert InvalidAddress();
        
        asset = _asset;
        maturity = block.timestamp + 365 days; // 1 year maturity
    }

    /**
     * @dev Mint NYT tokens and reserve principal (only yield orchestrator)
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyYieldOrchestrator nonReentrant {
        if (amount == 0) revert InvalidAmount();
        
        // Calculate principal to reserve (1:1 ratio)
        uint256 principalToReserve = amount * PRINCIPAL_PER_TOKEN / 1e18;
        
        // Transfer principal from orchestrator to this contract
        IERC20(asset).safeTransferFrom(msg.sender, address(this), principalToReserve);
        
        // Update accounting
        totalPrincipalReserved += principalToReserve;
        
        // Mint tokens
        _mint(to, amount);
        
        emit NYTMinted(to, amount, principalToReserve, block.timestamp);
    }

    /**
     * @dev Burn NYT tokens without redeeming principal (only yield orchestrator)
     * @param from Address to burn tokens from
     * @param amount Amount of tokens to burn
     */
    function burn(address from, uint256 amount) external onlyYieldOrchestrator nonReentrant {
        if (amount == 0 || balanceOf(from) < amount) revert InvalidAmount();
        
        // Calculate principal amount that would be freed up
        uint256 principalToFree = amount * PRINCIPAL_PER_TOKEN / 1e18;
        
        // Update accounting (keep principal in contract for other holders)
        totalPrincipalReserved -= principalToFree;
        
        // Burn tokens
        _burn(from, amount);
        
        emit NYTRedeemed(from, amount, 0, block.timestamp); // 0 principal transferred to user
    }

    /**
     * @dev Redeem NYT tokens for principal (only after maturity or during liquidation)
     * @param amount Amount of NYT tokens to redeem
     * @return principalAmount Amount of principal received
     */
    function redeem(uint256 amount) external whenRedemptionAllowed nonReentrant returns (uint256 principalAmount) {
        if (amount == 0 || balanceOf(msg.sender) < amount) revert InvalidAmount();
        
        // Calculate principal amount (1:1 redemption)
        principalAmount = amount * PRINCIPAL_PER_TOKEN / 1e18;
        
        if (principalAmount > IERC20(asset).balanceOf(address(this))) {
            revert InsufficientPrincipal();
        }
        
        // Update accounting
        totalPrincipalReserved -= principalAmount;
        
        // Burn tokens
        _burn(msg.sender, amount);
        
        // Transfer principal to user
        IERC20(asset).safeTransfer(msg.sender, principalAmount);
        
        emit NYTRedeemed(msg.sender, amount, principalAmount, block.timestamp);
    }

    /**
     * @dev Activate liquidation protection (only yield orchestrator)
     * @dev Called when vault value drops below protection threshold
     */
    function activateLiquidationProtection() external onlyYieldOrchestrator {
        liquidationProtectionActive = true;
        emit LiquidationProtectionActivated(block.timestamp);
    }

    /**
     * @dev Add principal reserves (only yield orchestrator)
     * @param amount Amount of principal to add
     */
    function addPrincipalReserves(uint256 amount) external onlyYieldOrchestrator nonReentrant {
        if (amount == 0) revert InvalidAmount();
        
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        totalPrincipalReserved += amount;
        
        emit PrincipalReserved(amount, block.timestamp);
    }

    /**
     * @dev Check if redemption is currently allowed
     * @return True if tokens can be redeemed
     */
    function canRedeem() public view returns (bool) {
        return block.timestamp >= maturity || liquidationProtectionActive;
    }

    /**
     * @dev Check if tokens have matured
     * @return True if maturity date has passed
     */
    function isMatured() external view returns (bool) {
        return block.timestamp >= maturity;
    }

    /**
     * @dev Get time remaining until maturity
     * @return seconds Time in seconds until maturity (0 if already matured)
     */
    function timeToMaturity() external view returns (uint256) {
        if (block.timestamp >= maturity) return 0;
        return maturity - block.timestamp;
    }

    /**
     * @dev Get days remaining until maturity
     * @return days Number of days until maturity (0 if already matured)
     */
    function daysToMaturity() external view returns (uint256) {
        if (block.timestamp >= maturity) return 0;
        return (maturity - block.timestamp) / 1 days;
    }

    /**
     * @dev Get principal amount for a given NYT amount
     * @param nytAmount Amount of NYT tokens
     * @return principalAmount Corresponding principal amount
     */
    function getPrincipalAmount(uint256 nytAmount) external pure returns (uint256 principalAmount) {
        principalAmount = nytAmount * PRINCIPAL_PER_TOKEN / 1e18;
    }

    /**
     * @dev Get contract status and metrics
     * @return totalSupply Total NYT tokens in circulation
     * @return totalReserved Total principal reserved
     * @return maturityTimestamp Maturity timestamp
     * @return isLiquidationActive Whether liquidation protection is active
     * @return redemptionAllowed Whether redemption is currently allowed
     */
    function getStatus() external view returns (
        uint256 totalSupply,
        uint256 totalReserved,
        uint256 maturityTimestamp,
        bool isLiquidationActive,
        bool redemptionAllowed
    ) {
        totalSupply = super.totalSupply();
        totalReserved = totalPrincipalReserved;
        maturityTimestamp = maturity;
        isLiquidationActive = liquidationProtectionActive;
        redemptionAllowed = canRedeem();
    }

    /**
     * @dev Get user's position information
     * @param user Address of the user
     * @return nytBalance User's NYT token balance
     * @return principalValue Principal value of user's position
     * @return canRedeemNow Whether user can redeem now
     */
    function getUserPosition(address user) external view returns (
        uint256 nytBalance,
        uint256 principalValue,
        bool canRedeemNow
    ) {
        nytBalance = balanceOf(user);
        principalValue = nytBalance * PRINCIPAL_PER_TOKEN / 1e18;
        canRedeemNow = canRedeem();
    }

    /**
     * @dev Emergency function to recover stuck tokens (only owner)
     * @param token Token address to recover
     * @param to Address to send recovered tokens to
     * @param amount Amount to recover
     */
    function emergencyRecover(address token, address to, uint256 amount) external onlyOwner {
        // Prevent recovery of reserved principal
        if (token == asset) {
            uint256 availableBalance = IERC20(asset).balanceOf(address(this)) - totalPrincipalReserved;
            require(amount <= availableBalance, "Cannot recover reserved principal");
        }
        
        IERC20(token).safeTransfer(to, amount);
    }
}