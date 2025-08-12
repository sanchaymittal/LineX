// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/TestUSDT.sol";

contract TestUSDTTest is Test {
    TestUSDT public testUSDT;
    address public owner;
    address public user1;
    address public user2;
    
    uint256 constant INITIAL_SUPPLY = 1_000_000 * 10**6; // 1M USDT
    uint256 constant FAUCET_AMOUNT = 100 * 10**6; // 100 USDT
    uint256 constant FAUCET_COOLDOWN = 24 hours;

    function setUp() public {
        owner = address(this);
        user1 = address(0x1);
        user2 = address(0x2);
        
        testUSDT = new TestUSDT(owner);
    }

    function test_InitialState() public {
        assertEq(testUSDT.name(), "Test USDT");
        assertEq(testUSDT.symbol(), "USDT");
        assertEq(testUSDT.decimals(), 6);
        assertEq(testUSDT.totalSupply(), INITIAL_SUPPLY);
        assertEq(testUSDT.balanceOf(owner), INITIAL_SUPPLY);
        assertEq(testUSDT.owner(), owner);
        assertEq(testUSDT.getFormattedTotalSupply(), 1_000_000);
    }

    function test_FaucetClaim() public {
        vm.prank(user1);
        testUSDT.faucet();
        
        assertEq(testUSDT.balanceOf(user1), FAUCET_AMOUNT);
        assertEq(testUSDT.getFormattedBalance(user1), 100);
        assertEq(testUSDT.lastFaucetClaim(user1), block.timestamp);
    }

    function test_FaucetCooldown() public {
        // First claim
        vm.prank(user1);
        testUSDT.faucet();
        
        // Try to claim again immediately - should fail
        vm.prank(user1);
        vm.expectRevert("TestUSDT: Faucet cooldown active");
        testUSDT.faucet();
        
        // Fast forward time and claim again
        vm.warp(block.timestamp + FAUCET_COOLDOWN);
        vm.prank(user1);
        testUSDT.faucet();
        
        assertEq(testUSDT.balanceOf(user1), FAUCET_AMOUNT * 2);
    }

    function test_CanUseFaucet() public {
        // Initially can use faucet
        (bool canClaim, uint256 timeLeft) = testUSDT.canUseFaucet(user1);
        assertTrue(canClaim);
        assertEq(timeLeft, 0);
        
        // After claiming, cannot use immediately
        vm.prank(user1);
        testUSDT.faucet();
        
        (canClaim, timeLeft) = testUSDT.canUseFaucet(user1);
        assertFalse(canClaim);
        assertEq(timeLeft, FAUCET_COOLDOWN);
        
        // After cooldown, can use again
        vm.warp(block.timestamp + FAUCET_COOLDOWN);
        (canClaim, timeLeft) = testUSDT.canUseFaucet(user1);
        assertTrue(canClaim);
        assertEq(timeLeft, 0);
    }

    function test_Mint() public {
        uint256 mintAmount = 1000 * 10**6; // 1000 USDT
        
        testUSDT.mint(user1, mintAmount);
        
        assertEq(testUSDT.balanceOf(user1), mintAmount);
        assertEq(testUSDT.totalSupply(), INITIAL_SUPPLY + mintAmount);
    }

    function test_MintOnlyOwner() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user1));
        testUSDT.mint(user2, 1000 * 10**6);
    }

    function test_EmergencyMint() public {
        uint256 usdtAmount = 500; // 500 USDT
        uint256 expectedAmount = usdtAmount * 10**6;
        
        testUSDT.emergencyMint(user1, usdtAmount);
        
        assertEq(testUSDT.balanceOf(user1), expectedAmount);
        assertEq(testUSDT.getFormattedBalance(user1), usdtAmount);
    }

    function test_Transfer() public {
        uint256 transferAmount = 1000 * 10**6;
        
        testUSDT.transfer(user1, transferAmount);
        assertEq(testUSDT.balanceOf(user1), transferAmount);
        assertEq(testUSDT.balanceOf(owner), INITIAL_SUPPLY - transferAmount);
    }

    function test_Approve() public {
        uint256 approveAmount = 500 * 10**6;
        
        testUSDT.approve(user1, approveAmount);
        assertEq(testUSDT.allowance(owner, user1), approveAmount);
    }

    function test_TransferFrom() public {
        uint256 amount = 200 * 10**6;
        
        // Approve user1 to spend tokens
        testUSDT.approve(user1, amount);
        
        // user1 transfers from owner to user2
        vm.prank(user1);
        testUSDT.transferFrom(owner, user2, amount);
        
        assertEq(testUSDT.balanceOf(user2), amount);
        assertEq(testUSDT.balanceOf(owner), INITIAL_SUPPLY - amount);
        assertEq(testUSDT.allowance(owner, user1), 0);
    }

    function test_Burn() public {
        uint256 burnAmount = 100 * 10**6;
        
        testUSDT.burn(burnAmount);
        
        assertEq(testUSDT.balanceOf(owner), INITIAL_SUPPLY - burnAmount);
        assertEq(testUSDT.totalSupply(), INITIAL_SUPPLY - burnAmount);
    }

    function test_BurnFrom() public {
        uint256 burnAmount = 50 * 10**6;
        
        // Give tokens to user1
        testUSDT.transfer(user1, burnAmount);
        
        // user1 approves owner to burn tokens
        vm.prank(user1);
        testUSDT.approve(owner, burnAmount);
        
        // Owner burns from user1
        testUSDT.burnFrom(user1, burnAmount);
        
        assertEq(testUSDT.balanceOf(user1), 0);
        assertEq(testUSDT.totalSupply(), INITIAL_SUPPLY - burnAmount);
    }

    function test_Pause() public {
        testUSDT.pause();
        assertTrue(testUSDT.paused());
        
        // Transfers should fail when paused
        vm.expectRevert(abi.encodeWithSelector(Pausable.EnforcedPause.selector));
        testUSDT.transfer(user1, 100);
        
        // Faucet should fail when paused
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(Pausable.EnforcedPause.selector));
        testUSDT.faucet();
    }

    function test_Unpause() public {
        testUSDT.pause();
        testUSDT.unpause();
        assertFalse(testUSDT.paused());
        
        // Transfers should work after unpause
        testUSDT.transfer(user1, 100);
        assertEq(testUSDT.balanceOf(user1), 100);
    }

    function test_PauseOnlyOwner() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user1));
        testUSDT.pause();
    }

    function test_Events() public {
        // Test Minted event
        vm.expectEmit(true, false, false, true);
        emit TestUSDT.Minted(user1, 1000 * 10**6);
        testUSDT.mint(user1, 1000 * 10**6);
        
        // Test FaucetClaimed event
        vm.expectEmit(true, false, false, true);
        emit TestUSDT.FaucetClaimed(user1, FAUCET_AMOUNT);
        vm.prank(user1);
        testUSDT.faucet();
        
        // Test EmergencyMint event
        vm.expectEmit(true, false, false, true);
        emit TestUSDT.EmergencyMint(user2, 500 * 10**6);
        testUSDT.emergencyMint(user2, 500);
    }
}