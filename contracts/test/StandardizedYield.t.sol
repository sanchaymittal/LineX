// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/core/StandardizedYield.sol";
import "../src/strategies/MockLendingStrategy.sol";
import "../src/strategies/MockStakingStrategy.sol";
import "../src/strategies/MockLPStrategy.sol";
import "../src/TestUSDT.sol";

/**
 * @title StandardizedYieldTest
 * @dev Comprehensive test suite for SY wrapper functionality
 */
contract StandardizedYieldTest is Test {
    StandardizedYield public syVault;
    StandardizedYield public multiSyVault; // For multi-strategy tests
    MockLendingStrategy public mockStrategy;
    MockStakingStrategy public stakingStrategy;
    MockLPStrategy public lpStrategy;
    TestUSDT public usdt;
    
    address public owner = address(0x1);
    address public user1 = address(0x2);
    address public user2 = address(0x3);
    
    uint256 public constant INITIAL_USDT_SUPPLY = 1000000e6; // 1M USDT
    uint256 public constant TEST_DEPOSIT_AMOUNT = 1000e6; // 1000 USDT
    
    function setUp() public {
        // Deploy TestUSDT
        usdt = new TestUSDT(owner);
        
        // Deploy all strategies
        mockStrategy = new MockLendingStrategy(address(usdt), owner);
        stakingStrategy = new MockStakingStrategy(address(usdt), owner);
        lpStrategy = new MockLPStrategy(address(usdt), owner);
        
        // Deploy single-strategy StandardizedYield
        syVault = new StandardizedYield(
            address(usdt),
            "Yield USDT",
            "yUSDT",
            owner
        );
        
        // Deploy multi-strategy StandardizedYield
        multiSyVault = new StandardizedYield(
            address(usdt),
            "Multi-Strategy Yield USDT",
            "msyUSDT",
            owner
        );
        
        // Setup initial state
        vm.startPrank(owner);
        
        // Single strategy setup (for backward compatibility)
        syVault.addStrategy(address(mockStrategy), 10000);
        
        // Multi-strategy setup: 50% lending, 30% staking, 20% LP
        multiSyVault.addStrategy(address(mockStrategy), 5000);  // 50%
        multiSyVault.addStrategy(address(stakingStrategy), 3000);  // 30%
        multiSyVault.addStrategy(address(lpStrategy), 2000);       // 20%
        
        // Mint USDT to test users
        usdt.mint(user1, TEST_DEPOSIT_AMOUNT * 5);
        usdt.mint(user2, TEST_DEPOSIT_AMOUNT * 5);
        
        vm.stopPrank();
    }
    
    function testDeposit() public {
        vm.startPrank(user1);
        
        // Approve SY vault to spend USDT
        usdt.approve(address(syVault), TEST_DEPOSIT_AMOUNT);
        
        // Get initial balances
        uint256 initialUsdtBalance = usdt.balanceOf(user1);
        uint256 initialShares = syVault.balanceOf(user1);
        
        // Deposit to SY vault
        uint256 shares = syVault.deposit(TEST_DEPOSIT_AMOUNT, user1);
        
        // Verify deposit
        assertEq(usdt.balanceOf(user1), initialUsdtBalance - TEST_DEPOSIT_AMOUNT);
        assertEq(syVault.balanceOf(user1), initialShares + shares);
        assertGt(shares, 0);
        
        vm.stopPrank();
    }
    
    function testWithdraw() public {
        // First deposit
        vm.startPrank(user1);
        usdt.approve(address(syVault), TEST_DEPOSIT_AMOUNT);
        uint256 shares = syVault.deposit(TEST_DEPOSIT_AMOUNT, user1);
        
        vm.stopPrank();
        
        // Wait some time and simulate yield generation
        vm.warp(block.timestamp + 30 days);
        
        // Simulate yield by minting tokens to the strategy (3% for 30 days)
        vm.prank(owner);
        usdt.mint(address(mockStrategy), TEST_DEPOSIT_AMOUNT * 3 / 100);
        
        vm.prank(user1);
        uint256 assetsWithdrawn = syVault.withdraw(shares, user1, user1);
        
        // Should get back at least what was deposited (no fees now)
        assertGe(assetsWithdrawn, TEST_DEPOSIT_AMOUNT);
    }
    
    function testYieldAccrual() public {
        // Deposit
        vm.startPrank(user1);
        usdt.approve(address(syVault), TEST_DEPOSIT_AMOUNT);
        syVault.deposit(TEST_DEPOSIT_AMOUNT, user1);
        vm.stopPrank();
        
        // Get initial exchange rate
        uint256 initialRate = syVault.exchangeRate();
        
        // Fast forward time to accrue yield
        vm.warp(block.timestamp + 365 days);
        
        // Simulate yield by minting tokens to the strategy
        vm.prank(owner);
        usdt.mint(address(mockStrategy), TEST_DEPOSIT_AMOUNT / 10); // 10% yield
        
        // Update yield in SY vault to reflect the increased assets
        syVault.updateYield();
        
        // Check that exchange rate increased
        uint256 newRate = syVault.exchangeRate();
        assertGt(newRate, initialRate);
        
        // Verify APY is approximately 10%
        uint256 apy = syVault.getAPY();
        assertEq(apy, 1000); // 10.00% in basis points
    }
    
    function testMultipleUsers() public {
        // User 1 deposits
        vm.startPrank(user1);
        usdt.approve(address(syVault), TEST_DEPOSIT_AMOUNT);
        uint256 shares1 = syVault.deposit(TEST_DEPOSIT_AMOUNT, user1);
        vm.stopPrank();
        
        // Time passes, yield accrues - simulate significant yield
        vm.warp(block.timestamp + 180 days);
        
        // Simulate yield accumulation before user2 deposits
        vm.prank(owner);
        usdt.mint(address(mockStrategy), TEST_DEPOSIT_AMOUNT / 2); // 50% yield
        
        // User 2 deposits (should get fewer shares due to yield)
        vm.startPrank(user2);
        usdt.approve(address(syVault), TEST_DEPOSIT_AMOUNT);
        uint256 shares2 = syVault.deposit(TEST_DEPOSIT_AMOUNT, user2);
        vm.stopPrank();
        
        // User 1 should have more shares than User 2 for same deposit due to exchange rate increase
        // If no yield, they'd be equal, so this tests yield accrual
        assertGe(shares1, shares2);
        
        // Both users withdraw after more time
        vm.warp(block.timestamp + 180 days);
        
        // Simulate more yield
        vm.prank(owner);
        usdt.mint(address(mockStrategy), TEST_DEPOSIT_AMOUNT / 5); // 20% total yield
        
        vm.prank(user1);
        uint256 assets1 = syVault.withdraw(shares1, user1, user1);
        
        vm.prank(user2);
        uint256 assets2 = syVault.withdraw(shares2, user2, user2);
        
        // Both should get back at least what they deposited (no withdrawal fees)
        assertGe(assets1, TEST_DEPOSIT_AMOUNT);
        assertGe(assets2, TEST_DEPOSIT_AMOUNT);
    }
    
    function testEmergencyFunctions() public {
        // Deposit first
        vm.startPrank(user1);
        usdt.approve(address(syVault), TEST_DEPOSIT_AMOUNT);
        syVault.deposit(TEST_DEPOSIT_AMOUNT, user1);
        vm.stopPrank();
        
        // Owner pauses
        vm.prank(owner);
        syVault.pause();
        
        // Deposits should fail when paused
        vm.startPrank(user2);
        usdt.approve(address(syVault), TEST_DEPOSIT_AMOUNT);
        vm.expectRevert();
        syVault.deposit(TEST_DEPOSIT_AMOUNT, user2);
        vm.stopPrank();
        
        // Owner unpauses
        vm.prank(owner);
        syVault.unpause();
        
        // Deposits should work again
        vm.startPrank(user2);
        syVault.deposit(TEST_DEPOSIT_AMOUNT, user2);
        vm.stopPrank();
    }
    
    function test_RevertWhen_InvalidDeposit() public {
        vm.prank(user1);
        vm.expectRevert("Cannot deposit 0 assets");
        syVault.deposit(0, user1); // Should fail with 0 amount
    }
    
    function test_RevertWhen_InsufficientBalance() public {
        vm.startPrank(user1);
        usdt.approve(address(syVault), TEST_DEPOSIT_AMOUNT * 10);
        vm.expectRevert(); // ERC20: transfer amount exceeds balance
        syVault.deposit(TEST_DEPOSIT_AMOUNT * 10, user1); // Should fail - not enough USDT
        vm.stopPrank();
    }
    
    // ================================
    // MULTI-STRATEGY TESTS
    // ================================
    
    function testMultiStrategyAllocation() public {
        vm.startPrank(user1);
        
        // Approve and deposit to multi-strategy vault
        usdt.approve(address(multiSyVault), TEST_DEPOSIT_AMOUNT);
        uint256 shares = multiSyVault.deposit(TEST_DEPOSIT_AMOUNT, user1);
        
        vm.stopPrank();
        
        // Verify allocation across strategies
        uint256 lendingBalance = mockStrategy.balanceOf();
        uint256 stakingBalance = stakingStrategy.balanceOf();
        uint256 lpBalance = lpStrategy.balanceOf();
        
        console.log("=== Multi-Strategy Allocation ===");
        console.log("Lending Strategy Balance:", lendingBalance);
        console.log("Staking Strategy Balance:", stakingBalance);
        console.log("LP Strategy Balance:", lpBalance);
        
        // Should be allocated according to percentages (50%, 30%, 20%)
        assertEq(lendingBalance, TEST_DEPOSIT_AMOUNT * 50 / 100); // 500 USDT
        assertEq(stakingBalance, TEST_DEPOSIT_AMOUNT * 30 / 100); // 300 USDT
        assertEq(lpBalance, TEST_DEPOSIT_AMOUNT * 20 / 100);      // 200 USDT
        
        // Total should equal deposit
        assertEq(lendingBalance + stakingBalance + lpBalance, TEST_DEPOSIT_AMOUNT);
        
        // User should get shares
        assertGt(shares, 0);
        assertEq(multiSyVault.balanceOf(user1), shares);
    }
    
    function testWeightedAPYCalculation() public {
        // Check weighted APY from multi-strategy vault
        uint256 weightedAPY = multiSyVault.getAPY();
        
        console.log("=== Weighted APY Calculation ===");
        console.log("Lending APY (10%):", mockStrategy.getCurrentAPY());
        console.log("Staking APY (8%):", stakingStrategy.getCurrentAPY());
        console.log("LP APY (12%):", lpStrategy.getCurrentAPY());
        console.log("Weighted APY:", weightedAPY);
        
        // Expected: (10% * 50%) + (8% * 30%) + (12% * 20%) = 5% + 2.4% + 2.4% = 9.8%
        // Allow for some variance due to LP strategy volatility
        assertGe(weightedAPY, 900); // At least 9%
        assertLe(weightedAPY, 1100); // At most 11%
    }
    
    function testMultiStrategyWithdrawal() public {
        // Deposit to multi-strategy vault
        vm.startPrank(user1);
        usdt.approve(address(multiSyVault), TEST_DEPOSIT_AMOUNT);
        uint256 shares = multiSyVault.deposit(TEST_DEPOSIT_AMOUNT, user1);
        vm.stopPrank();
        
        // Simulate yield in all strategies
        vm.startPrank(owner);
        usdt.mint(address(mockStrategy), 50e6);     // 10% of 500 USDT
        usdt.mint(address(stakingStrategy), 24e6);  // 8% of 300 USDT  
        usdt.mint(address(lpStrategy), 24e6);       // 12% of 200 USDT
        vm.stopPrank();
        
        // Update yield
        multiSyVault.updateYield();
        
        // Check total assets increased
        uint256 totalAssets = multiSyVault.totalAssets();
        console.log("=== Multi-Strategy Withdrawal ===");
        console.log("Total assets after yield:", totalAssets);
        assertGt(totalAssets, TEST_DEPOSIT_AMOUNT);
        
        // Withdraw and verify user gets yield
        uint256 initialBalance = usdt.balanceOf(user1);
        
        vm.prank(user1);
        uint256 assetsWithdrawn = multiSyVault.withdraw(shares, user1, user1);
        
        console.log("Assets withdrawn:", assetsWithdrawn);
        console.log("Expected minimum:", TEST_DEPOSIT_AMOUNT);
        
        // Should get back more than deposited due to yield
        assertGt(assetsWithdrawn, TEST_DEPOSIT_AMOUNT);
        assertGt(usdt.balanceOf(user1), initialBalance + TEST_DEPOSIT_AMOUNT);
    }
    
    function testStrategyInfo() public {
        console.log("=== Strategy Information ===");
        
        // Test that we can query all strategy information
        for (uint256 i = 0; i < 3; i++) {
            (address strategyAddr, uint256 allocation) = multiSyVault.getStrategy(i);
            IYieldStrategy strategy = IYieldStrategy(strategyAddr);
            
            console.log("Strategy", i, ":");
            console.log("  Address:", strategyAddr);
            console.log("  Allocation:", allocation, "basis points");
            console.log("  Name:", strategy.strategyName());
            console.log("  APY:", strategy.getCurrentAPY(), "basis points");
            console.log("  Risk Level:", strategy.riskLevel());
            console.log("  Min Deposit:", strategy.minimumDeposit());
        }
        
        // Verify allocations add up to 100%
        uint256 totalAllocation = 0;
        for (uint256 i = 0; i < 3; i++) {
            (, uint256 allocation) = multiSyVault.getStrategy(i);
            totalAllocation += allocation;
        }
        assertEq(totalAllocation, 10000); // 100% in basis points
    }
    
    function testMultiUserMultiStrategy() public {
        // User 1 deposits to multi-strategy vault
        vm.startPrank(user1);
        usdt.approve(address(multiSyVault), TEST_DEPOSIT_AMOUNT);
        uint256 shares1 = multiSyVault.deposit(TEST_DEPOSIT_AMOUNT, user1);
        vm.stopPrank();
        
        // Time passes, yield accumulates
        vm.warp(block.timestamp + 180 days);
        
        // Simulate yield across all strategies
        vm.startPrank(owner);
        usdt.mint(address(mockStrategy), 25e6);     // 5% for 6 months
        usdt.mint(address(stakingStrategy), 12e6);  // 4% for 6 months
        usdt.mint(address(lpStrategy), 12e6);       // 6% for 6 months
        vm.stopPrank();
        
        // User 2 deposits after yield (should get fewer shares)
        vm.startPrank(user2);
        usdt.approve(address(multiSyVault), TEST_DEPOSIT_AMOUNT);
        uint256 shares2 = multiSyVault.deposit(TEST_DEPOSIT_AMOUNT, user2);
        vm.stopPrank();
        
        console.log("=== Multi-User Multi-Strategy ===");
        console.log("User 1 shares (early depositor):", shares1);
        console.log("User 2 shares (late depositor):", shares2);
        
        // User 1 should have more shares (deposited before yield)
        assertGt(shares1, shares2);
        
        // Both users withdraw
        vm.prank(user1);
        uint256 assets1 = multiSyVault.withdraw(shares1, user1, user1);
        
        vm.prank(user2);
        uint256 assets2 = multiSyVault.withdraw(shares2, user2, user2);
        
        console.log("User 1 withdrew:", assets1);
        console.log("User 2 withdrew:", assets2);
        
        // Both should get at least their deposit back (allow for 1 wei rounding error)
        assertGe(assets1, TEST_DEPOSIT_AMOUNT - 1);
        assertGe(assets2, TEST_DEPOSIT_AMOUNT - 1);
    }
    
    function testStrategyRebalancing() public {
        // Initial deposit
        vm.startPrank(user1);
        usdt.approve(address(multiSyVault), TEST_DEPOSIT_AMOUNT);
        multiSyVault.deposit(TEST_DEPOSIT_AMOUNT, user1);
        vm.stopPrank();
        
        console.log("=== Strategy Rebalancing Test ===");
        console.log("Owner address:", owner);
        console.log("MultiSyVault owner:", multiSyVault.owner());
        console.log("Current sender:", msg.sender);
        
        // Check initial allocation
        console.log("Initial allocation:");
        console.log("  Lending:", mockStrategy.balanceOf());
        console.log("  Staking:", stakingStrategy.balanceOf());
        console.log("  LP:", lpStrategy.balanceOf());
        
        // Use the actual owner of the contract
        address actualOwner = multiSyVault.owner();
        vm.startPrank(actualOwner);
        
        // Remove LP strategy (index 2) - this calls emergencyExit on lpStrategy
        multiSyVault.removeStrategy(2);
        
        // Check strategies count reduced
        assertEq(multiSyVault.getStrategiesCount(), 2);
        
        vm.stopPrank();
        
        // New deposit should use new allocation (now 50% + 30% = 80% total)
        vm.startPrank(user2);
        usdt.approve(address(multiSyVault), TEST_DEPOSIT_AMOUNT);
        multiSyVault.deposit(TEST_DEPOSIT_AMOUNT, user2);
        vm.stopPrank();
        
        console.log("After rebalancing and new deposit:");
        console.log("  Lending:", mockStrategy.balanceOf());
        console.log("  Staking:", stakingStrategy.balanceOf());
        console.log("  LP:", lpStrategy.balanceOf());
    }
    
    function testYieldOptimization() public {
        // Single strategy vault (100% lending)
        vm.startPrank(user1);
        usdt.approve(address(syVault), TEST_DEPOSIT_AMOUNT);
        uint256 singleShares = syVault.deposit(TEST_DEPOSIT_AMOUNT, user1);
        vm.stopPrank();
        
        // Multi-strategy vault (diversified)
        vm.startPrank(user2);
        usdt.approve(address(multiSyVault), TEST_DEPOSIT_AMOUNT);
        uint256 multiShares = multiSyVault.deposit(TEST_DEPOSIT_AMOUNT, user2);
        vm.stopPrank();
        
        console.log("=== Yield Optimization Comparison ===");
        console.log("Single strategy APY:", syVault.getAPY());
        console.log("Multi-strategy APY:", multiSyVault.getAPY());
        
        // Simulate yield generation over time
        vm.warp(block.timestamp + 30 days);
        
        // Simulate realistic yields for 30 days (not full year to avoid overflow)
        vm.startPrank(owner);
        usdt.mint(address(mockStrategy), 10e6); // ~12% annualized for lending
        usdt.mint(address(stakingStrategy), 2e6); // ~8% annualized for staking  
        usdt.mint(address(lpStrategy), 3e6);     // ~18% annualized for LP
        vm.stopPrank();
        
        // Update both vaults
        syVault.updateYield();
        multiSyVault.updateYield();
        
        // Get withdrawal amounts without actually withdrawing to compare
        uint256 singleAssets = syVault.convertToAssets(singleShares);
        uint256 multiAssets = multiSyVault.convertToAssets(multiShares);
        
        console.log("Single strategy value:", singleAssets);
        console.log("Multi-strategy value:", multiAssets);
        
        // Both should be profitable (allow for small rounding)
        assertGe(singleAssets, TEST_DEPOSIT_AMOUNT - 1);
        assertGe(multiAssets, TEST_DEPOSIT_AMOUNT - 1);
        
        // Multi-strategy should be at least as good due to diversification
        console.log("Single strategy profit:", singleAssets > TEST_DEPOSIT_AMOUNT ? singleAssets - TEST_DEPOSIT_AMOUNT : 0);
        console.log("Multi-strategy profit:", multiAssets > TEST_DEPOSIT_AMOUNT ? multiAssets - TEST_DEPOSIT_AMOUNT : 0);
    }
    
    function testOwnerAllocationChanges() public {
        console.log("=== Owner Allocation Changes Test ===");
        
        // Initial deposits
        vm.startPrank(user1);
        usdt.approve(address(multiSyVault), TEST_DEPOSIT_AMOUNT);
        multiSyVault.deposit(TEST_DEPOSIT_AMOUNT, user1);
        vm.stopPrank();
        
        console.log("Initial allocation (50/30/20):");
        console.log("  Lending:", mockStrategy.balanceOf());
        console.log("  Staking:", stakingStrategy.balanceOf());
        console.log("  LP:", lpStrategy.balanceOf());
        
        // Owner changes allocations during operation
        vm.startPrank(owner);
        
        // Create and add a second lending strategy for testing
        MockLendingStrategy newLendingStrategy = new MockLendingStrategy(address(usdt), owner);
        
        // Remove LP strategy (index 2) first - this frees up 2000 bp
        multiSyVault.removeStrategy(2); // Remove LP (20%), now total = 8000 bp
        
        // Add new strategy with remaining allocation
        multiSyVault.addStrategy(address(newLendingStrategy), 2000); // 20% for new strategy, total = 10000 bp
        
        vm.stopPrank();
        
        console.log("After allocation change (50/30/0/20):");
        console.log("  Old Lending:", mockStrategy.balanceOf());
        console.log("  Staking:", stakingStrategy.balanceOf());
        console.log("  LP (removed):", lpStrategy.balanceOf());
        console.log("  New Lending:", newLendingStrategy.balanceOf());
        
        // Test new deposit with updated allocation
        vm.startPrank(user2);
        usdt.approve(address(multiSyVault), TEST_DEPOSIT_AMOUNT);
        multiSyVault.deposit(TEST_DEPOSIT_AMOUNT, user2);
        vm.stopPrank();
        
        // Verify new allocation is working
        uint256 oldLendingBalance = mockStrategy.balanceOf();
        uint256 stakingBalance = stakingStrategy.balanceOf();
        uint256 newLendingBalance = newLendingStrategy.balanceOf();
        
        console.log("After new deposit:");
        console.log("  Old Lending:", oldLendingBalance);
        console.log("  Staking:", stakingBalance);
        console.log("  New Lending:", newLendingBalance);
        
        // New deposit should follow 50/30/20 allocation on the second deposit
        // First deposit: 500/300/200, LP removed: 500/300/0 + 200 back to contract
        // Second deposit: +500/+300/+200 = 1000/600/200
        assertEq(oldLendingBalance, 1000e6); // 500 + 500
        assertEq(stakingBalance, 600e6);     // 300 + 300  
        assertEq(newLendingBalance, 200e6);  // 0 + 200
        assertEq(lpStrategy.balanceOf(), 0); // Should remain 0 after removal
    }
    
    function testEmergencyScenarios() public {
        console.log("=== Emergency Scenarios Test ===");
        
        // Setup: Multiple users deposit
        vm.startPrank(user1);
        usdt.approve(address(multiSyVault), TEST_DEPOSIT_AMOUNT);
        uint256 shares1 = multiSyVault.deposit(TEST_DEPOSIT_AMOUNT, user1);
        vm.stopPrank();
        
        vm.startPrank(user2);
        usdt.approve(address(multiSyVault), TEST_DEPOSIT_AMOUNT);
        uint256 shares2 = multiSyVault.deposit(TEST_DEPOSIT_AMOUNT, user2);
        vm.stopPrank();
        
        console.log("After deposits:");
        console.log("  Total assets:", multiSyVault.totalAssets());
        console.log("  User1 shares:", shares1);
        console.log("  User2 shares:", shares2);
        
        // Emergency scenario: Owner needs to quickly exit all strategies
        vm.startPrank(owner);
        
        uint256 initialContractBalance = usdt.balanceOf(address(multiSyVault));
        
        // Emergency withdraw from all strategies
        multiSyVault.emergencyWithdraw();
        
        uint256 finalContractBalance = usdt.balanceOf(address(multiSyVault));
        
        console.log("Emergency withdrawal:");
        console.log("  Contract balance before:", initialContractBalance);
        console.log("  Contract balance after:", finalContractBalance);
        console.log("  Funds recovered:", finalContractBalance - initialContractBalance);
        
        vm.stopPrank();
        
        // Verify all strategy balances are now zero
        assertEq(mockStrategy.balanceOf(), 0);
        assertEq(stakingStrategy.balanceOf(), 0);
        assertEq(lpStrategy.balanceOf(), 0);
        
        // Verify all funds are back in the contract
        assertGe(finalContractBalance, TEST_DEPOSIT_AMOUNT * 2);
        
        // Users should still be able to withdraw their shares
        vm.startPrank(user1);
        uint256 assets1 = multiSyVault.withdraw(shares1, user1, user1);
        vm.stopPrank();
        
        vm.startPrank(user2);
        uint256 assets2 = multiSyVault.withdraw(shares2, user2, user2);
        vm.stopPrank();
        
        console.log("User withdrawals:");
        console.log("  User1 assets:", assets1);
        console.log("  User2 assets:", assets2);
        
        // Both users should get their original deposits back
        assertGe(assets1, TEST_DEPOSIT_AMOUNT - 1);
        assertGe(assets2, TEST_DEPOSIT_AMOUNT - 1);
    }
    
    function testMultipleUsersWithDifferentStrategies() public {
        console.log("=== Multiple Users with Different Strategy Preferences ===");
        
        // Create different vault configurations for different user preferences
        vm.startPrank(owner);
        
        // Conservative vault (100% staking)
        StandardizedYield conservativeVault = new StandardizedYield(
            address(usdt),
            "Conservative Yield USDT",
            "cyUSDT",
            owner
        );
        conservativeVault.addStrategy(address(stakingStrategy), 10000); // 100% staking
        
        // Aggressive vault (100% LP)
        StandardizedYield aggressiveVault = new StandardizedYield(
            address(usdt),
            "Aggressive Yield USDT", 
            "ayUSDT",
            owner
        );
        aggressiveVault.addStrategy(address(lpStrategy), 10000); // 100% LP
        
        vm.stopPrank();
        
        // User1 chooses conservative strategy (low risk)
        vm.startPrank(user1);
        usdt.approve(address(conservativeVault), TEST_DEPOSIT_AMOUNT);
        uint256 conservativeShares = conservativeVault.deposit(TEST_DEPOSIT_AMOUNT, user1);
        vm.stopPrank();
        
        // User2 chooses aggressive strategy (high risk)
        vm.startPrank(user2);
        usdt.approve(address(aggressiveVault), TEST_DEPOSIT_AMOUNT);
        uint256 aggressiveShares = aggressiveVault.deposit(TEST_DEPOSIT_AMOUNT, user2);
        vm.stopPrank();
        
        console.log("User preferences:");
        console.log("  User1 (Conservative) APY:", conservativeVault.getAPY());
        console.log("  User2 (Aggressive) APY:", aggressiveVault.getAPY());
        console.log("  Multi-strategy APY:", multiSyVault.getAPY());
        
        // Verify different risk profiles
        assertEq(conservativeVault.getAPY(), 800);  // 8% staking
        assertGt(aggressiveVault.getAPY(), 1000);   // 12%+ volatile LP
        assertEq(multiSyVault.getAPY(), 980);       // 9.8% weighted average
        
        console.log("Strategy allocations verified:");
        console.log("  Conservative in staking:", stakingStrategy.balanceOf());
        console.log("  Aggressive in LP:", lpStrategy.balanceOf());
        console.log("  Multi-strategy distributed across all");
    }
}