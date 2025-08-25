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
 * @title PerpetualYieldToken
 * @dev Simplified PYT from Timeless - receives all yield from SY vault
 * Direct SY integration without complex Gate system
 */
contract PerpetualYieldToken is ERC20, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // Core state
    ISY public immutable syVault;
    IERC20 public immutable baseAsset;
    address public nytContract;
    
    // Yield tracking
    uint256 public totalYieldDistributed;
    uint256 public lastYieldPerToken;
    uint256 public accumulatedYieldPerToken;
    uint256 public lastTotalAssets; // Track last known total assets to prevent double-counting
    bool public yieldUpdateLock; // Prevent multiple yield updates in same transaction
    
    // User yield tracking
    mapping(address => uint256) public userYieldDebt;
    mapping(address => uint256) public claimableYield;
    
    // Auto-compounding state
    bool public autoCompoundEnabled = true;
    uint256 public compoundThreshold = 100e18; // 100 USDT minimum for auto-compound
    
    // Events
    event YieldDistributed(uint256 amount, uint256 yieldPerToken);
    event YieldClaimed(address indexed user, uint256 amount);
    event AutoCompound(uint256 amount, uint256 newShares);
    event NYTContractSet(address indexed nytContract);
    event AutoCompoundToggled(bool enabled);
    
    constructor(
        ISY _syVault,
        string memory _name,
        string memory _symbol,
        address _owner
    ) ERC20(_name, _symbol) Ownable(_owner) {
        syVault = _syVault;
        baseAsset = IERC20(_syVault.asset());
    }
    
    function setNYTContract(address _nytContract) external onlyOwner {
        require(_nytContract != address(0), "Invalid NYT contract");
        nytContract = _nytContract;
        emit NYTContractSet(_nytContract);
    }
    
    // Direct SY integration - mint PYT tokens backed by SY shares (called by orchestrator)
    function mint(uint256 _syShares, address _to) external whenNotPaused nonReentrant {
        require(_syShares > 0, "Cannot mint 0");
        require(msg.sender == owner(), "Only orchestrator can mint"); // Only orchestrator should call this
        
        // DON'T update yield during minting - this causes false yield accumulation
        // Yield should only be updated during explicit distribution calls
        
        // PYT contract should already have SY shares transferred to it by orchestrator
        // Just mint PYT tokens 1:1 with SY shares
        _mint(_to, _syShares);
        
        // Update total assets tracking after mint to establish new baseline
        uint256 currentSyShares = syVault.balanceOf(address(this));
        lastTotalAssets = syVault.convertToAssets(currentSyShares);
        
        // Update user's yield debt based on current accumulated yield
        userYieldDebt[_to] = accumulatedYieldPerToken * balanceOf(_to) / 1e18;
    }
    
    function burn(uint256 _pytAmount, address _to) external whenNotPaused nonReentrant returns (uint256) {
        require(_pytAmount > 0, "Cannot burn 0");
        
        address tokenHolder = msg.sender;
        
        // If called by orchestrator, it should use allowance mechanism
        if (msg.sender == owner()) {
            // Orchestrator needs approval to burn user tokens
            // Find the user who approved the orchestrator (should be _to for recombination)
            tokenHolder = _to;
        }
        
        require(_pytAmount <= balanceOf(tokenHolder), "Insufficient balance");
        
        // Update and claim pending yield for the token holder
        _updateYield();
        _claimYield(tokenHolder);
        
        // Burn PYT tokens from the token holder
        _burn(tokenHolder, _pytAmount);
        
        // For recombination, only transfer available SY shares
        // If there's not enough due to yield distribution, transfer what's available
        uint256 availableSyShares = syVault.balanceOf(address(this));
        uint256 sharesToTransfer = _pytAmount > availableSyShares ? availableSyShares : _pytAmount;
        
        if (sharesToTransfer > 0) {
            syVault.transfer(_to, sharesToTransfer);
        }
        
        // Update yield debt for the token holder
        userYieldDebt[tokenHolder] = accumulatedYieldPerToken * balanceOf(tokenHolder) / 1e18;
        
        return sharesToTransfer;
    }
    
    function burnFrom(address _from, uint256 _pytAmount, address _to) external whenNotPaused nonReentrant returns (uint256) {
        require(_pytAmount > 0, "Cannot burn 0");
        require(_pytAmount <= balanceOf(_from), "Insufficient balance");
        require(msg.sender == owner(), "Only orchestrator can burnFrom");
        
        // Update and claim pending yield for the token holder
        _updateYield();
        _claimYield(_from);
        
        // Burn PYT tokens from the user (orchestrator needs approval)
        _burn(_from, _pytAmount);
        
        // For recombination, only transfer available SY shares
        // If there's not enough due to yield distribution, transfer what's available
        uint256 availableSyShares = syVault.balanceOf(address(this));
        uint256 sharesToTransfer = _pytAmount > availableSyShares ? availableSyShares : _pytAmount;
        
        if (sharesToTransfer > 0) {
            syVault.transfer(_to, sharesToTransfer);
        }
        
        // Update yield debt for the token holder
        userYieldDebt[_from] = accumulatedYieldPerToken * balanceOf(_from) / 1e18;
        
        return sharesToTransfer;
    }
    
    // Yield distribution logic
    function distributeYield() external whenNotPaused {
        // _updateYield already handles yield detection and accumulation
        // Just call it to update the yield tracking
        _updateYield();
        
        // Auto-compounding is handled within _updateYield based on yield amount
        // No additional logic needed here since _updateYield already calls _distributeYieldToPYTHolders or _autoCompound
    }
    
    function _updateYield() internal {
        // Prevent multiple yield updates in same transaction
        if (yieldUpdateLock) return;
        yieldUpdateLock = true;
        
        uint256 currentTotalSupply = totalSupply();
        if (currentTotalSupply == 0) {
            yieldUpdateLock = false;
            return;
        }
        
        uint256 currentSyShares = syVault.balanceOf(address(this));
        uint256 currentAssetValue = syVault.convertToAssets(currentSyShares);
        
        // Only track new yield since last update
        if (currentAssetValue > lastTotalAssets) {
            uint256 newYield = currentAssetValue - lastTotalAssets;
            
            // Only track yield that can actually be distributed
            if (newYield > 0) {
                // Decide between auto-compound and distribution
                if (autoCompoundEnabled && newYield >= compoundThreshold) {
                    _autoCompound(newYield);
                } else {
                    uint256 yieldPerToken = (newYield * 1e18) / currentTotalSupply;
                    
                    accumulatedYieldPerToken += yieldPerToken;
                    lastYieldPerToken = yieldPerToken;
                    
                    emit YieldDistributed(newYield, yieldPerToken);
                }
                
                // Update tracking to current value
                lastTotalAssets = currentAssetValue;
            }
        }
        
        yieldUpdateLock = false;
    }
    
    
    function _autoCompound(uint256 _yieldAmount) internal {
        // Keep yield in SY vault for auto-compounding
        // This increases the value of existing PYT tokens instead of distributing
        uint256 compoundValue = _yieldAmount;
        
        emit AutoCompound(compoundValue, totalSupply());
    }
    
    // Claim accumulated yield
    function claimYield() external whenNotPaused nonReentrant {
        _updateYield();
        _claimYield(msg.sender);
    }
    
    function _claimYield(address _user) internal {
        uint256 userBalance = balanceOf(_user);
        if (userBalance == 0) return;
        
        uint256 accumulatedYield = (accumulatedYieldPerToken * userBalance) / 1e18;
        uint256 userDebt = userYieldDebt[_user];
        
        if (accumulatedYield > userDebt) {
            uint256 claimable = accumulatedYield - userDebt;
            claimableYield[_user] += claimable;
            userYieldDebt[_user] = accumulatedYield;
            
            if (claimableYield[_user] > 0) {
                uint256 toClaim = claimableYield[_user];
                
                // Check how much base assets we currently have
                uint256 availableAssets = baseAsset.balanceOf(address(this));
                
                // If we don't have enough base assets, withdraw from SY vault
                if (availableAssets < toClaim) {
                    uint256 neededAssets = toClaim - availableAssets;
                    
                    // Calculate how many SY shares we need to withdraw to get needed assets
                    uint256 sySharesNeeded = syVault.convertToShares(neededAssets);
                    uint256 availableSyShares = syVault.balanceOf(address(this));
                    
                    // Only withdraw what we actually have available
                    uint256 sharesToWithdraw = sySharesNeeded > availableSyShares ? availableSyShares : sySharesNeeded;
                    
                    if (sharesToWithdraw > 0) {
                        syVault.withdraw(sharesToWithdraw, address(this), address(this));
                        totalYieldDistributed += syVault.convertToAssets(sharesToWithdraw);
                    }
                }
                
                // Update available assets after potential withdrawal
                availableAssets = baseAsset.balanceOf(address(this));
                
                // Only claim what's actually available
                if (toClaim > availableAssets) {
                    toClaim = availableAssets;
                    claimableYield[_user] = claimableYield[_user] - availableAssets;
                } else {
                    claimableYield[_user] = 0;
                }
                
                if (toClaim > 0) {
                    baseAsset.safeTransfer(_user, toClaim);
                    emit YieldClaimed(_user, toClaim);
                }
            }
        }
    }
    
    // View functions
    function pendingYield(address _user) external view returns (uint256) {
        uint256 userBalance = balanceOf(_user);
        if (userBalance == 0) return claimableYield[_user];
        
        // Calculate based on already tracked yield (don't double count)
        uint256 accumulatedYield = (accumulatedYieldPerToken * userBalance) / 1e18;
        uint256 userDebt = userYieldDebt[_user];
        
        return claimableYield[_user] + (accumulatedYield > userDebt ? accumulatedYield - userDebt : 0);
    }
    
    function getYieldInfo() external view returns (
        uint256 totalDistributed,
        uint256 currentYieldRate,
        uint256 pytTotalSupply,
        uint256 syBalance
    ) {
        uint256 currentSyShares = syVault.balanceOf(address(this));
        uint256 currentAssetValue = syVault.convertToAssets(currentSyShares);
        
        return (
            totalYieldDistributed,
            lastYieldPerToken,
            totalSupply(),
            currentAssetValue // Return asset value, not SY share count
        );
    }
    
    function getCurrentAPY() external view returns (uint256) {
        return syVault.getCurrentAPY();
    }
    
    // Owner functions
    function setAutoCompound(bool _enabled) external onlyOwner {
        autoCompoundEnabled = _enabled;
        emit AutoCompoundToggled(_enabled);
    }
    
    function setCompoundThreshold(uint256 _threshold) external onlyOwner {
        compoundThreshold = _threshold;
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    function emergencyWithdraw(address _to) external onlyOwner {
        // Emergency withdraw all SY shares
        uint256 syBalance = syVault.balanceOf(address(this));
        if (syBalance > 0) {
            syVault.transfer(_to, syBalance);
        }
        
        // Emergency withdraw all base assets
        uint256 assetBalance = baseAsset.balanceOf(address(this));
        if (assetBalance > 0) {
            baseAsset.safeTransfer(_to, assetBalance);
        }
    }
    
    // Override transfers to update yield tracking
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0)) {
            _updateYield();
            _claimYield(from);
        }
        
        super._update(from, to, value);
        
        if (to != address(0)) {
            userYieldDebt[to] = accumulatedYieldPerToken * balanceOf(to) / 1e18;
        }
    }
}