// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/ISY.sol";

/**
 * @title NegativeYieldToken
 * @dev Represents principal with recovery mechanism
 * Provides liquidation protection and guaranteed principal recovery
 */
contract NegativeYieldToken is ERC20, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // Core state
    ISY public immutable syVault;
    IERC20 public immutable baseAsset;
    address public pytContract;
    
    // Principal tracking with struct to prevent storage corruption
    struct UserData {
        uint256 principalAmount;
        uint256 maturityTime;
    }
    
    mapping(address => UserData) public userData;
    uint256 public totalPrincipalDeposited;
    
    // Recovery mechanism
    uint256 public constant MATURITY_PERIOD = 365 days; // 1 year maturity
    uint256 public constant LIQUIDATION_THRESHOLD = 9000; // 90% of principal (basis points)
    uint256 public constant BASIS_POINTS = 10000;
    
    // Liquidation protection
    bool public liquidationProtectionEnabled = true;
    mapping(address => bool) public protectedUsers;
    
    // Events
    event PrincipalDeposited(address indexed user, uint256 amount, uint256 maturity);
    event PrincipalRecovered(address indexed user, uint256 amount);
    event LiquidationProtectionTriggered(address indexed user, uint256 protectedAmount);
    event MaturityReached(address indexed user, uint256 amount);
    event PYTContractSet(address indexed pytContract);
    
    constructor(
        ISY _syVault,
        string memory _name,
        string memory _symbol,
        address _owner
    ) ERC20(_name, _symbol) Ownable(_owner) {
        syVault = _syVault;
        baseAsset = IERC20(_syVault.asset());
    }
    
    function setPYTContract(address _pytContract) external onlyOwner {
        require(_pytContract != address(0), "Invalid PYT contract");
        pytContract = _pytContract;
        emit PYTContractSet(_pytContract);
    }
    
    // Mint NYT tokens representing principal (called by orchestrator with SY shares)
    function mint(uint256 _assetAmount, address _to) external whenNotPaused nonReentrant {
        require(_assetAmount > 0, "Cannot mint 0");
        require(msg.sender == owner(), "Only orchestrator can mint");
        
        // Mint NYT tokens based on the asset amount equivalent
        _mint(_to, _assetAmount);
        
        // Track principal amount
        userData[_to].principalAmount += _assetAmount;
        totalPrincipalDeposited += _assetAmount;
        protectedUsers[_to] = true;
        
        // Set maturity timestamp only on first deposit for this user
        if (userData[_to].maturityTime == 0) {
            userData[_to].maturityTime = _calculateMaturityTimestamp();
        }
        
        emit PrincipalDeposited(_to, _assetAmount, userData[_to].maturityTime);
    }
    
    // Isolated maturity calculation to prevent variable corruption
    function _calculateMaturityTimestamp() internal view returns (uint256) {
        uint256 currentBlockTime = block.timestamp;
        uint256 maturityDuration = MATURITY_PERIOD;
        uint256 maturityTime = currentBlockTime + maturityDuration;
        
        // Validate the calculation
        require(maturityTime > currentBlockTime, "Invalid maturity calculation");
        require(maturityTime < currentBlockTime + (400 * 365 days), "Maturity too far in future");
        
        return maturityTime;
    }
    
    
    // Redeem NYT for principal recovery
    function redeem(uint256 _nytAmount, address _to) external whenNotPaused nonReentrant returns (uint256) {
        require(_nytAmount > 0, "Cannot redeem 0");
        require(_nytAmount <= balanceOf(msg.sender), "Insufficient balance");
        
        // Check if maturity reached or liquidation protection triggered
        bool maturityReached = block.timestamp >= userData[msg.sender].maturityTime;
        bool needsProtection = _shouldTriggerLiquidationProtection(msg.sender);
        bool canRedeem = maturityReached || needsProtection;
        
        require(canRedeem, "Not yet mature and no liquidation protection needed");
        
        // Calculate recoverable principal
        uint256 recoverableAmount = _nytAmount;
        
        // If liquidation protection, ensure at least 90% recovery
        if (needsProtection) {
            uint256 minRecovery = (_nytAmount * LIQUIDATION_THRESHOLD) / BASIS_POINTS;
            recoverableAmount = minRecovery;
            emit LiquidationProtectionTriggered(msg.sender, recoverableAmount);
        }
        
        // NEW: Use direct asset backing instead of SY shares
        // NYT contract should have sufficient base assets from insurance fund
        require(baseAsset.balanceOf(address(this)) >= recoverableAmount, "Insufficient backing assets");
        
        // Burn NYT tokens
        _burn(msg.sender, _nytAmount);
        
        // Transfer recovered principal
        baseAsset.safeTransfer(_to, recoverableAmount);
        
        // Update tracking
        userData[msg.sender].principalAmount -= _nytAmount;
        totalPrincipalDeposited -= _nytAmount;
        
        if (userData[msg.sender].principalAmount == 0) {
            protectedUsers[msg.sender] = false;
            userData[msg.sender].maturityTime = 0;
        }
        
        emit PrincipalRecovered(_to, recoverableAmount);
        
        if (block.timestamp >= userData[msg.sender].maturityTime) {
            emit MaturityReached(msg.sender, recoverableAmount);
        }
        
        return recoverableAmount;
    }
    
    // Special redemption for recombination (bypasses maturity checks)
    function redeemForRecombination(uint256 _nytAmount, address _from, address _to) external whenNotPaused nonReentrant returns (uint256) {
        require(msg.sender == owner(), "Only orchestrator can call");
        require(_nytAmount > 0, "Cannot redeem 0");
        require(_nytAmount <= balanceOf(_from), "Insufficient balance");
        
        // NEW: Use direct asset backing instead of SY shares
        require(baseAsset.balanceOf(address(this)) >= _nytAmount, "Insufficient backing assets");
        
        // Burn NYT tokens from user
        _burn(_from, _nytAmount);
        
        // Transfer assets to orchestrator for recombination
        baseAsset.safeTransfer(_to, _nytAmount);
        
        // Update tracking
        userData[_from].principalAmount -= _nytAmount;
        totalPrincipalDeposited -= _nytAmount;
        
        if (userData[_from].principalAmount == 0) {
            protectedUsers[_from] = false;
            userData[_from].maturityTime = 0;
        }
        
        emit PrincipalRecovered(_to, _nytAmount);
        
        return _nytAmount;
    }
    
    // Liquidation protection logic
    function _shouldTriggerLiquidationProtection(address _user) internal view returns (bool) {
        if (!liquidationProtectionEnabled || !protectedUsers[_user]) {
            return false;
        }
        
        uint256 userPrincipal = userData[_user].principalAmount;
        if (userPrincipal == 0) return false;
        
        // Get current value based on backing assets
        uint256 userNYTBalance = balanceOf(_user);
        if (userNYTBalance == 0 || totalSupply() == 0) return false;
        
        uint256 currentValue = (baseAsset.balanceOf(address(this)) * userNYTBalance) / totalSupply();
        
        // Trigger protection if current value < 90% of original principal
        uint256 protectionThreshold = (userPrincipal * LIQUIDATION_THRESHOLD) / BASIS_POINTS;
        return currentValue < protectionThreshold;
    }
    
    // Emergency principal recovery (owner only)
    function emergencyRecover(address _user) external onlyOwner {
        require(protectedUsers[_user], "User not protected");
        require(_shouldTriggerLiquidationProtection(_user), "Protection not needed");
        
        uint256 userBalance = balanceOf(_user);
        uint256 userPrincipal = userData[_user].principalAmount;
        uint256 recoveryAmount = (userPrincipal * LIQUIDATION_THRESHOLD) / BASIS_POINTS;
        
        // NEW: Use direct asset backing for emergency recovery
        require(baseAsset.balanceOf(address(this)) >= recoveryAmount, "Insufficient backing for emergency recovery");
        
        // Burn NYT tokens
        _burn(_user, userBalance);
        
        // Transfer protected amount
        baseAsset.safeTransfer(_user, recoveryAmount);
        
        // Update tracking
        userData[_user].principalAmount = 0;
        userData[_user].maturityTime = 0;
        totalPrincipalDeposited -= userPrincipal;
        protectedUsers[_user] = false;
        
        emit LiquidationProtectionTriggered(_user, recoveryAmount);
    }
    
    // View functions
    function getUserInfo(address _user) external view returns (
        uint256 nytBalance,
        uint256 principal,
        uint256 maturity,
        bool protected,
        bool needsProtection,
        uint256 currentValue
    ) {
        uint256 userBalance = balanceOf(_user);
        uint256 userPrincipal = userData[_user].principalAmount;
        uint256 userMaturity = userData[_user].maturityTime;
        bool isProtected = protectedUsers[_user];
        bool needsLiquidationProtection = _shouldTriggerLiquidationProtection(_user);
        
        uint256 currentVal = 0;
        if (userBalance > 0 && totalSupply() > 0) {
            currentVal = (baseAsset.balanceOf(address(this)) * userBalance) / totalSupply();
        }
        
        return (userBalance, userPrincipal, userMaturity, isProtected, needsLiquidationProtection, currentVal);
    }
    
    function getProtectionStatus() external view returns (
        uint256 totalProtected,
        uint256 protectionThreshold,
        bool protectionEnabled
    ) {
        return (totalPrincipalDeposited, LIQUIDATION_THRESHOLD, liquidationProtectionEnabled);
    }
    
    // Owner functions
    function setLiquidationProtection(bool _enabled) external onlyOwner {
        liquidationProtectionEnabled = _enabled;
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    function emergencyWithdraw(address _to) external onlyOwner {
        // Emergency withdraw all base assets
        uint256 assetBalance = baseAsset.balanceOf(address(this));
        if (assetBalance > 0) {
            baseAsset.safeTransfer(_to, assetBalance);
        }
    }
    
    // Override transfers to maintain protection status - disabled for debugging
    // function _update(address from, address to, uint256 value) internal override {
    //     super._update(from, to, value);
    //     // Transfer logic disabled for debugging
    // }
}