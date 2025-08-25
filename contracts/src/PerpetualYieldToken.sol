// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PerpetualYieldToken (PYT)
 * @dev Token representing the yield rights from SY vault shares
 * @notice PYT holders can claim accumulated yield from the underlying SY vault
 */
contract PerpetualYieldToken is ERC20, ERC20Permit, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev The SY vault contract that generates yield
    address public immutable syVault;
    
    /// @dev The underlying asset (USDT)
    address public immutable asset;
    
    /// @dev Total yield accumulated and distributed
    uint256 public totalYieldDistributed;
    
    /// @dev Yield per share (scaled by 1e18)
    uint256 public yieldPerShare;
    
    /// @dev User's claimed yield per share (user => claimed amount)
    mapping(address => uint256) public claimedYieldPerShare;
    
    /// @dev Last yield distribution timestamp
    uint256 public lastYieldDistribution;
    
    /// @dev Minimum time between yield distributions (24 hours)
    uint256 public constant YIELD_DISTRIBUTION_INTERVAL = 1 days;
    
    /// @dev Events
    event YieldDistributed(uint256 yieldAmount, uint256 newYieldPerShare, uint256 timestamp);
    event YieldClaimed(address indexed user, uint256 yieldAmount, uint256 timestamp);
    event PYTMinted(address indexed to, uint256 amount, uint256 timestamp);
    event PYTBurned(address indexed from, uint256 amount, uint256 timestamp);

    /// @dev Errors
    error InvalidAddress();
    error InsufficientYield();
    error TooEarlyForDistribution();
    error OnlyYieldOrchestrator();

    /// @dev Modifier to restrict access to yield orchestrator
    modifier onlyYieldOrchestrator() {
        if (msg.sender != owner()) revert OnlyYieldOrchestrator();
        _;
    }

    /**
     * @dev Constructor
     * @param _syVault Address of the SY vault
     * @param _asset Address of the underlying asset (USDT)
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _initialOwner Initial owner (yield orchestrator)
     */
    constructor(
        address _syVault,
        address _asset,
        string memory _name,
        string memory _symbol,
        address _initialOwner
    ) 
        ERC20(_name, _symbol) 
        ERC20Permit(_name)
        Ownable(_initialOwner)
    {
        if (_syVault == address(0) || _asset == address(0)) revert InvalidAddress();
        
        syVault = _syVault;
        asset = _asset;
        lastYieldDistribution = block.timestamp;
    }

    /**
     * @dev Mint PYT tokens (only yield orchestrator)
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyYieldOrchestrator nonReentrant {
        // Update pending yield for existing holders before minting
        if (totalSupply() > 0) {
            _updateYieldAccounting(to);
        }
        
        _mint(to, amount);
        
        emit PYTMinted(to, amount, block.timestamp);
    }

    /**
     * @dev Burn PYT tokens (only yield orchestrator)
     * @param from Address to burn tokens from
     * @param amount Amount of tokens to burn
     */
    function burn(address from, uint256 amount) external onlyYieldOrchestrator nonReentrant {
        // Claim pending yield before burning
        _claimPendingYield(from);
        
        _burn(from, amount);
        
        emit PYTBurned(from, amount, block.timestamp);
    }

    /**
     * @dev Distribute yield to all PYT holders
     * @param yieldAmount Amount of yield to distribute
     */
    function distributeYield(uint256 yieldAmount) external onlyYieldOrchestrator nonReentrant {
        if (block.timestamp < lastYieldDistribution + YIELD_DISTRIBUTION_INTERVAL) {
            revert TooEarlyForDistribution();
        }
        
        if (yieldAmount == 0 || totalSupply() == 0) {
            return;
        }

        // Transfer yield from orchestrator to this contract
        IERC20(asset).safeTransferFrom(msg.sender, address(this), yieldAmount);
        
        // Update yield per share
        uint256 additionalYieldPerShare = (yieldAmount * 1e18) / totalSupply();
        yieldPerShare += additionalYieldPerShare;
        
        totalYieldDistributed += yieldAmount;
        lastYieldDistribution = block.timestamp;
        
        emit YieldDistributed(yieldAmount, yieldPerShare, block.timestamp);
    }

    /**
     * @dev Claim accumulated yield for the caller
     * @return claimedAmount Amount of yield claimed
     */
    function claimYield() external nonReentrant returns (uint256 claimedAmount) {
        claimedAmount = _claimPendingYield(msg.sender);
        
        if (claimedAmount > 0) {
            emit YieldClaimed(msg.sender, claimedAmount, block.timestamp);
        }
    }

    /**
     * @dev Get pending yield for a user
     * @param user Address of the user
     * @return pendingYield Amount of pending yield
     */
    function getPendingYield(address user) external view returns (uint256 pendingYield) {
        if (balanceOf(user) == 0) return 0;
        
        uint256 userYieldPerShare = claimedYieldPerShare[user];
        if (yieldPerShare > userYieldPerShare) {
            uint256 yieldPerShareDiff = yieldPerShare - userYieldPerShare;
            pendingYield = (balanceOf(user) * yieldPerShareDiff) / 1e18;
        }
    }

    /**
     * @dev Get yield statistics
     * @return totalDistributed Total yield distributed historically
     * @return currentYieldPerShare Current yield per share
     * @return lastDistribution Last yield distribution timestamp
     * @return nextDistribution Next possible distribution timestamp
     */
    function getYieldStats() external view returns (
        uint256 totalDistributed,
        uint256 currentYieldPerShare,
        uint256 lastDistribution,
        uint256 nextDistribution
    ) {
        totalDistributed = totalYieldDistributed;
        currentYieldPerShare = yieldPerShare;
        lastDistribution = lastYieldDistribution;
        nextDistribution = lastYieldDistribution + YIELD_DISTRIBUTION_INTERVAL;
    }

    /**
     * @dev Override transfer to update yield accounting
     */
    function transfer(address to, uint256 amount) public override returns (bool) {
        _updateYieldAccounting(msg.sender);
        _updateYieldAccounting(to);
        
        return super.transfer(to, amount);
    }

    /**
     * @dev Override transferFrom to update yield accounting
     */
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        _updateYieldAccounting(from);
        _updateYieldAccounting(to);
        
        return super.transferFrom(from, to, amount);
    }

    /**
     * @dev Internal function to update yield accounting for a user
     * @param user Address of the user
     */
    function _updateYieldAccounting(address user) internal {
        if (balanceOf(user) > 0) {
            claimedYieldPerShare[user] = yieldPerShare;
        }
    }

    /**
     * @dev Internal function to claim pending yield for a user
     * @param user Address of the user
     * @return claimedAmount Amount of yield claimed
     */
    function _claimPendingYield(address user) internal returns (uint256 claimedAmount) {
        if (balanceOf(user) == 0) return 0;
        
        uint256 userYieldPerShare = claimedYieldPerShare[user];
        if (yieldPerShare > userYieldPerShare) {
            uint256 yieldPerShareDiff = yieldPerShare - userYieldPerShare;
            claimedAmount = (balanceOf(user) * yieldPerShareDiff) / 1e18;
            
            if (claimedAmount > 0) {
                claimedYieldPerShare[user] = yieldPerShare;
                IERC20(asset).safeTransfer(user, claimedAmount);
            }
        }
    }
}