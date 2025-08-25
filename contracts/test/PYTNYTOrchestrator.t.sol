// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../src/core/PYTNYTOrchestrator.sol";
import "../src/core/StandardizedYield.sol";
import "../src/strategies/MockLendingStrategy.sol";
import "../src/TestUSDT.sol";

contract PYTNYTOrchestratorTest is Test {
    PYTNYTOrchestrator public orchestrator;
    StandardizedYield public syVault;
    MockLendingStrategy public strategy;
    TestUSDT public usdt;
    
    address public owner = address(1);
    address public user1 = address(2);
    address public user2 = address(3);
    
    uint256 public constant TEST_AMOUNT = 1000e6; // 1000 USDT
    uint256 public constant LARGE_AMOUNT = 10000e6; // 10000 USDT
    
    function setUp() public {
        vm.startPrank(owner);
        
        // Deploy TestUSDT
        usdt = new TestUSDT(owner);
        
        // Deploy strategy
        strategy = new MockLendingStrategy(address(usdt), owner);
        
        // Deploy SY vault
        syVault = new StandardizedYield(
            address(usdt),
            "SY-USDT",
            "SY-USDT",
            owner
        );
        
        // Deploy orchestrator
        orchestrator = new PYTNYTOrchestrator(syVault, owner);
        
        // Add strategy to SY vault
        syVault.addStrategy(address(strategy), 10000); // 100% allocation
        
        vm.stopPrank();
        
        // Fund users and test contract
        vm.startPrank(owner);
        usdt.transfer(user1, LARGE_AMOUNT);
        usdt.transfer(user2, LARGE_AMOUNT);
        usdt.transfer(address(this), LARGE_AMOUNT);
        // Also need to fund the orchestrator contracts
        usdt.transfer(address(orchestrator.nytToken()), LARGE_AMOUNT);
        vm.stopPrank();
    }
    
    function testOrchestratorDeployment() public view {
        assertEq(address(orchestrator.syVault()), address(syVault));
        assertEq(address(orchestrator.pytToken().syVault()), address(syVault));
        assertEq(address(orchestrator.nytToken().syVault()), address(syVault));
        assertTrue(address(orchestrator.forecaster()) != address(0));
    }
    
    function testYieldSplitting() public {
        vm.startPrank(user1);
        
        // Approve and deposit to SY vault first
        usdt.approve(address(syVault), TEST_AMOUNT);
        uint256 syShares = syVault.deposit(TEST_AMOUNT, user1);
        
        // Approve orchestrator for splitting
        syVault.approve(address(orchestrator), syShares);
        usdt.approve(address(orchestrator.nytToken()), TEST_AMOUNT);
        
        // Split yield into PYT + NYT
        orchestrator.splitYield(syShares, user1);
        
        
        // NEW ECONOMICS: PYT gets all SY shares, NYT gets full asset equivalent
        uint256 expectedPYTShares = syShares; // Full amount for yield generation
        uint256 expectedNYTAmount = syVault.previewRedeem(syShares); // Full asset equivalent
        
        assertEq(orchestrator.pytToken().balanceOf(user1), expectedPYTShares);
        assertEq(orchestrator.nytToken().balanceOf(user1), expectedNYTAmount);
        
        vm.stopPrank();
    }
    
    function testYieldRecombination() public {
        // First split
        testYieldSplitting();
        
        vm.startPrank(user1);
        
        uint256 pytBalance = orchestrator.pytToken().balanceOf(user1);
        uint256 nytBalance = orchestrator.nytToken().balanceOf(user1);
        
        // Approve orchestrator for recombination
        orchestrator.pytToken().approve(address(orchestrator), pytBalance);
        orchestrator.nytToken().approve(address(orchestrator), nytBalance);
        
        uint256 balanceBefore = syVault.balanceOf(user1);
        
        // Recombine
        orchestrator.recombineYield(pytBalance, user1);
        
        // Check SY shares recovered
        uint256 balanceAfter = syVault.balanceOf(user1);
        assertEq(balanceAfter - balanceBefore, pytBalance);
        
        // Check tokens burned
        assertEq(orchestrator.pytToken().balanceOf(user1), 0);
        assertEq(orchestrator.nytToken().balanceOf(user1), 0);
        
        vm.stopPrank();
    }
    
    function testYieldDistribution() public {
        // Setup split position
        testYieldSplitting();
        
        // Simulate yield generation
        vm.warp(block.timestamp + 1 days);
        
        // Manually generate some yield in the strategy
        vm.startPrank(address(syVault));
        deal(address(usdt), address(strategy), strategy.balanceOf() + 100e6); // Add 100 USDT yield
        vm.stopPrank();
        
        // Trigger distribution
        orchestrator.distributeYield();
        
        // Check that yield was distributed
        assertTrue(orchestrator.pytToken().pendingYield(user1) > 0);
    }
    
    function testNYTPrincipalProtection() public {
        vm.startPrank(user1);
        
        // First need to deposit to SY vault
        usdt.approve(address(syVault), TEST_AMOUNT);
        uint256 syShares = syVault.deposit(TEST_AMOUNT, user1);
        
        // Approve orchestrator for splitting
        syVault.approve(address(orchestrator), syShares);
        usdt.approve(address(orchestrator.nytToken()), TEST_AMOUNT);
        
        // Split to get NYT
        orchestrator.splitYield(syShares, user1);
        
        uint256 nytBalance = orchestrator.nytToken().balanceOf(user1);
        uint256 expectedNYTAmount = syVault.previewRedeem(syShares); // Full asset equivalent
        assertEq(nytBalance, expectedNYTAmount);
        
        // Check protection status
        (, uint256 principal,, bool protected, bool needsProtection, uint256 currentValue) = orchestrator.nytToken().getUserInfo(user1);
        assertEq(principal, expectedNYTAmount);
        assertTrue(protected);
        
        // Check maturity timestamp  
        (,, uint256 maturity,,,) = orchestrator.nytToken().getUserInfo(user1);
        assertEq(maturity, block.timestamp + 365 days);
        
        vm.stopPrank();
        
        // Test early redemption behavior
        vm.startPrank(user1);
        
        // This should revert, but let's see what actually happens
        try orchestrator.nytToken().redeem(nytBalance, user1) returns (uint256 recovered) {
            console.log("ERROR: Early redemption succeeded! Recovered:", recovered);
            assertTrue(false, "Early redemption should have reverted");
        } catch Error(string memory reason) {
            console.log("Early redemption correctly reverted with:", reason);
            assertEq(reason, "Not yet mature and no liquidation protection needed");
        }
        
        vm.stopPrank();
    }
    
    function testNYTMaturityRedemption() public {
        vm.startPrank(user1);
        
        // First need to deposit to SY vault and split
        usdt.approve(address(syVault), TEST_AMOUNT);
        uint256 syShares = syVault.deposit(TEST_AMOUNT, user1);
        
        syVault.approve(address(orchestrator), syShares);
        usdt.approve(address(orchestrator.nytToken()), TEST_AMOUNT);
        orchestrator.splitYield(syShares, user1);
        
        // Fast forward to maturity (1 year)
        vm.warp(block.timestamp + 365 days + 1);
        
        uint256 balanceBefore = usdt.balanceOf(user1);
        uint256 nytBalance = orchestrator.nytToken().balanceOf(user1);
        
        // Should be able to redeem after maturity
        orchestrator.nytToken().redeem(nytBalance, user1);
        
        uint256 balanceAfter = usdt.balanceOf(user1);
        assertTrue(balanceAfter > balanceBefore); // Should recover principal
        assertEq(orchestrator.nytToken().balanceOf(user1), 0);
        
        vm.stopPrank();
    }
    
    function testPYTYieldClaiming() public {
        // First disable auto-compounding for this test and lower threshold
        vm.startPrank(owner);
        orchestrator.setPYTAutoCompound(false);
        orchestrator.setPYTCompoundThreshold(1e6); // Lower threshold to ensure distribution
        vm.stopPrank();
        
        // Setup and generate yield
        testYieldDistribution();
        
        vm.startPrank(user1);
        
        uint256 pendingBefore = orchestrator.pytToken().pendingYield(user1);
        uint256 balanceBefore = usdt.balanceOf(user1);
        uint256 pytContractBalance = usdt.balanceOf(address(orchestrator.pytToken()));
        
        console.log("Pending yield:", pendingBefore);
        console.log("PYT contract USDT balance:", pytContractBalance);
        console.log("User USDT balance before:", balanceBefore);
        
        // Claim yield
        if (pendingBefore > 0) {
            orchestrator.pytToken().claimYield();
            
            uint256 balanceAfter = usdt.balanceOf(user1);
            assertTrue(balanceAfter > balanceBefore);
        }
        
        vm.stopPrank();
    }
    
    function testAutoCompounding() public {
        vm.startPrank(owner);
        
        // Enable auto-compounding on PYT through orchestrator
        orchestrator.setPYTAutoCompound(true);
        orchestrator.setPYTCompoundThreshold(50e18); // Lower threshold for testing
        
        vm.stopPrank();
        
        // Setup position
        testYieldSplitting();
        
        // Generate significant yield by adding USDT to strategy
        uint256 strategyBalanceBefore = strategy.balanceOf();
        console.log("Strategy balance before:", strategyBalanceBefore);
        deal(address(usdt), address(strategy), strategyBalanceBefore + 200e6); // Add 200 USDT yield
        console.log("Strategy balance after deal:", strategy.balanceOf());
        
        uint256 pytSupplyBefore = orchestrator.pytToken().totalSupply();
        
        // Wait for distribution interval to pass
        vm.warp(block.timestamp + 2 hours);
        
        // First trigger yield update in SY vault by calling a function that updates yield
        vm.startPrank(user1);
        // Force yield update by making a small deposit that will trigger _updateYield()
        usdt.approve(address(syVault), 100e6);
        syVault.deposit(100e6, user1);
        vm.stopPrank();
        
        // Trigger distribution (should auto-compound)
        orchestrator.distributeYield();
        
        // Verify auto-compounding effect
        (,, uint256 pytSupplyAfter, uint256 syBalance) = orchestrator.pytToken().getYieldInfo();
        console.log("PYT Supply After:", pytSupplyAfter);
        console.log("SY Balance:", syBalance);
        console.log("Strategy balance after deal:", strategy.balanceOf());
        console.log("SY vault total assets:", syVault.totalAssets());
        assertTrue(syBalance > pytSupplyAfter); // SY balance should be higher due to compounded yield
    }
    
    function testPortfolioAnalytics() public {
        // Setup position
        testYieldSplitting();
        
        // Get portfolio summary
        (
            uint256 totalSYShares,
            uint256 totalPYTSupply,
            uint256 totalNYTSupply,
            uint256 totalYieldEarned,
            uint256 currentAPY
        ) = orchestrator.getPortfolioSummary();
        
        assertTrue(totalSYShares > 0);
        assertTrue(totalPYTSupply > 0);
        assertTrue(totalNYTSupply > 0);
        assertTrue(currentAPY > 0);
    }
    
    function testUserPositionTracking() public {
        // Setup position
        testYieldSplitting();
        
        // Get user position
        (
            uint256 pytBalance,
            uint256 nytBalance,
            uint256 pendingYield,
            uint256 principalProtected,
            bool liquidationProtection
        ) = orchestrator.getUserPosition(user1);
        
        assertTrue(pytBalance > 0);
        assertTrue(nytBalance > 0);
        assertTrue(principalProtected > 0);
        assertTrue(liquidationProtection);
    }
    
    function testMultiUserSplitting() public {
        // User 1 splits
        vm.startPrank(user1);
        usdt.approve(address(syVault), TEST_AMOUNT);
        uint256 syShares1 = syVault.deposit(TEST_AMOUNT, user1);
        syVault.approve(address(orchestrator), syShares1);
        usdt.approve(address(orchestrator.nytToken()), TEST_AMOUNT);
        orchestrator.splitYield(syShares1, user1);
        vm.stopPrank();
        
        // User 2 splits  
        vm.startPrank(user2);
        usdt.approve(address(syVault), TEST_AMOUNT);
        uint256 syShares2 = syVault.deposit(TEST_AMOUNT, user2);
        syVault.approve(address(orchestrator), syShares2);
        usdt.approve(address(orchestrator.nytToken()), TEST_AMOUNT);
        orchestrator.splitYield(syShares2, user2);
        vm.stopPrank();
        
        // Check both users have positions
        assertTrue(orchestrator.pytToken().balanceOf(user1) > 0);
        assertTrue(orchestrator.pytToken().balanceOf(user2) > 0);
        assertTrue(orchestrator.nytToken().balanceOf(user1) > 0);
        assertTrue(orchestrator.nytToken().balanceOf(user2) > 0);
        
        // Check total tracking
        assertEq(orchestrator.totalSplit(), syShares1 + syShares2);
    }
    
    function testYieldForecastingIntegration() public {
        // Setup position
        testYieldSplitting();
        
        // Get yield forecast
        (
            uint256 projectedPYTYield,
            uint256 confidenceScore,
            uint256 minExpected,
            uint256 maxExpected
        ) = orchestrator.getYieldForecast(30 days);
        
        assertTrue(projectedPYTYield > 0);
        assertTrue(confidenceScore > 0);
        assertTrue(minExpected <= projectedPYTYield);
        assertTrue(maxExpected >= projectedPYTYield);
    }
    
    function testEmergencyFunctions() public {
        // Setup position
        testYieldSplitting();
        
        vm.startPrank(owner);
        
        // Test pause
        orchestrator.pause();
        assertTrue(orchestrator.paused());
        assertTrue(orchestrator.pytToken().paused());
        assertTrue(orchestrator.nytToken().paused());
        
        // Test emergency withdraw
        uint256 ownerBalanceBefore = syVault.balanceOf(owner);
        orchestrator.emergencyWithdraw();
        uint256 ownerBalanceAfter = syVault.balanceOf(owner);
        
        assertTrue(ownerBalanceAfter > ownerBalanceBefore);
        
        vm.stopPrank();
    }
    
    function testDistributionInterval() public {
        vm.startPrank(owner);
        
        uint256 newInterval = 2 hours;
        orchestrator.setDistributionInterval(newInterval);
        assertEq(orchestrator.distributionInterval(), newInterval);
        
        // Test bounds
        vm.expectRevert("Interval too short");
        orchestrator.setDistributionInterval(30 seconds);
        
        vm.expectRevert("Interval too long");
        orchestrator.setDistributionInterval(25 hours);
        
        vm.stopPrank();
    }
}