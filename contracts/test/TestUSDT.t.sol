// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/TestUSDT.sol";

/**
 * @title TestUSDT Test
 * @dev Basic tests for TestUSDT token functionality
 */
contract TestUSDTTest is Test {
    TestUSDT public testUSDT;
    address public owner;
    address public user1;
    address public user2;
    
    uint256 public constant INITIAL_SUPPLY = 1_000_000 * 10**6; // 1M USDT
    
    function setUp() public {
        owner = address(this);
        user1 = address(0x1);
        user2 = address(0x2);
        
        testUSDT = new TestUSDT(owner);
    }
    
    function test_InitialSetup() public {
        assertEq(testUSDT.name(), "Test USDT");
        assertEq(testUSDT.symbol(), "USDT");
        assertEq(testUSDT.decimals(), 6);
        assertEq(testUSDT.totalSupply(), INITIAL_SUPPLY);
        assertEq(testUSDT.balanceOf(owner), INITIAL_SUPPLY);
        assertEq(testUSDT.owner(), owner);
    }
    
    function test_TokenTransfer() public {
        uint256 transferAmount = 1000 * 10**6; // 1000 USDT
        
        testUSDT.transfer(user1, transferAmount);
        
        assertEq(testUSDT.balanceOf(user1), transferAmount);
        assertEq(testUSDT.balanceOf(owner), INITIAL_SUPPLY - transferAmount);
    }
    
    function test_TokenApproval() public {
        uint256 approvalAmount = 500 * 10**6; // 500 USDT
        
        testUSDT.approve(user1, approvalAmount);
        assertEq(testUSDT.allowance(owner, user1), approvalAmount);
        
        // Test transferFrom
        vm.prank(user1);
        testUSDT.transferFrom(owner, user2, approvalAmount);
        
        assertEq(testUSDT.balanceOf(user2), approvalAmount);
        assertEq(testUSDT.allowance(owner, user1), 0);
    }
    
    function test_Minting() public {
        uint256 mintAmount = 10000 * 10**6; // 10,000 USDT
        
        testUSDT.mint(user1, mintAmount);
        
        assertEq(testUSDT.balanceOf(user1), mintAmount);
        assertEq(testUSDT.totalSupply(), INITIAL_SUPPLY + mintAmount);
    }
    
    function test_Burning() public {
        uint256 burnAmount = 1000 * 10**6; // 1,000 USDT
        
        // First transfer some tokens to burn
        testUSDT.transfer(user1, burnAmount);
        
        // Burn from user1
        vm.prank(user1);
        testUSDT.burn(burnAmount);
        
        assertEq(testUSDT.balanceOf(user1), 0);
        assertEq(testUSDT.totalSupply(), INITIAL_SUPPLY - burnAmount);
    }
    
    function test_PausingFunctionality() public {
        uint256 transferAmount = 100 * 10**6; // 100 USDT
        
        // Pause the contract
        testUSDT.pause();
        
        // Try to transfer while paused - should fail
        vm.expectRevert();
        testUSDT.transfer(user1, transferAmount);
        
        // Unpause and try again
        testUSDT.unpause();
        testUSDT.transfer(user1, transferAmount);
        
        assertEq(testUSDT.balanceOf(user1), transferAmount);
    }
    
    function test_OnlyOwnerFunctions() public {
        vm.prank(user1);
        vm.expectRevert();
        testUSDT.mint(user2, 1000);
        
        vm.prank(user1);  
        vm.expectRevert();
        testUSDT.pause();
    }
    
    function test_ERC20PermitFunctionality() public {
        // Test permit functionality exists (basic check)
        assertEq(testUSDT.nonces(owner), 0);
        
        // Domain separator should be set
        bytes32 domainSep = testUSDT.DOMAIN_SEPARATOR();
        assertGt(uint256(domainSep), 0);
    }
}