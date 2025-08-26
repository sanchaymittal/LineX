// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/core/StandardizedYield.sol";

/**
 * @title Deploy StandardizedYield 
 * @notice Deploys the StandardizedYield contract (multi-strategy wrapper)
 */
contract DeploySY is Script {
    // Known contract addresses
    address constant USDT_ADDRESS = 0xb5Ad080243b3de7ee561F3D85AD3521C3238D0eb;
    
    // Mock strategy addresses (deployed in previous step)
    address constant MOCK_LENDING_STRATEGY = 0x0a3FFc636d13fDC90D5cd6a305Fbd2Cff8d07115;
    address constant MOCK_STAKING_STRATEGY = 0x44d2624dD1925875bD35d68185B49d2d0c90430B;
    address constant MOCK_LP_STRATEGY = 0x373AE28C9e5b9D2426ECEb36B0C18CB7d0CCEB91;
    
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);
        
        console.log("Deploying StandardizedYield...");
        console.log("USDT Address:", USDT_ADDRESS);
        console.log("Deployer Address:", deployer);
        
        // Deploy StandardizedYield
        StandardizedYield sy = new StandardizedYield(
            USDT_ADDRESS,
            "LineX Standardized Yield",
            "SY-USDT",
            deployer // deployer as owner
        );
        console.log("StandardizedYield deployed at:", address(sy));
        
        // Add strategies with allocations
        console.log("\nAdding strategies to SY...");
        
        // 40% to lending (safest)
        sy.addStrategy(MOCK_LENDING_STRATEGY, 4000);
        console.log("Added MockLendingStrategy with 40% allocation");
        
        // 35% to staking (medium risk)
        sy.addStrategy(MOCK_STAKING_STRATEGY, 3500);  
        console.log("Added MockStakingStrategy with 35% allocation");
        
        // 25% to LP (highest risk/reward)
        sy.addStrategy(MOCK_LP_STRATEGY, 2500);
        console.log("Added MockLPStrategy with 25% allocation");
        
        vm.stopBroadcast();
        
        console.log("\n=== StandardizedYield Deployment Summary ===");
        console.log("StandardizedYield:", address(sy));
        console.log("Name:", "LineX Standardized Yield");
        console.log("Symbol:", "SY-USDT");
        console.log("Underlying Asset:", USDT_ADDRESS);
        console.log("\nStrategy Allocations:");
        console.log("- MockLendingStrategy: 40% (10% APY)");
        console.log("- MockStakingStrategy: 35% (8% APY)");
        console.log("- MockLPStrategy: 25% (12% volatile APY)");
        console.log("Expected Blended APY: ~9.5%");
    }
}