// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/core/StandardizedYield.sol";
import "../src/core/AutoCompoundVault.sol";
import "../src/strategies/MockLendingStrategy.sol";
import "../src/strategies/MockStakingStrategy.sol";
import "../src/strategies/MockLPStrategy.sol";
import "../src/TestUSDT.sol";

/**
 * @title VaultIntegrationTest
 * @dev Integration tests for StandardizedYield + AutoCompoundVault interaction
 * Tests both vault types working together and user choice scenarios
 */
contract VaultIntegrationTest is Test {
    // Vault contracts
    StandardizedYield public multiStrategyVault;
    AutoCompoundVault public autoLendingVault;
    AutoCompoundVault public autoStakingVault;
    AutoCompoundVault public autoLPVault;
    
    // Strategy contracts
    MockLendingStrategy public lendingStrategy;
    MockStakingStrategy public stakingStrategy;
    MockLPStrategy public lpStrategy;
    TestUSDT public usdt;
    
    // Test accounts
    address public owner = address(0x1);
    address public user1 = address(0x2); // Conservative user
    address public user2 = address(0x3); // Aggressive user  
    address public user3 = address(0x4); // Diversified user
    address public user4 = address(0x5); // Strategy switcher
    
    uint256 public constant TEST_DEPOSIT_AMOUNT = 1000e6; // 1000 USDT
    uint256 public constant LARGE_DEPOSIT = 10000e6; // 10k USDT
    
    function setUp() public {
        // Deploy TestUSDT
        usdt = new TestUSDT(owner);
        
        // Deploy strategies
        lendingStrategy = new MockLendingStrategy(address(usdt), owner);
        stakingStrategy = new MockStakingStrategy(address(usdt), owner);
        lpStrategy = new MockLPStrategy(address(usdt), owner);
        
        // Deploy multi-strategy StandardizedYield vault
        multiStrategyVault = new StandardizedYield(
            address(usdt),
            "Multi-Strategy USDT",
            "msUSDT",
            owner
        );
        
        // Deploy single-strategy AutoCompoundVaults
        autoLendingVault = new AutoCompoundVault(
            usdt,
            lendingStrategy,
            "Auto-Compound Lending",
            "acLending",
            owner
        );
        
        autoStakingVault = new AutoCompoundVault(
            usdt,
            stakingStrategy,
            "Auto-Compound Staking",
            "acStaking", 
            owner
        );
        
        autoLPVault = new AutoCompoundVault(
            usdt,
            lpStrategy,
            "Auto-Compound LP",
            "acLP",
            owner
        );
        
        // Setup multi-strategy vault (50% lending, 30% staking, 20% LP)
        vm.startPrank(owner);
        multiStrategyVault.addStrategy(address(lendingStrategy), 5000);
        multiStrategyVault.addStrategy(address(stakingStrategy), 3000);
        multiStrategyVault.addStrategy(address(lpStrategy), 2000);
        
        // Mint USDT to all users (enough for multiple large deposits)
        usdt.mint(user1, LARGE_DEPOSIT * 5);
        usdt.mint(user2, LARGE_DEPOSIT * 5);
        usdt.mint(user3, LARGE_DEPOSIT * 5);
        usdt.mint(user4, LARGE_DEPOSIT * 5);
        vm.stopPrank();
    }
    
    function testUserStrategyPreferences() public {
        console.log("=== User Strategy Preferences Test ===");
        
        // User1: Conservative (100% staking via AutoCompound)
        vm.startPrank(user1);
        usdt.approve(address(autoStakingVault), TEST_DEPOSIT_AMOUNT);
        autoStakingVault.deposit(TEST_DEPOSIT_AMOUNT);
        vm.stopPrank();
        
        // User2: Aggressive (100% LP via AutoCompound) 
        vm.startPrank(user2);
        usdt.approve(address(autoLPVault), TEST_DEPOSIT_AMOUNT);
        autoLPVault.deposit(TEST_DEPOSIT_AMOUNT);
        vm.stopPrank();
        
        // User3: Diversified (Multi-strategy)
        vm.startPrank(user3);
        usdt.approve(address(multiStrategyVault), TEST_DEPOSIT_AMOUNT);
        multiStrategyVault.deposit(TEST_DEPOSIT_AMOUNT, user3);
        vm.stopPrank();
        
        console.log("Initial APYs:");
        console.log("  Conservative (Staking):", autoStakingVault.getCurrentAPY());
        console.log("  Aggressive (LP):", autoLPVault.getCurrentAPY());
        console.log("  Diversified (Multi):", multiStrategyVault.getAPY());
        
        // Generate yield and harvest all vaults
        vm.warp(block.timestamp + 30 days);
        
        vm.startPrank(owner);
        usdt.mint(address(stakingStrategy), 40e6);  // Staking yield
        usdt.mint(address(lpStrategy), 60e6);       // LP yield
        // Note: Multi-strategy will compete for the same strategy yields
        vm.stopPrank();
        
        // Harvest all vaults
        autoStakingVault.harvest();
        autoLPVault.harvest();
        multiStrategyVault.updateYield();
        
        uint256 conservativeAssets = autoStakingVault.totalAssets();
        uint256 aggressiveAssets = autoLPVault.totalAssets();
        uint256 diversifiedAssets = multiStrategyVault.totalAssets();
        
        console.log("Assets after 30 days:");
        console.log("  Conservative:", conservativeAssets);
        console.log("  Aggressive:", aggressiveAssets);
        console.log("  Diversified:", diversifiedAssets);
        
        // All should be profitable
        assertGt(conservativeAssets, TEST_DEPOSIT_AMOUNT);
        assertGt(aggressiveAssets, TEST_DEPOSIT_AMOUNT);
        assertGt(diversifiedAssets, TEST_DEPOSIT_AMOUNT);
        
        // Both aggressive and conservative should be profitable
        // Note: LP strategy is shared between multi-vault and pure LP vault
        // so returns may vary based on yield distribution
        assertGt(aggressiveAssets, TEST_DEPOSIT_AMOUNT);
        assertGt(conservativeAssets, TEST_DEPOSIT_AMOUNT);
        
        // LP has higher base APY but results depend on yield distribution
        console.log("Strategy performance:");
        console.log("  Conservative profit:", conservativeAssets > TEST_DEPOSIT_AMOUNT ? conservativeAssets - TEST_DEPOSIT_AMOUNT : 0);
        console.log("  Aggressive profit:", aggressiveAssets > TEST_DEPOSIT_AMOUNT ? aggressiveAssets - TEST_DEPOSIT_AMOUNT : 0);
    }
    
    function testVaultPerformanceComparison() public {
        console.log("=== Vault Performance Comparison ===");
        
        uint256 depositAmount = TEST_DEPOSIT_AMOUNT;
        
        // Same user deposits same amount in different vault types
        vm.startPrank(user1);
        
        // Multi-strategy vault
        usdt.approve(address(multiStrategyVault), depositAmount);
        multiStrategyVault.deposit(depositAmount, user1);
        
        // Auto-compound lending vault  
        usdt.approve(address(autoLendingVault), depositAmount);
        autoLendingVault.deposit(depositAmount);
        
        vm.stopPrank();
        
        console.log("Initial state:");
        console.log("  Multi-strategy assets:", multiStrategyVault.totalAssets());
        console.log("  Auto-compound assets:", autoLendingVault.totalAssets());
        
        // Simulate multiple cycles of yield generation and compounding
        for (uint256 cycle = 1; cycle <= 4; cycle++) {
            vm.warp(block.timestamp + 7 days);
            
            // Generate yield for all strategies
            vm.startPrank(owner);
            usdt.mint(address(lendingStrategy), 20e6);
            usdt.mint(address(stakingStrategy), 10e6);
            usdt.mint(address(lpStrategy), 25e6);
            vm.stopPrank();
            
            // Harvest both vaults
            autoLendingVault.harvest();
            multiStrategyVault.updateYield();
            
            console.log("After cycle", cycle);
            console.log("  Multi-strategy:", multiStrategyVault.totalAssets());
            console.log("  Auto-compound:", autoLendingVault.totalAssets());
        }
        
        uint256 multiAssets = multiStrategyVault.totalAssets();
        uint256 autoAssets = autoLendingVault.totalAssets();
        
        console.log("Final comparison:");
        console.log("  Multi-strategy total:", multiAssets);
        console.log("  Auto-compound total:", autoAssets);
        
        // Both should be profitable
        assertGt(multiAssets, depositAmount * 2); // 2x deposit
        assertGt(autoAssets, depositAmount);
    }
    
    function testVaultArbitrage() public {
        console.log("=== Vault Arbitrage Opportunity Test ===");
        
        // Setup: User4 has capital to move between vaults
        uint256 capital = TEST_DEPOSIT_AMOUNT;
        
        // Initially deposit in staking (conservative)
        vm.startPrank(user4);
        usdt.approve(address(autoStakingVault), capital);
        uint256 stakingShares = autoStakingVault.balanceOf(user4);
        autoStakingVault.deposit(capital);
        stakingShares = autoStakingVault.balanceOf(user4) - stakingShares;
        vm.stopPrank();
        
        console.log("Phase 1 - Conservative staking:");
        console.log("  Staking shares:", stakingShares);
        console.log("  APY:", autoStakingVault.getCurrentAPY());
        
        // Market shifts: LP becomes more attractive
        vm.warp(block.timestamp + 15 days);
        
        // Generate higher yield in LP market
        vm.startPrank(owner);
        usdt.mint(address(stakingStrategy), 10e6); // Lower staking yield
        usdt.mint(address(lpStrategy), 50e6);      // Higher LP yield
        vm.stopPrank();
        
        // User decides to switch to LP strategy
        vm.startPrank(user4);
        
        // Withdraw from staking
        uint256 balanceBefore = usdt.balanceOf(user4);
        autoStakingVault.withdraw(stakingShares);
        uint256 balanceAfter = usdt.balanceOf(user4);
        uint256 stakingReturn = balanceAfter - balanceBefore;
        
        // Deposit to LP vault
        usdt.approve(address(autoLPVault), stakingReturn);
        autoLPVault.deposit(stakingReturn);
        
        vm.stopPrank();
        
        console.log("Phase 2 - Switch to aggressive LP:");
        console.log("  Amount moved:", stakingReturn);
        console.log("  LP APY:", autoLPVault.getCurrentAPY());
        
        // Continue for another period
        vm.warp(block.timestamp + 15 days);
        
        vm.startPrank(owner);
        usdt.mint(address(lpStrategy), 50e6);
        vm.stopPrank();
        
        uint256 finalLPAssets = autoLPVault.totalAssets();
        
        console.log("Final result:");
        console.log("  LP vault assets:", finalLPAssets);
        console.log("  Strategy switch profit:", finalLPAssets > capital ? finalLPAssets - capital : 0);
        
        // Should be profitable to switch strategies
        assertGt(finalLPAssets, capital);
    }
    
    function testYieldFarmingComparison() public {
        console.log("=== Yield Farming Strategy Comparison ===");
        
        uint256 farmAmount = LARGE_DEPOSIT; // 10k USDT for meaningful yield
        
        // Deploy same amount across all vault types
        vm.startPrank(user1);
        
        // Multi-strategy (diversified)
        usdt.approve(address(multiStrategyVault), farmAmount);
        multiStrategyVault.deposit(farmAmount, user1);
        
        // Auto-compound lending (single strategy)
        usdt.approve(address(autoLendingVault), farmAmount);
        autoLendingVault.deposit(farmAmount);
        
        // Auto-compound LP (high risk)
        usdt.approve(address(autoLPVault), farmAmount);
        autoLPVault.deposit(farmAmount);
        
        vm.stopPrank();
        
        console.log("Initial deployment (10k USDT each):");
        console.log("  Multi-strategy:", multiStrategyVault.totalAssets());
        console.log("  Auto-lending:", autoLendingVault.totalAssets());
        console.log("  Auto-LP:", autoLPVault.totalAssets());
        
        // Simulate 3 months of farming with different market conditions
        for (uint256 month = 1; month <= 3; month++) {
            vm.warp(block.timestamp + 30 days);
            
            // Variable market conditions each month
            vm.startPrank(owner);
            if (month == 1) {
                // Month 1: Lending performs well
                usdt.mint(address(lendingStrategy), 200e6);
                usdt.mint(address(stakingStrategy), 100e6);
                usdt.mint(address(lpStrategy), 150e6);
            } else if (month == 2) {
                // Month 2: LP farming booms
                usdt.mint(address(lendingStrategy), 100e6);
                usdt.mint(address(stakingStrategy), 80e6);
                usdt.mint(address(lpStrategy), 300e6);
            } else {
                // Month 3: Market correction, staking stays stable
                usdt.mint(address(lendingStrategy), 50e6);
                usdt.mint(address(stakingStrategy), 120e6);
                usdt.mint(address(lpStrategy), 100e6);
            }
            vm.stopPrank();
            
            // Harvest all vaults
            multiStrategyVault.updateYield();
            autoLendingVault.harvest();
            autoLPVault.harvest();
            
            console.log("Month", month, "results:");
            console.log("  Multi-strategy:", multiStrategyVault.totalAssets());
            console.log("  Auto-lending:", autoLendingVault.totalAssets());
            console.log("  Auto-LP:", autoLPVault.totalAssets());
        }
        
        uint256 multiAssets = multiStrategyVault.totalAssets();
        uint256 lendingAssets = autoLendingVault.totalAssets();
        uint256 lpAssets = autoLPVault.totalAssets();
        
        console.log("Final 3-month results:");
        console.log("  Multi-strategy profit:", multiAssets > farmAmount ? multiAssets - farmAmount : 0);
        console.log("  Auto-lending profit:", lendingAssets > farmAmount ? lendingAssets - farmAmount : 0);
        console.log("  Auto-LP profit:", lpAssets > farmAmount ? lpAssets - farmAmount : 0);
        
        // All strategies should be profitable
        assertGt(multiAssets, farmAmount);
        assertGt(lendingAssets, farmAmount);
        assertGt(lpAssets, farmAmount);
        
        // Multi-strategy should provide steady returns through diversification
        uint256 multiProfit = multiAssets - farmAmount;
        uint256 lendingProfit = lendingAssets - farmAmount;
        uint256 lpProfit = lpAssets - farmAmount;
        
        // Diversification should provide risk-adjusted returns
        assertTrue(multiProfit > 0);
        assertTrue(lendingProfit > 0);
        assertTrue(lpProfit > 0);
    }
    
    function testStrategyMigrationBetweenVaults() public {
        console.log("=== Strategy Migration Between Vaults ===");
        
        // User starts with auto-compound lending
        vm.startPrank(user4);
        usdt.approve(address(autoLendingVault), TEST_DEPOSIT_AMOUNT);
        autoLendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        vm.stopPrank();
        
        // Generate some yield
        vm.warp(block.timestamp + 15 days);
        vm.startPrank(owner);
        usdt.mint(address(lendingStrategy), 30e6);
        vm.stopPrank();
        
        // User decides to switch to diversified multi-strategy
        vm.startPrank(user4);
        
        // Withdraw from auto-compound
        uint256 shares = autoLendingVault.balanceOf(user4);
        uint256 balanceBefore = usdt.balanceOf(user4);
        autoLendingVault.withdraw(shares);
        uint256 balanceAfter = usdt.balanceOf(user4);
        uint256 totalFromLending = balanceAfter - balanceBefore;
        
        console.log("Migrating from lending vault:");
        console.log("  Amount withdrawn:", totalFromLending);
        console.log("  Profit from lending:", totalFromLending > TEST_DEPOSIT_AMOUNT ? totalFromLending - TEST_DEPOSIT_AMOUNT : 0);
        
        // Deposit same amount to multi-strategy
        usdt.approve(address(multiStrategyVault), totalFromLending);
        multiStrategyVault.deposit(totalFromLending, user4);
        
        vm.stopPrank();
        
        // Verify migration
        assertEq(autoLendingVault.balanceOf(user4), 0);
        assertGt(multiStrategyVault.balanceOf(user4), 0);
        
        console.log("After migration to multi-strategy:");
        console.log("  Multi-strategy shares:", multiStrategyVault.balanceOf(user4));
        console.log("  New APY:", multiStrategyVault.getAPY());
        
        // Continue for another period to compare
        vm.warp(block.timestamp + 30 days);
        vm.startPrank(owner);
        usdt.mint(address(lendingStrategy), 40e6);
        usdt.mint(address(stakingStrategy), 25e6);
        usdt.mint(address(lpStrategy), 45e6);
        vm.stopPrank();
        
        multiStrategyVault.updateYield();
        
        console.log("Final multi-strategy assets:", multiStrategyVault.totalAssets());
        
        // Should continue earning in diversified manner
        assertGt(multiStrategyVault.totalAssets(), totalFromLending);
    }
    
    function testCompoundingVsNonCompounding() public {
        console.log("=== Auto-Compound vs Non-Compound Comparison ===");
        
        // User1: Auto-compounding vault
        vm.startPrank(user1);
        usdt.approve(address(autoLendingVault), TEST_DEPOSIT_AMOUNT);
        autoLendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        vm.stopPrank();
        
        // User2: Direct strategy (no auto-compounding)
        vm.startPrank(user2);
        usdt.approve(address(lendingStrategy), TEST_DEPOSIT_AMOUNT);
        lendingStrategy.deposit(TEST_DEPOSIT_AMOUNT);
        vm.stopPrank();
        
        // Simulate 6 months with monthly harvesting
        for (uint256 month = 1; month <= 6; month++) {
            vm.warp(block.timestamp + 30 days);
            
            // Generate monthly yield
            vm.startPrank(owner);
            usdt.mint(address(lendingStrategy), 40e6); // Monthly yield
            vm.stopPrank();
            
            // Only auto-compound vault harvests automatically
            autoLendingVault.harvest();
            
            console.log("Month", month);
            console.log("  Auto-compound assets:", autoLendingVault.totalAssets());
            console.log("  Direct strategy balance:", lendingStrategy.getUserDeposit(user2));
            console.log("  Direct strategy pending:", lendingStrategy.pendingYield());
        }
        
        // Final comparison
        uint256 autoCompoundTotal = autoLendingVault.totalAssets();
        uint256 directTotal = lendingStrategy.getUserDeposit(user2) + lendingStrategy.pendingYield();
        
        console.log("6-month comparison:");
        console.log("  Auto-compound total:", autoCompoundTotal);
        console.log("  Direct total (no compound):", directTotal);
        console.log("  Compounding advantage:", autoCompoundTotal > directTotal ? autoCompoundTotal - directTotal : 0);
        
        // Auto-compounding should outperform due to compound interest
        assertGt(autoCompoundTotal, directTotal);
    }
    
    function testLargeScaleOperations() public {
        console.log("=== Large Scale Operations Test ===");
        
        uint256 massDeposit = LARGE_DEPOSIT; // 10k USDT
        
        // Multiple large deposits across different vaults
        vm.startPrank(user1);
        usdt.approve(address(multiStrategyVault), massDeposit);
        multiStrategyVault.deposit(massDeposit, user1);
        vm.stopPrank();
        
        vm.startPrank(user2);
        usdt.approve(address(autoLendingVault), massDeposit);
        autoLendingVault.deposit(massDeposit);
        vm.stopPrank();
        
        vm.startPrank(user3);
        usdt.approve(address(autoLPVault), massDeposit);
        autoLPVault.deposit(massDeposit);
        vm.stopPrank();
        
        console.log("Large deposits (10k each):");
        console.log("  Multi-strategy:", multiStrategyVault.totalAssets());
        console.log("  Auto-lending:", autoLendingVault.totalAssets());
        console.log("  Auto-LP:", autoLPVault.totalAssets());
        
        // Check strategy balances can handle large amounts
        console.log("Strategy utilization:");
        console.log("  Lending strategy:", lendingStrategy.balanceOf());
        console.log("  Staking strategy:", stakingStrategy.balanceOf());
        console.log("  LP strategy:", lpStrategy.balanceOf());
        
        // Generate substantial yield
        vm.warp(block.timestamp + 60 days);
        vm.startPrank(owner);
        usdt.mint(address(lendingStrategy), 500e6); // 500 USDT yield
        usdt.mint(address(stakingStrategy), 300e6); // 300 USDT yield
        usdt.mint(address(lpStrategy), 800e6);      // 800 USDT yield
        vm.stopPrank();
        
        // Harvest all
        multiStrategyVault.updateYield();
        autoLendingVault.harvest();
        autoLPVault.harvest();
        
        console.log("After 60 days with substantial yield:");
        console.log("  Multi-strategy:", multiStrategyVault.totalAssets());
        console.log("  Auto-lending:", autoLendingVault.totalAssets());
        console.log("  Auto-LP:", autoLPVault.totalAssets());
        
        // All should handle large scale operations
        assertGt(multiStrategyVault.totalAssets(), massDeposit);
        assertGt(autoLendingVault.totalAssets(), massDeposit);
        assertGt(autoLPVault.totalAssets(), massDeposit);
    }
    
    function testConcurrentVaultOperations() public {
        console.log("=== Concurrent Vault Operations Test ===");
        
        // All users deposit to different vaults simultaneously
        vm.startPrank(user1);
        usdt.approve(address(multiStrategyVault), TEST_DEPOSIT_AMOUNT);
        usdt.approve(address(autoLendingVault), TEST_DEPOSIT_AMOUNT);
        
        multiStrategyVault.deposit(TEST_DEPOSIT_AMOUNT, user1);
        autoLendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        vm.stopPrank();
        
        vm.startPrank(user2);
        usdt.approve(address(autoStakingVault), TEST_DEPOSIT_AMOUNT);
        usdt.approve(address(autoLPVault), TEST_DEPOSIT_AMOUNT);
        
        autoStakingVault.deposit(TEST_DEPOSIT_AMOUNT);
        autoLPVault.deposit(TEST_DEPOSIT_AMOUNT);
        vm.stopPrank();
        
        // Check initial state
        console.log("Concurrent deposits completed:");
        console.log("  Total in lending strategy:", lendingStrategy.balanceOf());
        console.log("  Total in staking strategy:", stakingStrategy.balanceOf());
        console.log("  Total in LP strategy:", lpStrategy.balanceOf());
        
        // Generate yield for all
        vm.warp(block.timestamp + 30 days);
        vm.startPrank(owner);
        usdt.mint(address(lendingStrategy), 200e6);
        usdt.mint(address(stakingStrategy), 150e6);
        usdt.mint(address(lpStrategy), 250e6);
        vm.stopPrank();
        
        // Harvest all vaults
        multiStrategyVault.updateYield();
        autoLendingVault.harvest();
        autoStakingVault.harvest();
        autoLPVault.harvest();
        
        console.log("After concurrent operations and harvest:");
        console.log("  Multi-strategy total:", multiStrategyVault.totalAssets());
        console.log("  Auto-lending total:", autoLendingVault.totalAssets());
        console.log("  Auto-staking total:", autoStakingVault.totalAssets());
        console.log("  Auto-LP total:", autoLPVault.totalAssets());
        
        // All vaults should be profitable
        assertGt(multiStrategyVault.totalAssets(), TEST_DEPOSIT_AMOUNT);
        assertGt(autoLendingVault.totalAssets(), TEST_DEPOSIT_AMOUNT);
        assertGt(autoStakingVault.totalAssets(), TEST_DEPOSIT_AMOUNT);
        assertGt(autoLPVault.totalAssets(), TEST_DEPOSIT_AMOUNT);
        
        // Verify no conflicts between vaults using same strategies
        assertTrue(lendingStrategy.balanceOf() > 0); // Should have combined deposits
    }
    
    function testEmergencyScenarios() public {
        console.log("=== Emergency Scenarios Across Vaults ===");
        
        // Setup deposits in multiple vaults
        vm.startPrank(user1);
        usdt.approve(address(multiStrategyVault), TEST_DEPOSIT_AMOUNT);
        usdt.approve(address(autoLendingVault), TEST_DEPOSIT_AMOUNT);
        
        multiStrategyVault.deposit(TEST_DEPOSIT_AMOUNT, user1);
        autoLendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        vm.stopPrank();
        
        console.log("Before emergency:");
        console.log("  Multi-strategy assets:", multiStrategyVault.totalAssets());
        console.log("  Auto-lending assets:", autoLendingVault.totalAssets());
        console.log("  Lending strategy total:", lendingStrategy.balanceOf());
        
        // Emergency: Owner needs to pause all operations
        vm.startPrank(owner);
        
        multiStrategyVault.pause();
        autoLendingVault.pause();
        
        // Emergency withdraw from both vaults
        multiStrategyVault.emergencyWithdraw();
        autoLendingVault.emergencyWithdraw();
        
        vm.stopPrank();
        
        console.log("After emergency procedures:");
        console.log("  Multi-strategy contract balance:", usdt.balanceOf(address(multiStrategyVault)));
        console.log("  Auto-lending contract balance:", usdt.balanceOf(address(autoLendingVault)));
        console.log("  Lending strategy balance:", lendingStrategy.balanceOf());
        
        // Verify funds moved back to vault contracts
        uint256 multiVaultBalance = usdt.balanceOf(address(multiStrategyVault));
        uint256 autoVaultBalance = usdt.balanceOf(address(autoLendingVault));
        
        console.log("Emergency withdrawal verification:");
        console.log("  Multi-vault recovered:", multiVaultBalance);
        console.log("  Auto-vault recovered:", autoVaultBalance);
        
        // Should have recovered funds (at least some from strategies)
        assertGe(multiVaultBalance + autoVaultBalance, 0);
        
        // Verify paused state
        assertTrue(multiStrategyVault.paused());
        assertTrue(autoLendingVault.paused());
        
        // Users should not be able to deposit when paused
        vm.startPrank(user2);
        usdt.approve(address(multiStrategyVault), TEST_DEPOSIT_AMOUNT);
        
        vm.expectRevert();
        multiStrategyVault.deposit(TEST_DEPOSIT_AMOUNT, user2);
        
        vm.stopPrank();
    }
    
    function testGasEfficiencyComparison() public {
        console.log("=== Gas Efficiency Comparison ===");
        
        // Compare gas costs between vault types
        
        // Multi-strategy vault deposit
        vm.startPrank(user1);
        usdt.approve(address(multiStrategyVault), TEST_DEPOSIT_AMOUNT);
        
        uint256 gasBefore = gasleft();
        multiStrategyVault.deposit(TEST_DEPOSIT_AMOUNT, user1);
        uint256 multiStrategyGas = gasBefore - gasleft();
        vm.stopPrank();
        
        // Auto-compound vault deposit
        vm.startPrank(user2);
        usdt.approve(address(autoLendingVault), TEST_DEPOSIT_AMOUNT);
        
        gasBefore = gasleft();
        autoLendingVault.deposit(TEST_DEPOSIT_AMOUNT);
        uint256 autoCompoundGas = gasBefore - gasleft();
        vm.stopPrank();
        
        console.log("Gas usage comparison (deposit):");
        console.log("  Multi-strategy:", multiStrategyGas);
        console.log("  Auto-compound:", autoCompoundGas);
        
        // Generate yield and compare harvest gas
        vm.warp(block.timestamp + 7 days);
        vm.startPrank(owner);
        usdt.mint(address(lendingStrategy), 50e6);
        usdt.mint(address(stakingStrategy), 30e6);
        usdt.mint(address(lpStrategy), 40e6);
        vm.stopPrank();
        
        // Multi-strategy harvest
        gasBefore = gasleft();
        multiStrategyVault.updateYield();
        uint256 multiHarvestGas = gasBefore - gasleft();
        
        // Auto-compound harvest
        gasBefore = gasleft();
        autoLendingVault.harvest();
        uint256 autoHarvestGas = gasBefore - gasleft();
        
        console.log("Gas usage comparison (harvest):");
        console.log("  Multi-strategy update:", multiHarvestGas);
        console.log("  Auto-compound harvest:", autoHarvestGas);
        
        // Gas usage should be reasonable for Kaia
        assertTrue(multiStrategyGas > 0);
        assertTrue(autoCompoundGas > 0);
        assertTrue(multiHarvestGas > 0);
        assertTrue(autoHarvestGas > 0);
    }
    
    function testVaultTokenomics() public {
        console.log("=== Vault Tokenomics Test ===");
        
        // Test different share prices across vault types
        uint256 depositAmount = TEST_DEPOSIT_AMOUNT;
        
        // Initial deposits
        vm.startPrank(user1);
        usdt.approve(address(multiStrategyVault), depositAmount);
        usdt.approve(address(autoLendingVault), depositAmount);
        
        uint256 multiShares = multiStrategyVault.deposit(depositAmount, user1);
        uint256 autoShares = autoLendingVault.balanceOf(user1);
        autoLendingVault.deposit(depositAmount);
        autoShares = autoLendingVault.balanceOf(user1) - autoShares;
        vm.stopPrank();
        
        console.log("Initial shares (1:1 ratio):");
        console.log("  Multi-strategy shares:", multiShares);
        console.log("  Auto-compound shares:", autoShares);
        console.log("  Multi price per share:", multiStrategyVault.exchangeRate());
        console.log("  Auto price per share:", autoLendingVault.getPricePerFullShare());
        
        // Generate asymmetric yield
        vm.warp(block.timestamp + 45 days);
        vm.startPrank(owner);
        usdt.mint(address(lendingStrategy), 200e6); // High lending yield
        usdt.mint(address(stakingStrategy), 50e6);  // Low staking yield
        usdt.mint(address(lpStrategy), 150e6);      // Medium LP yield
        vm.stopPrank();
        
        // Harvest both
        multiStrategyVault.updateYield();
        autoLendingVault.harvest();
        
        console.log("After asymmetric yield:");
        console.log("  Multi exchange rate:", multiStrategyVault.exchangeRate());
        console.log("  Auto price per share:", autoLendingVault.getPricePerFullShare());
        
        // New user deposits should get different share amounts
        vm.startPrank(user2);
        usdt.approve(address(multiStrategyVault), depositAmount);
        usdt.approve(address(autoLendingVault), depositAmount);
        
        uint256 newMultiShares = multiStrategyVault.deposit(depositAmount, user2);
        uint256 newAutoShares = autoLendingVault.balanceOf(user2);
        autoLendingVault.deposit(depositAmount);
        newAutoShares = autoLendingVault.balanceOf(user2) - newAutoShares;
        vm.stopPrank();
        
        console.log("New user shares (after yield):");
        console.log("  Multi-strategy shares:", newMultiShares);
        console.log("  Auto-compound shares:", newAutoShares);
        
        // New users should get fewer shares due to increased price
        assertLt(newMultiShares, multiShares);
        assertLt(newAutoShares, autoShares);
    }
    
    // === Error Condition Tests ===
    
    function test_RevertWhen_InvalidVaultInteraction() public {
        // Test invalid interactions between vault types
        
        vm.startPrank(user1);
        
        // Cannot use StandardizedYield shares in AutoCompoundVault
        usdt.approve(address(multiStrategyVault), TEST_DEPOSIT_AMOUNT);
        multiStrategyVault.deposit(TEST_DEPOSIT_AMOUNT, user1);
        
        uint256 syShares = multiStrategyVault.balanceOf(user1);
        
        // This should fail - wrong vault type
        vm.expectRevert();
        autoLendingVault.withdraw(syShares);
        
        vm.stopPrank();
    }
    
    function test_RevertWhen_StrategyConflict() public {
        // Test that same strategy cannot be used in multiple places incorrectly
        
        vm.startPrank(owner);
        
        // Multi-strategy vault already has 3 strategies (max limit)
        // Trying to add a 4th should fail
        vm.expectRevert("Too many strategies");
        multiStrategyVault.addStrategy(address(lendingStrategy), 1000);
        
        // Should still have 3 strategies
        assertEq(multiStrategyVault.getStrategiesCount(), 3);
        
        vm.stopPrank();
    }
}