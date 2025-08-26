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
    address constant USDT_ADDRESS = 0x2d889aAAD5F81e9eBc4D14630d7C14F1CE6878dD;
    
    // Mock strategy addresses (deployed in previous step)
    address constant MOCK_LENDING_STRATEGY = 0xDd8E7722166F6A4F900BC04f33e20F4bF8595425;
    address constant MOCK_STAKING_STRATEGY = 0xd5D473398759891Cd5059e8a54c02F1312dA79Ef;
    address constant MOCK_LP_STRATEGY = 0x87dd2e3f84767660e63d08623cEfCf60FDF0500C;
    
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