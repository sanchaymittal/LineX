// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../src/core/PYTNYTOrchestrator.sol";
import "../src/core/StandardizedYield.sol";
import "../src/strategies/MockLendingStrategy.sol";
import "../src/TestUSDT.sol";

contract IntegrationTest is Test {
    // Core contracts
    PYTNYTOrchestrator public orchestrator;
    StandardizedYield public syVault;
    MockLendingStrategy public strategy;
    TestUSDT public usdt;
    
    // Test users
    address public owner = address(1);
    address public alice = address(2);
    address public bob = address(3);
    address public charlie = address(4);
    
    // Test amounts
    uint256 public constant INITIAL_BALANCE = 100000e6; // 100,000 USDT per user
    uint256 public constant DEPOSIT_AMOUNT = 10000e6; // 10,000 USDT deposits
    
    function setUp() public {
        vm.startPrank(owner);
        
        // Deploy core infrastructure
        usdt = new TestUSDT(owner);
        strategy = new MockLendingStrategy(address(usdt), owner);
        syVault = new StandardizedYield(
            address(usdt),
            "SY-USDT",
            "SY-USDT",
            owner
        );
        orchestrator = new PYTNYTOrchestrator(syVault, owner);
        
        // Configure strategy
        syVault.addStrategy(address(strategy), 10000); // 100% allocation
        
        // Fund test users
        usdt.transfer(alice, INITIAL_BALANCE);
        usdt.transfer(bob, INITIAL_BALANCE);
        usdt.transfer(charlie, INITIAL_BALANCE);
        
        // Fund NYT backing
        usdt.transfer(address(orchestrator.nytToken()), INITIAL_BALANCE * 3);
        
        vm.stopPrank();
    }
    
    // Test 1: Complete user journey from deposit to yield claiming
    function testCompleteUserJourney() public {
        console.log("=== Complete User Journey Test ===");
        
        // Step 1: Alice deposits USDT to SY vault
        vm.startPrank(alice);
        console.log("Alice initial USDT:", usdt.balanceOf(alice));
        
        usdt.approve(address(syVault), DEPOSIT_AMOUNT);
        uint256 syShares = syVault.deposit(DEPOSIT_AMOUNT, alice);
        console.log("Alice received SY shares:", syShares);
        
        // Step 2: Alice splits SY into PYT + NYT
        syVault.approve(address(orchestrator), syShares);
        orchestrator.splitYield(syShares, alice);
        
        uint256 pytBalance = orchestrator.pytToken().balanceOf(alice);
        uint256 nytBalance = orchestrator.nytToken().balanceOf(alice);
        console.log("Alice PYT balance:", pytBalance);
        console.log("Alice NYT balance:", nytBalance);
        
        assertEq(pytBalance, syShares, "PYT should equal SY shares");
        assertEq(nytBalance, DEPOSIT_AMOUNT, "NYT should equal deposit amount");
        
        vm.stopPrank();
        
        // Step 3: Generate yield (admin action)
        vm.startPrank(owner);
        // Simulate 10% yield
        uint256 yieldAmount = DEPOSIT_AMOUNT / 10; // 1000 USDT
        deal(address(usdt), address(strategy), strategy.balanceOf() + yieldAmount);
        
        // Time passes
        vm.warp(block.timestamp + 2 hours);
        
        // Trigger yield distribution
        orchestrator.distributeYield();
        vm.stopPrank();
        
        // Step 4: Alice claims yield (may be partial due to available balance)
        vm.startPrank(alice);
        uint256 pendingYield = orchestrator.pytToken().pendingYield(alice);
        console.log("Alice pending yield:", pendingYield);
        assertTrue(pendingYield > 0, "Should have pending yield");
        
        uint256 balanceBefore = usdt.balanceOf(alice);
        if (pendingYield > 0) {
            orchestrator.pytToken().claimYield();
        }
        uint256 balanceAfter = usdt.balanceOf(alice);
        uint256 claimedYield = balanceAfter - balanceBefore;
        console.log("Alice claimed yield:", claimedYield);
        
        // Step 5: Alice recombines PYT + NYT
        // First need to update PYT balance after potential yield withdrawal
        pytBalance = orchestrator.pytToken().balanceOf(alice);
        
        orchestrator.pytToken().approve(address(orchestrator), pytBalance);
        orchestrator.nytToken().approve(address(orchestrator), nytBalance);
        
        uint256 syBefore = syVault.balanceOf(alice);
        if (pytBalance > 0 && nytBalance > 0) {
            orchestrator.recombineYield(pytBalance, alice);
        }
        uint256 syAfter = syVault.balanceOf(alice);
        console.log("Alice recovered SY shares:", syAfter - syBefore);
        
        // Step 6: Alice withdraws from SY vault
        uint256 finalAssets = syVault.withdraw(syAfter, alice, alice);
        console.log("Alice final USDT from withdrawal:", finalAssets);
        console.log("Alice total USDT balance:", usdt.balanceOf(alice));
        
        vm.stopPrank();
    }
    
    // Test 2: Multi-user yield distribution
    function testMultiUserYieldDistribution() public {
        console.log("=== Multi-User Yield Distribution Test ===");
        
        // All users deposit and split
        uint256[] memory syShares = new uint256[](3);
        address[3] memory users = [alice, bob, charlie];
        uint256[3] memory deposits = [DEPOSIT_AMOUNT, DEPOSIT_AMOUNT * 2, DEPOSIT_AMOUNT / 2];
        
        for (uint i = 0; i < users.length; i++) {
            vm.startPrank(users[i]);
            
            usdt.approve(address(syVault), deposits[i]);
            syShares[i] = syVault.deposit(deposits[i], users[i]);
            
            syVault.approve(address(orchestrator), syShares[i]);
            orchestrator.splitYield(syShares[i], users[i]);
            
            console.log(
                string.concat("User ", vm.toString(i), " PYT:"),
                orchestrator.pytToken().balanceOf(users[i])
            );
            
            vm.stopPrank();
        }
        
        // Generate significant yield
        vm.startPrank(owner);
        
        // Disable auto-compound BEFORE distribution for clearer yield distribution
        orchestrator.setPYTAutoCompound(false);
        orchestrator.setPYTCompoundThreshold(1e6); // Very low threshold
        
        uint256 totalYield = (deposits[0] + deposits[1] + deposits[2]) * 20 / 100; // 20% yield
        deal(address(usdt), address(strategy), strategy.balanceOf() + totalYield);
        
        // Force SY vault to update its exchange rate
        vm.stopPrank();
        vm.startPrank(alice);
        usdt.approve(address(syVault), 1e6);
        syVault.deposit(1e6, alice); // Small deposit to trigger update
        vm.stopPrank();
        
        vm.startPrank(owner);
        vm.warp(block.timestamp + 2 hours);
        orchestrator.distributeYield();
        vm.stopPrank();
        
        // Check proportional yield distribution
        for (uint i = 0; i < users.length; i++) {
            uint256 pending = orchestrator.pytToken().pendingYield(users[i]);
            uint256 expectedYield = (totalYield * deposits[i]) / (deposits[0] + deposits[1] + deposits[2]);
            
            console.log(
                string.concat("User ", vm.toString(i), " pending yield:"),
                pending
            );
            
            // Allow 1% deviation due to rounding
            assertApproxEqRel(pending, expectedYield, 0.01e18, "Yield distribution should be proportional");
        }
    }
    
    // Test 3: Auto-compounding vs manual claiming
    function testAutoCompoundingVsManualClaiming() public {
        console.log("=== Auto-Compounding vs Manual Claiming Test ===");
        
        // Alice uses auto-compounding, Bob claims manually
        address[2] memory users = [alice, bob];
        
        // Both deposit same amount
        for (uint i = 0; i < 2; i++) {
            vm.startPrank(users[i]);
            usdt.approve(address(syVault), DEPOSIT_AMOUNT);
            uint256 shares = syVault.deposit(DEPOSIT_AMOUNT, users[i]);
            syVault.approve(address(orchestrator), shares);
            orchestrator.splitYield(shares, users[i]);
            vm.stopPrank();
        }
        
        // Enable auto-compound (default) for Alice, disable for Bob
        vm.startPrank(owner);
        orchestrator.setPYTAutoCompound(true);
        orchestrator.setPYTCompoundThreshold(100e6); // Low threshold
        vm.stopPrank();
        
        // Generate yield multiple times
        for (uint round = 0; round < 3; round++) {
            console.log("=== Yield Round", round + 1, "===");
            
            vm.startPrank(owner);
            // 5% yield per round
            uint256 roundYield = (DEPOSIT_AMOUNT * 2) * 5 / 100;
            deal(address(usdt), address(strategy), strategy.balanceOf() + roundYield);
            vm.warp(block.timestamp + 2 hours);
            
            // For Bob's manual claiming in round 2
            if (round == 1) {
                orchestrator.setPYTAutoCompound(false);
            } else {
                orchestrator.setPYTAutoCompound(true);
            }
            
            orchestrator.distributeYield();
            vm.stopPrank();
            
            // Bob claims yield manually in round 2
            if (round == 1) {
                vm.startPrank(bob);
                uint256 pending = orchestrator.pytToken().pendingYield(bob);
                console.log("Bob claiming yield:", pending);
                if (pending > 0) {
                    orchestrator.pytToken().claimYield();
                }
                vm.stopPrank();
            }
            
            // Check balances
            (,, uint256 alicePytValue, uint256 aliceSyValue) = orchestrator.pytToken().getYieldInfo();
            console.log("Alice PYT value (auto-compound):", aliceSyValue);
            console.log("Bob USDT balance:", usdt.balanceOf(bob));
        }
        
        // Final comparison
        console.log("=== Final Comparison ===");
        uint256 alicePending = orchestrator.pytToken().pendingYield(alice);
        uint256 bobPending = orchestrator.pytToken().pendingYield(bob);
        console.log("Alice final pending:", alicePending);
        console.log("Bob final pending:", bobPending);
    }
    
    // Test 4: NYT maturity and liquidation protection
    function testNYTMaturityAndProtection() public {
        console.log("=== NYT Maturity and Protection Test ===");
        
        // Alice gets NYT tokens
        vm.startPrank(alice);
        usdt.approve(address(syVault), DEPOSIT_AMOUNT);
        uint256 syShares = syVault.deposit(DEPOSIT_AMOUNT, alice);
        syVault.approve(address(orchestrator), syShares);
        orchestrator.splitYield(syShares, alice);
        
        uint256 nytBalance = orchestrator.nytToken().balanceOf(alice);
        console.log("Alice NYT balance:", nytBalance);
        
        // Check protection status
        (,, uint256 maturity, bool protected, bool needsProtection,) = 
            orchestrator.nytToken().getUserInfo(alice);
        console.log("Maturity timestamp:", maturity);
        console.log("Protected:", protected);
        console.log("Needs protection:", needsProtection);
        
        // Test early redemption (should fail)
        try orchestrator.nytToken().redeem(nytBalance, alice) returns (uint256) {
            revert("Early redemption should have failed");
        } catch Error(string memory reason) {
            assertEq(reason, "Not yet mature and no liquidation protection needed");
            console.log("Early redemption correctly blocked");
        }
        
        // Fast forward to maturity
        vm.warp(maturity + 1);
        console.log("Time warped to maturity");
        
        // Now redemption should work
        uint256 balanceBefore = usdt.balanceOf(alice);
        uint256 redeemed = orchestrator.nytToken().redeem(nytBalance, alice);
        uint256 balanceAfter = usdt.balanceOf(alice);
        
        console.log("Redeemed amount:", redeemed);
        console.log("USDT received:", balanceAfter - balanceBefore);
        assertEq(redeemed, nytBalance, "Should redeem full NYT balance");
        
        vm.stopPrank();
    }
    
    // Test 5: Edge cases and failure scenarios
    function testEdgeCasesAndFailures() public {
        console.log("=== Edge Cases and Failure Scenarios Test ===");
        
        // Test 1: Zero deposits
        vm.startPrank(alice);
        vm.expectRevert("Cannot deposit 0 assets");
        syVault.deposit(0, alice);
        console.log("[PASS] Zero deposit rejected");
        
        // Test 2: Insufficient balance for splitting
        vm.expectRevert(); // OpenZeppelin v5 uses different error format
        orchestrator.splitYield(1000e6, alice); // No SY shares
        console.log("[PASS] Split without SY shares rejected");
        
        // Normal deposit for further tests
        usdt.approve(address(syVault), DEPOSIT_AMOUNT);
        uint256 syShares = syVault.deposit(DEPOSIT_AMOUNT, alice);
        syVault.approve(address(orchestrator), syShares);
        orchestrator.splitYield(syShares, alice);
        vm.stopPrank();
        
        // Test 3: Double splitting (should fail)
        vm.startPrank(alice);
        vm.expectRevert();
        orchestrator.splitYield(syShares, alice); // Already split
        console.log("[PASS] Double split rejected");
        vm.stopPrank();
        
        // Test 4: Recombination with mismatched amounts
        vm.startPrank(alice);
        uint256 pytBalance = orchestrator.pytToken().balanceOf(alice);
        orchestrator.pytToken().approve(address(orchestrator), pytBalance);
        orchestrator.nytToken().approve(address(orchestrator), 1); // Wrong amount
        
        vm.expectRevert("Insufficient NYT allowance");
        orchestrator.recombineYield(pytBalance, alice);
        console.log("[PASS] Mismatched recombination rejected");
        vm.stopPrank();
        
        // Test 5: Unauthorized operations
        vm.startPrank(bob);
        vm.expectRevert();
        orchestrator.pause(); // Only owner
        console.log("[PASS] Unauthorized pause rejected");
        
        vm.expectRevert();
        orchestrator.setPYTAutoCompound(false); // Only owner
        console.log("[PASS] Unauthorized settings change rejected");
        vm.stopPrank();
    }
    
    // Test 6: Gas optimization check
    function testGasOptimization() public {
        console.log("=== Gas Optimization Test ===");
        
        uint256 gasStart;
        uint256 gasEnd;
        
        vm.startPrank(alice);
        usdt.approve(address(syVault), DEPOSIT_AMOUNT * 10);
        
        // Measure deposit gas
        gasStart = gasleft();
        uint256 syShares = syVault.deposit(DEPOSIT_AMOUNT, alice);
        gasEnd = gasleft();
        console.log("Deposit gas:", gasStart - gasEnd);
        
        // Measure split gas
        syVault.approve(address(orchestrator), syShares);
        gasStart = gasleft();
        orchestrator.splitYield(syShares, alice);
        gasEnd = gasleft();
        console.log("Split gas:", gasStart - gasEnd);
        
        vm.stopPrank();
        
        // Generate yield
        vm.startPrank(owner);
        deal(address(usdt), address(strategy), strategy.balanceOf() + 1000e6);
        vm.warp(block.timestamp + 2 hours);
        
        // Measure distribution gas
        gasStart = gasleft();
        orchestrator.distributeYield();
        gasEnd = gasleft();
        console.log("Distribution gas:", gasStart - gasEnd);
        vm.stopPrank();
        
        // Measure claim gas
        vm.startPrank(alice);
        gasStart = gasleft();
        orchestrator.pytToken().claimYield();
        gasEnd = gasleft();
        console.log("Claim gas:", gasStart - gasEnd);
        
        // Measure recombine gas
        // Update balances after claiming
        uint256 pytBalance = orchestrator.pytToken().balanceOf(alice);
        uint256 nytBalance = orchestrator.nytToken().balanceOf(alice);
        
        if (pytBalance > 0 && nytBalance > 0) {
            orchestrator.pytToken().approve(address(orchestrator), pytBalance);
            orchestrator.nytToken().approve(address(orchestrator), nytBalance);
            
            gasStart = gasleft();
            orchestrator.recombineYield(pytBalance, alice);
            gasEnd = gasleft();
            console.log("Recombine gas:", gasStart - gasEnd);
        } else {
            console.log("Skipping recombine - insufficient balances");
        }
        
        vm.stopPrank();
    }
    
    // Test 7: Stress test with many users
    function testStressTestManyUsers() public {
        console.log("=== Stress Test with Many Users ===");
        
        uint256 numUsers = 50;
        address[] memory testUsers = new address[](numUsers);
        
        // Fund the owner with enough USDT for all test users
        vm.startPrank(owner);
        deal(address(usdt), owner, DEPOSIT_AMOUNT * numUsers * 2); // Extra for safety
        
        // Create and fund users
        for (uint i = 0; i < numUsers; i++) {
            testUsers[i] = address(uint160(1000 + i));
            usdt.transfer(testUsers[i], DEPOSIT_AMOUNT);
        }
        vm.stopPrank();
        
        // All users deposit and split
        for (uint i = 0; i < numUsers; i++) {
            vm.startPrank(testUsers[i]);
            usdt.approve(address(syVault), DEPOSIT_AMOUNT);
            uint256 shares = syVault.deposit(DEPOSIT_AMOUNT, testUsers[i]);
            syVault.approve(address(orchestrator), shares);
            orchestrator.splitYield(shares, testUsers[i]);
            vm.stopPrank();
        }
        
        console.log("All", numUsers, "users deposited and split");
        
        // Generate yield
        vm.startPrank(owner);
        uint256 totalDeposits = DEPOSIT_AMOUNT * numUsers;
        uint256 yieldAmount = totalDeposits * 15 / 100; // 15% yield
        deal(address(usdt), address(strategy), strategy.balanceOf() + yieldAmount);
        
        vm.warp(block.timestamp + 2 hours);
        uint256 gasStart = gasleft();
        orchestrator.distributeYield();
        uint256 gasEnd = gasleft();
        console.log("Distribution gas for", numUsers, "users:", gasStart - gasEnd);
        vm.stopPrank();
        
        // Sample check: first and last user yields
        uint256 firstUserYield = orchestrator.pytToken().pendingYield(testUsers[0]);
        uint256 lastUserYield = orchestrator.pytToken().pendingYield(testUsers[numUsers-1]);
        console.log("First user pending yield:", firstUserYield);
        console.log("Last user pending yield:", lastUserYield);
        
        assertEq(firstUserYield, lastUserYield, "All users should have equal yield");
    }
}