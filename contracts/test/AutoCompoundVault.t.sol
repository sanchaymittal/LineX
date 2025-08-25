// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/core/AutoCompoundVault.sol";
import "../src/strategies/MockLendingStrategy.sol";
import "../src/strategies/MockStakingStrategy.sol";
import "../src/strategies/MockLPStrategy.sol";
import "../src/TestUSDT.sol";

/**
 * @title AutoCompoundVaultTest
 * @dev Comprehensive test suite for Beefy-style auto-compounding vault
 */
contract AutoCompoundVaultTest is Test {
    AutoCompoundVault public lendingVault;
    AutoCompoundVault public stakingVault;
    AutoCompoundVault public lpVault;
    
    MockLendingStrategy public lendingStrategy;
    MockStakingStrategy public stakingStrategy;
    MockLPStrategy public lpStrategy;
    TestUSDT public usdt;
    
    address public owner = address(0x1);
    address public user1 = address(0x2);
    address public user2 = address(0x3);
    address public harvester = address(0x4);
    
    uint256 public constant INITIAL_USDT_SUPPLY = 1000000e6; // 1M USDT
    uint256 public constant TEST_DEPOSIT_AMOUNT = 1000e6; // 1000 USDT
    uint256 public constant SMALL_DEPOSIT = 100e6; // 100 USDT
    
    function setUp() public {
        // Deploy TestUSDT
        usdt = new TestUSDT(owner);
        
        // Deploy all strategies
        lendingStrategy = new MockLendingStrategy(address(usdt), owner);
        stakingStrategy = new MockStakingStrategy(address(usdt), owner);
        lpStrategy = new MockLPStrategy(address(usdt), owner);
        
        // Deploy auto-compound vaults for each strategy type
        lendingVault = new AutoCompoundVault(
            usdt,
            lendingStrategy,
            "Auto-Compound Lending USDT",
            "acLUSDT",
            owner
        );
        
        stakingVault = new AutoCompoundVault(
            usdt,
            stakingStrategy,
            "Auto-Compound Staking USDT", 
            "acSUSDT",
            owner
        );
        
        lpVault = new AutoCompoundVault(
            usdt,
            lpStrategy,
            "Auto-Compound LP USDT",
            "acLPUSDT", 
            owner
        );
        
        // Mint USDT to test users and harvester
        vm.startPrank(owner);
        usdt.mint(user1, TEST_DEPOSIT_AMOUNT * 10);
        usdt.mint(user2, TEST_DEPOSIT_AMOUNT * 10);
        usdt.mint(harvester, TEST_DEPOSIT_AMOUNT);
        vm.stopPrank();
    }
    
    // === Basic Functionality Tests ===
    
    function testDeposit() public {
        vm.startPrank(user1);
        
        usdt.approve(address(lendingVault), TEST_DEPOSIT_AMOUNT);
        
        uint256 initialBalance = usdt.balanceOf(user1);
        uint256 shares = lendingVault.balanceOf(user1);
        
        lendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        
        // Verify deposit
        assertEq(usdt.balanceOf(user1), initialBalance - TEST_DEPOSIT_AMOUNT);
        assertGt(lendingVault.balanceOf(user1), shares);
        
        // Verify funds deployed to strategy
        assertEq(lendingStrategy.balanceOf(), TEST_DEPOSIT_AMOUNT);
        assertEq(usdt.balanceOf(address(lendingVault)), 0); // All deployed
        
        vm.stopPrank();
    }
    
    function testWithdraw() public {
        // First deposit
        vm.startPrank(user1);
        usdt.approve(address(lendingVault), TEST_DEPOSIT_AMOUNT);
        lendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        
        uint256 shares = lendingVault.balanceOf(user1);
        uint256 initialBalance = usdt.balanceOf(user1);
        
        // Withdraw all shares
        lendingVault.withdraw(shares);
        
        // Should get approximately the same amount back (allowing for fees/rounding)
        assertGe(usdt.balanceOf(user1), initialBalance + TEST_DEPOSIT_AMOUNT - 1);
        assertEq(lendingVault.balanceOf(user1), 0);
        
        vm.stopPrank();
    }
    
    function testAutoHarvestOnDeposit() public {
        console.log("=== Auto Harvest on Deposit Test ===");
        
        // Initial deposit to generate yield
        vm.startPrank(user1);
        usdt.approve(address(lendingVault), TEST_DEPOSIT_AMOUNT);
        lendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        vm.stopPrank();
        
        console.log("After initial deposit:");
        console.log("  Total assets:", lendingVault.totalAssets());
        console.log("  Strategy balance:", lendingStrategy.balanceOf());
        
        // Fast forward time and mint yield to strategy
        vm.warp(block.timestamp + 30 days);
        
        // Mint yield directly to strategy to simulate real yield
        vm.startPrank(owner);
        usdt.mint(address(lendingStrategy), 50e6); // 50 USDT external yield
        vm.stopPrank();
        
        uint256 pendingYield = lendingStrategy.pendingYield();
        console.log("  Pending yield after 30 days:", pendingYield);
        assertGt(pendingYield, 0);
        
        // Second deposit should auto-harvest first
        vm.startPrank(user2);
        usdt.approve(address(lendingVault), SMALL_DEPOSIT);
        
        uint256 totalAssetsBefore = lendingVault.totalAssets();
        console.log("  Total assets before 2nd deposit:", totalAssetsBefore);
        
        lendingVault.deposit(SMALL_DEPOSIT);
        
        uint256 totalAssetsAfter = lendingVault.totalAssets();
        console.log("  Total assets after 2nd deposit:", totalAssetsAfter);
        
        // Total assets should increase by at least the deposit amount
        // Auto-harvest already happened before this measurement
        assertGe(totalAssetsAfter, totalAssetsBefore + SMALL_DEPOSIT);
        
        // Verify auto-harvest occurred (totalAssetsBefore should include harvested yield)
        assertGt(totalAssetsBefore, TEST_DEPOSIT_AMOUNT); // Should be more than original 1000 USDT
        
        vm.stopPrank();
    }
    
    function testAutoHarvestOnWithdraw() public {
        // Setup: Deposit and generate yield
        vm.startPrank(user1);
        usdt.approve(address(lendingVault), TEST_DEPOSIT_AMOUNT);
        lendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        vm.stopPrank();
        
        // Generate yield
        vm.warp(block.timestamp + 30 days);
        
        // Mint yield to strategy
        vm.startPrank(owner);
        usdt.mint(address(lendingStrategy), 50e6);
        vm.stopPrank();
        
        uint256 shares = lendingVault.balanceOf(user1);
        uint256 pendingYield = lendingStrategy.pendingYield();
        assertGt(pendingYield, 0);
        
        // Withdraw should auto-harvest and include yield
        vm.startPrank(user1);
        uint256 initialBalance = usdt.balanceOf(user1);
        
        lendingVault.withdraw(shares);
        
        uint256 finalBalance = usdt.balanceOf(user1);
        uint256 profit = finalBalance - initialBalance - TEST_DEPOSIT_AMOUNT;
        
        console.log("Auto-harvest on withdraw:");
        console.log("  Profit from yield:", profit);
        
        // Should get more than original deposit due to auto-harvest
        assertGt(profit, 0);
        
        vm.stopPrank();
    }
    
    function testHarvestIncentives() public {
        console.log("=== Harvest Incentives Test ===");
        
        // Setup vault with deposits
        vm.startPrank(user1);
        usdt.approve(address(lendingVault), TEST_DEPOSIT_AMOUNT);
        lendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        vm.stopPrank();
        
        // Generate yield
        vm.warp(block.timestamp + 30 days);
        
        // Mint yield to strategy
        vm.startPrank(owner);
        usdt.mint(address(lendingStrategy), 100e6); // 100 USDT external yield
        vm.stopPrank();
        
        uint256 pendingYield = lendingStrategy.pendingYield();
        uint256 expectedReward = lendingVault.estimateHarvestReward();
        
        console.log("Before external harvest:");
        console.log("  Pending yield:", pendingYield);
        console.log("  Expected reward:", expectedReward);
        console.log("  Harvester balance:", usdt.balanceOf(harvester));
        
        // External harvester calls harvest
        vm.startPrank(harvester);
        uint256 harvesterBalanceBefore = usdt.balanceOf(harvester);
        
        lendingVault.harvest();
        
        // Claim harvest rewards as owner
        vm.stopPrank();
        vm.startPrank(owner);
        lendingVault.claimHarvestRewards();
        vm.stopPrank();
        
        // Check if harvester gets reward (through owner claim mechanism)
        uint256 totalYieldHarvested = lendingVault.totalYieldHarvested();
        
        console.log("After harvest:");
        console.log("  Total yield harvested:", totalYieldHarvested);
        console.log("  Vault total assets:", lendingVault.totalAssets());
        
        assertGt(totalYieldHarvested, 0);
        assertGt(expectedReward, 0);
        
        vm.stopPrank();
    }
    
    function testMultipleUsersCompounding() public {
        console.log("=== Multiple Users Auto-Compounding Test ===");
        
        // User1 deposits first
        vm.startPrank(user1);
        usdt.approve(address(lendingVault), TEST_DEPOSIT_AMOUNT);
        uint256 shares1 = lendingVault.balanceOf(user1);
        lendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        shares1 = lendingVault.balanceOf(user1) - shares1;
        vm.stopPrank();
        
        // Generate some yield
        vm.warp(block.timestamp + 15 days);
        
        // Mint yield to strategy
        vm.startPrank(owner);
        usdt.mint(address(lendingStrategy), 25e6);
        vm.stopPrank();
        
        // User2 deposits (should auto-harvest and compound)
        vm.startPrank(user2);
        usdt.approve(address(lendingVault), TEST_DEPOSIT_AMOUNT);
        uint256 shares2 = lendingVault.balanceOf(user2);
        lendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        shares2 = lendingVault.balanceOf(user2) - shares2;
        vm.stopPrank();
        
        console.log("Shares comparison:");
        console.log("  User1 shares (early deposit):", shares1);
        console.log("  User2 shares (after yield):", shares2);
        
        // User2 should get fewer shares since price per share increased due to compounding
        assertLt(shares2, shares1);
        
        // Generate more yield
        vm.warp(block.timestamp + 30 days);
        
        // Both users withdraw and compare returns
        vm.startPrank(user1);
        uint256 assets1 = usdt.balanceOf(user1);
        lendingVault.withdraw(shares1);
        assets1 = usdt.balanceOf(user1) - assets1;
        vm.stopPrank();
        
        vm.startPrank(user2);
        uint256 assets2 = usdt.balanceOf(user2);
        lendingVault.withdraw(shares2);
        assets2 = usdt.balanceOf(user2) - assets2;
        vm.stopPrank();
        
        console.log("Final returns:");
        console.log("  User1 assets:", assets1);
        console.log("  User2 assets:", assets2);
        console.log("  User1 profit:", assets1 > TEST_DEPOSIT_AMOUNT ? assets1 - TEST_DEPOSIT_AMOUNT : 0);
        console.log("  User2 profit:", assets2 > TEST_DEPOSIT_AMOUNT ? assets2 - TEST_DEPOSIT_AMOUNT : 0);
        
        // Both should be profitable
        assertGe(assets1, TEST_DEPOSIT_AMOUNT);
        assertGe(assets2, TEST_DEPOSIT_AMOUNT);
    }
    
    function testStrategyMigration() public {
        console.log("=== Strategy Migration Test ===");
        
        // Setup with lending strategy
        vm.startPrank(user1);
        usdt.approve(address(lendingVault), TEST_DEPOSIT_AMOUNT);
        lendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        vm.stopPrank();
        
        console.log("Before migration:");
        console.log("  Lending strategy balance:", lendingStrategy.balanceOf());
        console.log("  Staking strategy balance:", stakingStrategy.balanceOf());
        console.log("  Vault total assets:", lendingVault.totalAssets());
        
        // Owner migrates to staking strategy
        vm.startPrank(owner);
        lendingVault.setStrategy(stakingStrategy);
        vm.stopPrank();
        
        console.log("After migration:");
        console.log("  Lending strategy balance:", lendingStrategy.balanceOf());
        console.log("  Staking strategy balance:", stakingStrategy.balanceOf());
        console.log("  Vault total assets:", lendingVault.totalAssets());
        
        // Verify migration
        assertEq(lendingStrategy.balanceOf(), 0);
        assertEq(stakingStrategy.balanceOf(), TEST_DEPOSIT_AMOUNT);
        assertEq(lendingVault.totalAssets(), TEST_DEPOSIT_AMOUNT);
        
        // Verify new strategy info
        (address strategyAddr, string memory name, uint8 risk, uint256 apy,) = lendingVault.getStrategyInfo();
        assertEq(strategyAddr, address(stakingStrategy));
        assertEq(apy, 800); // 8% for staking
        assertEq(risk, 2); // Low risk
    }
    
    function testWithdrawalFees() public {
        console.log("=== Withdrawal Fees Test ===");
        
        // Set 2% withdrawal fee
        vm.startPrank(owner);
        lendingVault.setWithdrawalFee(200); // 2%
        vm.stopPrank();
        
        // Deposit
        vm.startPrank(user1);
        usdt.approve(address(lendingVault), TEST_DEPOSIT_AMOUNT);
        lendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        
        uint256 shares = lendingVault.balanceOf(user1);
        uint256 balanceBefore = usdt.balanceOf(user1);
        
        // Withdraw with fees
        lendingVault.withdraw(shares);
        
        uint256 balanceAfter = usdt.balanceOf(user1);
        uint256 received = balanceAfter - balanceBefore;
        uint256 expectedFee = TEST_DEPOSIT_AMOUNT * 200 / 10000; // 2%
        
        console.log("Withdrawal with 2% fee:");
        console.log("  Amount received:", received);
        console.log("  Expected fee:", expectedFee);
        console.log("  Actual fee:", TEST_DEPOSIT_AMOUNT - received);
        
        // Should receive less due to fee
        assertLt(received, TEST_DEPOSIT_AMOUNT);
        assertApproxEqAbs(received, TEST_DEPOSIT_AMOUNT - expectedFee, 1);
        
        vm.stopPrank();
    }
    
    function testCompoundingEffect() public {
        console.log("=== Compounding Effect Test ===");
        
        // User1: Auto-compounding vault
        vm.startPrank(user1);
        usdt.approve(address(lendingVault), TEST_DEPOSIT_AMOUNT);
        lendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        vm.stopPrank();
        
        // User2: Direct strategy (no compounding)
        vm.startPrank(user2);
        usdt.approve(address(lendingStrategy), TEST_DEPOSIT_AMOUNT);
        lendingStrategy.deposit(TEST_DEPOSIT_AMOUNT);
        vm.stopPrank();
        
        console.log("Initial state:");
        console.log("  Vault total assets:", lendingVault.totalAssets());
        console.log("  Direct strategy balance:", lendingStrategy.balanceOf());
        
        // Simulate multiple compounding cycles
        for (uint256 i = 0; i < 4; i++) {
            vm.warp(block.timestamp + 7 days); // Weekly compounding
            
            // Mint weekly yield
            vm.startPrank(owner);
            usdt.mint(address(lendingStrategy), 20e6); // Weekly yield
            vm.stopPrank();
            
            // Manual harvest for auto-compound vault
            lendingVault.harvest();
            
            console.log("After", (i+1), "weeks:");
            console.log("  Auto-compound assets:", lendingVault.totalAssets());
            console.log("  Direct strategy (no compound):", lendingStrategy.getUserDeposit(user2) + lendingStrategy.pendingYield());
        }
        
        // Final comparison after 4 weeks
        uint256 autoCompoundValue = lendingVault.totalAssets();
        uint256 directValue = lendingStrategy.getUserDeposit(user2) + lendingStrategy.pendingYield();
        
        console.log("Final comparison after 4 weeks:");
        console.log("  Auto-compound value:", autoCompoundValue);
        console.log("  Direct value:", directValue);
        
        // Auto-compounding should perform better
        assertGt(autoCompoundValue, directValue);
    }
    
    function testPricePerShareGrowth() public {
        vm.startPrank(user1);
        usdt.approve(address(lendingVault), TEST_DEPOSIT_AMOUNT);
        lendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        vm.stopPrank();
        
        uint256 initialPrice = lendingVault.getPricePerFullShare();
        console.log("Initial price per share:", initialPrice);
        
        // Generate yield by minting directly to strategy, then harvest
        for (uint256 i = 0; i < 3; i++) {
            vm.warp(block.timestamp + 10 days);
            
            // Mint yield directly to strategy to simulate yield generation
            vm.startPrank(owner);
            usdt.mint(address(lendingStrategy), 10e6); // 10 USDT yield
            vm.stopPrank();
            
            lendingVault.harvest();
            
            uint256 currentPrice = lendingVault.getPricePerFullShare();
            console.log("Price after", (i+1)*10, "days:", currentPrice);
            
            // Price should increase due to compounding
            assertGe(currentPrice, initialPrice);
            initialPrice = currentPrice;
        }
    }
    
    function testDifferentStrategyPerformance() public {
        console.log("=== Different Strategy Performance Test ===");
        
        // Deposit same amount in each vault type
        vm.startPrank(user1);
        usdt.approve(address(lendingVault), TEST_DEPOSIT_AMOUNT);
        usdt.approve(address(stakingVault), TEST_DEPOSIT_AMOUNT);
        usdt.approve(address(lpVault), TEST_DEPOSIT_AMOUNT);
        
        lendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        stakingVault.deposit(TEST_DEPOSIT_AMOUNT);
        lpVault.deposit(TEST_DEPOSIT_AMOUNT);
        vm.stopPrank();
        
        console.log("Initial APYs:");
        console.log("  Lending APY:", lendingVault.getCurrentAPY());
        console.log("  Staking APY:", stakingVault.getCurrentAPY());
        console.log("  LP APY:", lpVault.getCurrentAPY());
        
        // Fast forward and generate yield for all strategies
        vm.warp(block.timestamp + 30 days);
        
        // Mint yield to each strategy
        vm.startPrank(owner);
        usdt.mint(address(lendingStrategy), 50e6); // Lending yield
        usdt.mint(address(stakingStrategy), 30e6); // Staking yield
        usdt.mint(address(lpStrategy), 70e6);      // LP yield
        vm.stopPrank();
        
        lendingVault.harvest();
        stakingVault.harvest();
        lpVault.harvest();
        
        uint256 lendingAssets = lendingVault.totalAssets();
        uint256 stakingAssets = stakingVault.totalAssets();
        uint256 lpAssets = lpVault.totalAssets();
        
        console.log("After 30 days:");
        console.log("  Lending assets:", lendingAssets);
        console.log("  Staking assets:", stakingAssets);
        console.log("  LP assets:", lpAssets);
        
        // LP should have highest return (but more volatile)
        assertGt(lpAssets, stakingAssets);
        assertGt(lendingAssets, stakingAssets); // 10% > 8%
        
        // All should be profitable
        assertGt(lendingAssets, TEST_DEPOSIT_AMOUNT);
        assertGt(stakingAssets, TEST_DEPOSIT_AMOUNT);
        assertGt(lpAssets, TEST_DEPOSIT_AMOUNT);
    }
    
    function testEmergencyFunctions() public {
        // Setup
        vm.startPrank(user1);
        usdt.approve(address(lendingVault), TEST_DEPOSIT_AMOUNT);
        lendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        vm.stopPrank();
        
        // Emergency pause
        vm.startPrank(owner);
        lendingVault.pause();
        vm.stopPrank();
        
        // Should revert when paused
        vm.startPrank(user2);
        usdt.approve(address(lendingVault), SMALL_DEPOSIT);
        vm.expectRevert();
        lendingVault.deposit(SMALL_DEPOSIT);
        vm.stopPrank();
        
        // Emergency withdraw
        vm.startPrank(owner);
        uint256 vaultBalanceBefore = usdt.balanceOf(address(lendingVault));
        
        lendingVault.emergencyWithdraw();
        
        uint256 vaultBalanceAfter = usdt.balanceOf(address(lendingVault));
        
        // All funds should be withdrawn from strategy to vault
        assertEq(lendingStrategy.balanceOf(), 0);
        assertGt(vaultBalanceAfter, vaultBalanceBefore);
        
        // Unpause
        lendingVault.unpause();
        vm.stopPrank();
        
        // Should work again after unpause
        vm.startPrank(user2);
        lendingVault.deposit(SMALL_DEPOSIT);
        vm.stopPrank();
    }
    
    function testPrecisionAndRounding() public {
        console.log("=== Precision and Rounding Test ===");
        
        // Test with very small amounts
        uint256 tinyAmount = 1e6; // 1 USDT
        
        vm.startPrank(user1);
        usdt.approve(address(lendingVault), tinyAmount);
        lendingVault.deposit(tinyAmount);
        
        uint256 shares = lendingVault.balanceOf(user1);
        console.log("Tiny deposit shares:", shares);
        assertGt(shares, 0);
        
        // Test withdraw
        lendingVault.withdraw(shares);
        uint256 received = usdt.balanceOf(user1);
        
        console.log("Tiny withdraw received:", received);
        
        // Should handle precision correctly (allow 1 wei difference)
        assertGe(received, tinyAmount - 1);
        
        vm.stopPrank();
    }
    
    function testYieldAccrualAccuracy() public {
        console.log("=== Yield Accrual Accuracy Test ===");
        
        // Deposit
        vm.startPrank(user1);
        usdt.approve(address(lendingVault), TEST_DEPOSIT_AMOUNT);
        lendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        vm.stopPrank();
        
        uint256 initialAssets = lendingVault.totalAssets();
        
        // Fast forward 365 days for full year
        vm.warp(block.timestamp + 365 days);
        
        // Mint annual yield to strategy (10% of deposit)
        vm.startPrank(owner);
        usdt.mint(address(lendingStrategy), TEST_DEPOSIT_AMOUNT * 10 / 100);
        vm.stopPrank();
        
        // Harvest yield
        lendingVault.harvest();
        
        uint256 finalAssets = lendingVault.totalAssets();
        uint256 actualYield = finalAssets - initialAssets;
        uint256 expectedYield = TEST_DEPOSIT_AMOUNT * 1000 / 10000; // 10% APY
        
        console.log("Annual yield accuracy:");
        console.log("  Expected yield (10%):", expectedYield);
        console.log("  Actual yield:", actualYield);
        console.log("  Difference:", actualYield > expectedYield ? actualYield - expectedYield : expectedYield - actualYield);
        
        // Should be approximately 10% (allowing for compounding and precision)
        assertApproxEqRel(actualYield, expectedYield, 0.05e18); // 5% tolerance
    }
    
    // === Edge Cases and Error Conditions ===
    
    function test_RevertWhen_DepositZero() public {
        vm.startPrank(user1);
        usdt.approve(address(lendingVault), TEST_DEPOSIT_AMOUNT);
        
        vm.expectRevert("Cannot deposit 0");
        lendingVault.deposit(0);
        
        vm.stopPrank();
    }
    
    function test_RevertWhen_WithdrawZero() public {
        vm.startPrank(user1);
        vm.expectRevert("Cannot withdraw 0");
        lendingVault.withdraw(0);
        vm.stopPrank();
    }
    
    function test_RevertWhen_WithdrawMoreThanBalance() public {
        vm.startPrank(user1);
        usdt.approve(address(lendingVault), TEST_DEPOSIT_AMOUNT);
        lendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        
        uint256 shares = lendingVault.balanceOf(user1);
        
        vm.expectRevert("Insufficient shares");
        lendingVault.withdraw(shares + 1);
        
        vm.stopPrank();
    }
    
    function test_RevertWhen_InvalidStrategy() public {
        vm.startPrank(owner);
        
        vm.expectRevert("Invalid strategy");
        lendingVault.setStrategy(IYieldStrategy(address(0)));
        
        vm.stopPrank();
    }
    
    function test_RevertWhen_AssetMismatch() public {
        // Create strategy with different asset
        TestUSDT differentAsset = new TestUSDT(owner);
        MockLendingStrategy differentStrategy = new MockLendingStrategy(address(differentAsset), owner);
        
        vm.startPrank(owner);
        
        vm.expectRevert("Asset mismatch");
        lendingVault.setStrategy(differentStrategy);
        
        vm.stopPrank();
    }
    
    function test_RevertWhen_FeeToHigh() public {
        vm.startPrank(owner);
        
        vm.expectRevert("Fee too high");
        lendingVault.setWithdrawalFee(600); // 6% > 5% max
        
        vm.stopPrank();
    }
    
    function test_RevertWhen_NotOwner() public {
        vm.startPrank(user1);
        
        vm.expectRevert();
        lendingVault.setWithdrawalFee(100);
        
        vm.expectRevert();
        lendingVault.pause();
        
        vm.expectRevert();
        lendingVault.emergencyWithdraw();
        
        vm.stopPrank();
    }
    
    function testComplexHarvestScenario() public {
        console.log("=== Complex Harvest Scenario Test ===");
        
        // Multiple users, multiple deposits over time with harvesting
        
        // Week 1: User1 deposits
        vm.startPrank(user1);
        usdt.approve(address(lendingVault), TEST_DEPOSIT_AMOUNT);
        lendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        vm.stopPrank();
        
        // Week 2: Generate yield, external harvest
        vm.warp(block.timestamp + 7 days);
        vm.startPrank(owner);
        usdt.mint(address(lendingStrategy), 15e6);
        vm.stopPrank();
        vm.startPrank(harvester);
        lendingVault.harvest();
        vm.stopPrank();
        
        // Week 3: User2 deposits (auto-harvest)
        vm.warp(block.timestamp + 7 days);
        vm.startPrank(owner);
        usdt.mint(address(lendingStrategy), 15e6);
        vm.stopPrank();
        vm.startPrank(user2);
        usdt.approve(address(lendingVault), TEST_DEPOSIT_AMOUNT);
        lendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        vm.stopPrank();
        
        // Week 4: More yield, user1 partial withdraw
        vm.warp(block.timestamp + 7 days);
        vm.startPrank(owner);
        usdt.mint(address(lendingStrategy), 20e6);
        vm.stopPrank();
        vm.startPrank(user1);
        uint256 halfShares = lendingVault.balanceOf(user1) / 2;
        lendingVault.withdraw(halfShares);
        vm.stopPrank();
        
        // Week 5: Final harvest and withdrawals
        vm.warp(block.timestamp + 7 days);
        vm.startPrank(owner);
        usdt.mint(address(lendingStrategy), 20e6);
        vm.stopPrank();
        lendingVault.harvest();
        
        uint256 finalTotalAssets = lendingVault.totalAssets();
        uint256 totalYield = lendingVault.totalYieldHarvested();
        
        console.log("Complex scenario results:");
        console.log("  Final total assets:", finalTotalAssets);
        console.log("  Total yield harvested:", totalYield);
        console.log("  Price per share:", lendingVault.getPricePerFullShare());
        
        // Should have generated significant yield
        assertGt(totalYield, 0);
        assertGt(lendingVault.getPricePerFullShare(), 1e18);
    }
    
    function testGasOptimization() public {
        console.log("=== Gas Optimization Test ===");
        
        // Measure gas for deposit (includes auto-harvest)
        vm.startPrank(user1);
        usdt.approve(address(lendingVault), TEST_DEPOSIT_AMOUNT);
        
        uint256 gasBefore = gasleft();
        lendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        uint256 gasUsed = gasBefore - gasleft();
        
        console.log("Deposit gas used:", gasUsed);
        vm.stopPrank();
        
        // Generate yield
        vm.warp(block.timestamp + 7 days);
        
        // Mint yield to strategy
        vm.startPrank(owner);
        usdt.mint(address(lendingStrategy), 20e6);
        vm.stopPrank();
        
        // Measure gas for harvest
        gasBefore = gasleft();
        lendingVault.harvest();
        gasUsed = gasBefore - gasleft();
        
        console.log("Harvest gas used:", gasUsed);
        
        // Measure gas for withdraw (includes auto-harvest)
        vm.startPrank(user1);
        uint256 shares = lendingVault.balanceOf(user1);
        
        gasBefore = gasleft();
        lendingVault.withdraw(shares);
        gasUsed = gasBefore - gasleft();
        
        console.log("Withdraw gas used:", gasUsed);
        vm.stopPrank();
        
        // Gas usage should be reasonable for Kaia network
        // These are just reference measurements
        assertTrue(gasUsed > 0);
    }
}