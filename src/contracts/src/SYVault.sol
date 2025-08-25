// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title SYVault - Standardized Yield Vault
 * @dev ERC4626 compliant vault for USDT yield generation and PYT/NYT splitting
 * @notice This vault accepts USDT deposits, generates yield, and enables yield splitting
 */
contract SYVault is ERC4626, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    using Math for uint256;

    /// @dev The underlying USDT token
    IERC20 public immutable usdtToken;

    /// @dev Fee rate in basis points (100 = 1%)
    uint256 public managementFee;

    /// @dev Maximum management fee (10%)
    uint256 public constant MAX_MANAGEMENT_FEE = 1000;

    /// @dev Yield distribution parameters
    uint256 public lastYieldDistribution;
    uint256 public totalYieldGenerated;
    uint256 public yieldRate; // Annual yield rate in basis points

    /// @dev Emergency pause flag
    bool public paused;

    /// @dev Events
    event YieldDistributed(uint256 amount, uint256 timestamp);
    event ManagementFeeUpdated(uint256 oldFee, uint256 newFee);
    event YieldRateUpdated(uint256 oldRate, uint256 newRate);
    event EmergencyPaused(bool paused);

    /// @dev Errors
    error VaultPaused();
    error InvalidFeeRate();
    error InvalidYieldRate();
    error InsufficientAssets();
    error ZeroAmount();

    /**
     * @dev Constructor
     * @param _usdtToken The underlying USDT token address
     * @param _name The vault token name
     * @param _symbol The vault token symbol
     * @param _initialOwner The initial owner of the vault
     */
    constructor(
        IERC20 _usdtToken,
        string memory _name,
        string memory _symbol,
        address _initialOwner
    ) 
        ERC4626(_usdtToken) 
        ERC20(_name, _symbol) 
        Ownable(_initialOwner)
    {
        usdtToken = _usdtToken;
        managementFee = 200; // 2% default management fee
        yieldRate = 800; // 8% default annual yield rate
        lastYieldDistribution = block.timestamp;
    }

    /// @dev Modifier to check if vault is not paused
    modifier whenNotPaused() {
        if (paused) revert VaultPaused();
        _;
    }

    /**
     * @dev Deposit assets and receive vault shares
     * @param assets Amount of USDT to deposit
     * @param receiver Address to receive vault shares
     * @return shares Amount of vault shares minted
     */
    function deposit(uint256 assets, address receiver) 
        public 
        virtual 
        override 
        nonReentrant 
        whenNotPaused 
        returns (uint256 shares) 
    {
        if (assets == 0) revert ZeroAmount();
        
        shares = previewDeposit(assets);
        
        // Transfer USDT from user to vault
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), assets);
        
        // Mint vault shares to receiver
        _mint(receiver, shares);
        
        emit Deposit(msg.sender, receiver, assets, shares);
        
        // Trigger yield distribution if needed
        _distributeYieldIfNeeded();
    }

    /**
     * @dev Withdraw assets by burning vault shares
     * @param assets Amount of USDT to withdraw
     * @param receiver Address to receive withdrawn assets
     * @param owner Address that owns the shares to burn
     * @return shares Amount of vault shares burned
     */
    function withdraw(uint256 assets, address receiver, address owner)
        public
        virtual
        override
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        if (assets == 0) revert ZeroAmount();
        if (assets > maxWithdraw(owner)) revert InsufficientAssets();

        shares = previewWithdraw(assets);
        
        // Handle allowance if not owner
        if (msg.sender != owner) {
            _spendAllowance(owner, msg.sender, shares);
        }
        
        // Burn shares from owner
        _burn(owner, shares);
        
        // Transfer USDT to receiver
        IERC20(asset()).safeTransfer(receiver, assets);
        
        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    /**
     * @dev Get total assets under management (including accrued yield)
     * @return Total USDT balance plus accrued yield
     */
    function totalAssets() public view virtual override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) + _calculateAccruedYield();
    }

    /**
     * @dev Calculate accrued yield since last distribution
     * @return Accrued yield amount
     */
    function _calculateAccruedYield() internal view returns (uint256) {
        if (totalSupply() == 0) return 0;
        
        uint256 timeElapsed = block.timestamp - lastYieldDistribution;
        uint256 principal = IERC20(asset()).balanceOf(address(this));
        
        // Calculate yield based on annual rate
        // yield = principal * rate * timeElapsed / (365 days * 10000)
        return principal * yieldRate * timeElapsed / (365 days * 10000);
    }

    /**
     * @dev Distribute yield if 24 hours have passed
     */
    function _distributeYieldIfNeeded() internal {
        if (block.timestamp >= lastYieldDistribution + 1 days) {
            _distributeYield();
        }
    }

    /**
     * @dev Internal yield distribution logic
     */
    function _distributeYield() internal {
        uint256 accruedYield = _calculateAccruedYield();
        
        if (accruedYield > 0) {
            totalYieldGenerated += accruedYield;
            lastYieldDistribution = block.timestamp;
            
            emit YieldDistributed(accruedYield, block.timestamp);
        }
    }

    /**
     * @dev Manual yield distribution (only owner)
     */
    function distributeYield() external onlyOwner {
        _distributeYield();
    }

    /**
     * @dev Update management fee (only owner)
     * @param newFee New fee rate in basis points
     */
    function setManagementFee(uint256 newFee) external onlyOwner {
        if (newFee > MAX_MANAGEMENT_FEE) revert InvalidFeeRate();
        
        uint256 oldFee = managementFee;
        managementFee = newFee;
        
        emit ManagementFeeUpdated(oldFee, newFee);
    }

    /**
     * @dev Update yield rate (only owner)
     * @param newRate New annual yield rate in basis points
     */
    function setYieldRate(uint256 newRate) external onlyOwner {
        if (newRate > 5000) revert InvalidYieldRate(); // Max 50% APY
        
        uint256 oldRate = yieldRate;
        yieldRate = newRate;
        
        emit YieldRateUpdated(oldRate, newRate);
    }

    /**
     * @dev Emergency pause/unpause (only owner)
     * @param _paused Pause state
     */
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit EmergencyPaused(_paused);
    }

    /**
     * @dev Get current yield metrics
     * @return currentYield Current accrued yield
     * @return annualRate Current annual yield rate
     * @return lastDistribution Last yield distribution timestamp
     */
    function getYieldMetrics() 
        external 
        view 
        returns (uint256 currentYield, uint256 annualRate, uint256 lastDistribution) 
    {
        return (_calculateAccruedYield(), yieldRate, lastYieldDistribution);
    }

    /**
     * @dev Get vault statistics
     * @return totalDeposits Total assets under management
     * @return totalShares Total vault shares outstanding
     * @return sharePrice Current share price (assets per share)
     * @return totalYield Total yield generated historically
     */
    function getVaultStats() 
        external 
        view 
        returns (uint256 totalDeposits, uint256 totalShares, uint256 sharePrice, uint256 totalYield) 
    {
        totalDeposits = totalAssets();
        totalShares = totalSupply();
        sharePrice = totalShares > 0 ? totalDeposits * 1e18 / totalShares : 1e18;
        totalYield = totalYieldGenerated;
    }

    /**
     * @dev Check if user can deposit given amount
     * @param user User address
     * @param amount Amount to deposit
     * @return canDeposit True if deposit is possible
     * @return reason Reason if deposit is not possible
     */
    function canDeposit(address user, uint256 amount) 
        external 
        view 
        returns (bool canDeposit, string memory reason) 
    {
        if (paused) return (false, "Vault is paused");
        if (amount == 0) return (false, "Zero amount");
        if (IERC20(asset()).balanceOf(user) < amount) return (false, "Insufficient balance");
        if (IERC20(asset()).allowance(user, address(this)) < amount) return (false, "Insufficient allowance");
        
        return (true, "");
    }

    /**
     * @dev Check if user can withdraw given amount
     * @param user User address
     * @param amount Amount to withdraw
     * @return canWithdraw True if withdrawal is possible
     * @return reason Reason if withdrawal is not possible
     */
    function canWithdraw(address user, uint256 amount) 
        external 
        view 
        returns (bool canWithdraw, string memory reason) 
    {
        if (paused) return (false, "Vault is paused");
        if (amount == 0) return (false, "Zero amount");
        if (amount > maxWithdraw(user)) return (false, "Insufficient shares");
        
        return (true, "");
    }
}