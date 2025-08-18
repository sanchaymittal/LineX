// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title TestUSDT
 * @dev Test USDT token for LineX demo on Kaia testnet
 * Matches the specifications of USDT on Kaia mainnet
 */
contract TestUSDT is ERC20, ERC20Permit, Ownable, Pausable {
    // USDT uses 6 decimals (same as on other chains)
    uint8 private constant DECIMALS = 6;
    
    // Initial supply: 1 million USDT for testing
    uint256 private constant INITIAL_SUPPLY = 1_000_000 * 10**DECIMALS;
    
    // Faucet configuration
    uint256 public constant FAUCET_AMOUNT = 100 * 10**DECIMALS; // 100 USDT
    uint256 public constant FAUCET_COOLDOWN = 0; // Disabled for testing
    
    // Track faucet usage
    mapping(address => uint256) public lastFaucetClaim;
    
    // Events
    event Minted(address indexed to, uint256 amount);
    event FaucetClaimed(address indexed user, uint256 amount);
    event EmergencyMint(address indexed to, uint256 amount);

    /**
     * @dev Constructor initializes the token with fixed parameters
     * @param initialOwner Address that will own the contract
     */
    constructor(address initialOwner) 
        ERC20("Test USDT", "USDT") 
        ERC20Permit("Test USDT")
        Ownable(initialOwner) 
    {
        // Mint initial supply to owner
        _mint(initialOwner, INITIAL_SUPPLY);
        emit Minted(initialOwner, INITIAL_SUPPLY);
    }

    /**
     * @dev Returns the number of decimals used by the token
     * @return Number of decimals (6 for USDT)
     */
    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /**
     * @dev Mint tokens to a specific address (owner only)
     * @param to Address to mint tokens to
     * @param amount Amount to mint (in token units, not wei)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
        emit Minted(to, amount);
    }

    /**
     * @dev Emergency mint function for demo purposes (owner only)
     * @param to Address to mint to
     * @param usdtAmount Amount in USDT units (will be converted to proper decimals)
     */
    function emergencyMint(address to, uint256 usdtAmount) external onlyOwner {
        uint256 amount = usdtAmount * 10**DECIMALS;
        _mint(to, amount);
        emit EmergencyMint(to, amount);
    }

    /**
     * @dev Faucet function for demo purposes
     * Users can claim free USDT for testing with 24h cooldown
     */
    function faucet() external whenNotPaused {
        require(
            lastFaucetClaim[msg.sender] == 0 || 
            block.timestamp >= lastFaucetClaim[msg.sender] + FAUCET_COOLDOWN,
            "TestUSDT: Faucet cooldown active"
        );
        
        lastFaucetClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        
        emit FaucetClaimed(msg.sender, FAUCET_AMOUNT);
    }

    /**
     * @dev Gasless faucet function for demo purposes
     * Allows a user to claim USDT through a gas payer
     * @param user The address to mint tokens to
     */
    function faucetFor(address user) external whenNotPaused {
        require(user != address(0), "TestUSDT: Invalid user address");
        require(
            lastFaucetClaim[user] == 0 || 
            block.timestamp >= lastFaucetClaim[user] + FAUCET_COOLDOWN,
            "TestUSDT: Faucet cooldown active"
        );
        
        lastFaucetClaim[user] = block.timestamp;
        _mint(user, FAUCET_AMOUNT);
        
        emit FaucetClaimed(user, FAUCET_AMOUNT);
    }

    /**
     * @dev Check if an address can use the faucet
     * @param user Address to check
     * @return canClaim Whether user can claim from faucet
     * @return timeLeft Seconds until next claim is available
     */
    function canUseFaucet(address user) external view returns (bool canClaim, uint256 timeLeft) {
        // First time users can always claim
        if (lastFaucetClaim[user] == 0) {
            return (true, 0);
        }
        
        uint256 nextClaimTime = lastFaucetClaim[user] + FAUCET_COOLDOWN;
        
        if (block.timestamp >= nextClaimTime) {
            return (true, 0);
        } else {
            return (false, nextClaimTime - block.timestamp);
        }
    }

    /**
     * @dev Get formatted balance in USDT units (not wei)
     * @param account Address to check
     * @return balance Balance in USDT units
     */
    function getFormattedBalance(address account) external view returns (uint256) {
        return balanceOf(account) / 10**DECIMALS;
    }

    /**
     * @dev Get total supply in USDT units (not wei)
     * @return supply Total supply in USDT units
     */
    function getFormattedTotalSupply() external view returns (uint256) {
        return totalSupply() / 10**DECIMALS;
    }

    /**
     * @dev Pause contract (owner only)
     * Prevents faucet usage and transfers when paused
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause contract (owner only)
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Override transfer to add pause functionality
     */
    function transfer(address to, uint256 amount) 
        public 
        override 
        whenNotPaused 
        returns (bool) 
    {
        return super.transfer(to, amount);
    }

    /**
     * @dev Override transferFrom to add pause functionality
     */
    function transferFrom(address from, address to, uint256 amount)
        public
        override
        whenNotPaused
        returns (bool)
    {
        return super.transferFrom(from, to, amount);
    }

    /**
     * @dev Burn tokens from caller's balance
     * @param amount Amount to burn
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    /**
     * @dev Burn tokens from specific address (requires allowance)
     * @param from Address to burn from
     * @param amount Amount to burn
     */
    function burnFrom(address from, uint256 amount) external {
        _spendAllowance(from, msg.sender, amount);
        _burn(from, amount);
    }
}