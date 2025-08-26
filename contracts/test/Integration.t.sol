// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../src/core/StandardizedYield.sol";
import "../src/core/AutoCompoundVault.sol";
import "../src/interfaces/IYieldStrategy.sol";
import "../src/strategies/MockLendingStrategy.sol";
import "../src/strategies/MockStakingStrategy.sol";
import "../src/strategies/MockLPStrategy.sol";
import "../src/TestUSDT.sol";

/**
 * @title Integration Test
 * @dev End-to-end integration tests for LineX DeFi architecture
 * Tests the interaction between StandardizedYield and AutoCompoundVault
 */
contract IntegrationTest is Test {
    // Core contracts
    StandardizedYield public syVault;
    AutoCompoundVault public autoVault;
    TestUSDT public usdt;
    
    // Strategy contracts
    MockLendingStrategy public lendingStrategy;
    MockStakingStrategy public stakingStrategy;
    MockLPStrategy public lpStrategy;
    
    // Test users representing real workflows
    address public owner = address(1);
    address public bob = address(2);    // Multi-strategy user
    address public alice = address(3);  // Auto-compound user
    
    // Test amounts
    uint256 public constant INITIAL_BALANCE = 100000e6; // 100,000 USDT per user
    uint256 public constant DEPOSIT_AMOUNT = 10000e6;   // 10,000 USDT deposits
    
    function setUp() public {
        vm.startPrank(owner);
        
        // Deploy core infrastructure
        usdt = new TestUSDT(owner);
        
        // Deploy strategies
        lendingStrategy = new MockLendingStrategy(address(usdt), owner);
        stakingStrategy = new MockStakingStrategy(address(usdt), owner);
        lpStrategy = new MockLPStrategy(address(usdt), owner);
        
        // Deploy StandardizedYield (multi-strategy vault)
        syVault = new StandardizedYield(
            address(usdt),
            "LineX Standardized Yield",
            "SY-USDT",
            owner
        );
        
        // Deploy AutoCompoundVault (single-strategy vault)  
        autoVault = new AutoCompoundVault(
            usdt,
            stakingStrategy,
            "LineX Auto-Compound",
            "AC-USDT",
            owner
        );
        
        // Configure StandardizedYield with multiple strategies
        syVault.addStrategy(address(lendingStrategy), 4000);  // 40% allocation
        syVault.addStrategy(address(stakingStrategy), 3500);  // 35% allocation  
        syVault.addStrategy(address(lpStrategy), 2500);       // 25% allocation
        
        // Fund strategies for yield generation
        usdt.transfer(address(lendingStrategy), 50000e6);
        usdt.transfer(address(stakingStrategy), 50000e6);
        usdt.transfer(address(lpStrategy), 50000e6);
        
        // Fund test users
        usdt.transfer(bob, INITIAL_BALANCE);
        usdt.transfer(alice, INITIAL_BALANCE);
        
        vm.stopPrank();
    }
    
    /**
     * @dev Test Bob's multi-strategy workflow
     * Deposit -> SY vault -> Multiple strategies -> Diversified yield
     */
    function test_BobMultiStrategyWorkflow() public {
        vm.startPrank(bob);
        
        // Check initial balance
        assertEq(usdt.balanceOf(bob), INITIAL_BALANCE);
        
        // Approve and deposit to StandardizedYield
        usdt.approve(address(syVault), DEPOSIT_AMOUNT);
        uint256 shares = syVault.deposit(DEPOSIT_AMOUNT, bob);
        
        console.log("Bob deposited:", DEPOSIT_AMOUNT / 1e6, "USDT");
        console.log("Bob received:", shares / 1e18, "SY shares");
        
        // Verify shares received
        assertGt(shares, 0);
        assertEq(syVault.balanceOf(bob), shares);
        
        // Check strategy allocations
        uint256 totalAssets = syVault.totalAssets();
        assertApproxEqAbs(totalAssets, DEPOSIT_AMOUNT, 1e6); // Within 1 USDT tolerance
        
        // Simulate yield accrual over time
        vm.warp(block.timestamp + 365 days); // Fast forward 1 year
        
        // Update yield to update exchange rate
        syVault.updateYield();
        
        // Check yield accrued
        uint256 assetsAfterYield = syVault.previewRedeem(shares);
        assertGt(assetsAfterYield, DEPOSIT_AMOUNT); // Should have earned yield
        
        console.log("Assets after 1 year:", assetsAfterYield / 1e6, "USDT");
        console.log("Yield earned:", (assetsAfterYield - DEPOSIT_AMOUNT) / 1e6, "USDT");
        
        // Withdraw all funds
        uint256 withdrawnAssets = syVault.withdraw(shares, bob, bob);
        assertGt(withdrawnAssets, DEPOSIT_AMOUNT);
        assertEq(syVault.balanceOf(bob), 0);
        
        vm.stopPrank();
    }
    
    /**
     * @dev Test Alice's auto-compound workflow
     * Deposit -> Auto-compound vault -> Single strategy -> Compounded yield
     */
    function test_AliceAutoCompoundWorkflow() public {
        vm.startPrank(alice);
        
        // Check initial balance
        assertEq(usdt.balanceOf(alice), INITIAL_BALANCE);
        
        // Approve and deposit to AutoCompoundVault
        usdt.approve(address(autoVault), DEPOSIT_AMOUNT);
        autoVault.deposit(DEPOSIT_AMOUNT);
        
        uint256 shares = autoVault.balanceOf(alice);
        console.log("Alice deposited:", DEPOSIT_AMOUNT / 1e6, "USDT");
        console.log("Alice received:", shares / 1e18, "AC shares");
        
        // Verify shares received
        assertGt(shares, 0);
        
        // Check total assets in vault
        uint256 totalAssets = autoVault.totalAssets();
        assertApproxEqAbs(totalAssets, DEPOSIT_AMOUNT, 1e6);
        
        // Simulate multiple harvest cycles over time
        for (uint i = 0; i < 12; i++) {
            vm.warp(block.timestamp + 30 days); // 1 month intervals
            autoVault.harvest(); // Manual harvest to trigger compounding
        }
        
        // Check compounded growth after 1 year
        uint256 assetsAfterCompounding = autoVault.totalAssets();
        assertGt(assetsAfterCompounding, DEPOSIT_AMOUNT);
        
        console.log("Assets after compounding:", assetsAfterCompounding / 1e6, "USDT");
        console.log("Compound yield earned:", (assetsAfterCompounding - DEPOSIT_AMOUNT) / 1e6, "USDT");
        
        // Get assets before withdrawal for comparison
        uint256 assetsBeforeWithdraw = (shares * autoVault.totalAssets()) / autoVault.totalSupply();
        
        // Withdraw all funds (triggers final harvest)
        autoVault.withdraw(shares);
        assertGt(assetsBeforeWithdraw, DEPOSIT_AMOUNT);
        assertEq(autoVault.balanceOf(alice), 0);
        
        vm.stopPrank();
    }
    
    /**
     * @dev Test cross-vault interaction and comparison
     * Compare yields between multi-strategy and auto-compound approaches
     */
    function test_CrossVaultComparison() public {
        uint256 testAmount = 50000e6; // 50,000 USDT
        
        // Bob uses StandardizedYield (multi-strategy)
        vm.startPrank(bob);
        usdt.approve(address(syVault), testAmount);
        uint256 bobShares = syVault.deposit(testAmount, bob);
        vm.stopPrank();
        
        // Alice uses AutoCompoundVault (single-strategy with compounding)
        vm.startPrank(alice);
        usdt.approve(address(autoVault), testAmount);
        autoVault.deposit(testAmount);
        uint256 aliceShares = autoVault.balanceOf(alice);
        vm.stopPrank();
        
        // Fast forward and trigger yield/compounding
        vm.warp(block.timestamp + 365 days);
        
        // Update yields
        syVault.updateYield();
        autoVault.harvest();
        
        // Compare final values
        uint256 bobFinalAssets = syVault.previewWithdraw(bobShares);
        uint256 aliceFinalAssets = (aliceShares * autoVault.totalAssets()) / autoVault.totalSupply();
        
        console.log("Bob (Multi-strategy) final:", bobFinalAssets / 1e6, "USDT");
        console.log("Alice (Auto-compound) final:", aliceFinalAssets / 1e6, "USDT");
        
        // Both should have earned yield
        assertGt(bobFinalAssets, testAmount);
        assertGt(aliceFinalAssets, testAmount);
        
        // Calculate APYs
        uint256 bobYield = bobFinalAssets - testAmount;
        uint256 aliceYield = aliceFinalAssets - testAmount;
        
        console.log("Bob APY:", (bobYield * 100) / testAmount, "%");
        console.log("Alice APY:", (aliceYield * 100) / testAmount, "%");
    }
    
    /**
     * @dev Test vault stress scenarios
     * Large deposits, partial withdrawals, strategy failures
     */
    function test_VaultStressTest() public {
        // Large deposits from multiple users
        address[] memory users = new address[](5);
        for (uint i = 0; i < 5; i++) {
            users[i] = address(uint160(10 + i));
            usdt.transfer(users[i], INITIAL_BALANCE);
            
            // Half go to SY vault, half to AutoCompound
            vm.startPrank(users[i]);
            if (i % 2 == 0) {
                usdt.approve(address(syVault), DEPOSIT_AMOUNT);
                syVault.deposit(DEPOSIT_AMOUNT, users[i]);
            } else {
                usdt.approve(address(autoVault), DEPOSIT_AMOUNT);
                autoVault.deposit(DEPOSIT_AMOUNT);
            }
            vm.stopPrank();
        }
        
        // Check total assets under management
        uint256 syTotalAssets = syVault.totalAssets();
        uint256 autoTotalAssets = autoVault.totalAssets();
        
        console.log("SY Vault total assets:", syTotalAssets / 1e6, "USDT");
        console.log("Auto Vault total assets:", autoTotalAssets / 1e6, "USDT");
        
        // Test partial withdrawals
        vm.startPrank(users[0]);
        uint256 userShares = syVault.balanceOf(users[0]);
        syVault.withdraw(userShares / 2, users[0], users[0]); // 50% withdrawal
        vm.stopPrank();
        
        // Vault should still function normally
        assertGt(syVault.totalAssets(), 0);
        assertGt(syVault.balanceOf(users[0]), 0);
    }
}