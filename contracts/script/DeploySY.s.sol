// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/core/StandardizedYield.sol";

/**
 * @title Deploy StandardizedYield 
 * @notice Deploys the StandardizedYield contract (multi-strategy wrapper)
 */
contract DeploySY is Script {
    // Contract addresses - UPDATED WITH FRESH DEPLOYMENT
    address constant USDT_ADDRESS = 0x0692640d5565735C67fcB40f45251DD5D3f8fb9f; // Fresh TestUSDT deployment
    
    // Mock strategy addresses - UPDATED WITH FRESH DEPLOYMENT  
    address constant MOCK_LENDING_STRATEGY = 0xbaf58d8208137598fB9AcFbA6737554A12B42BD0; // Fresh MockLendingStrategy
    address constant MOCK_STAKING_STRATEGY = 0x9A4d5239fC2257717d886f64632B3884839F055C; // Fresh MockStakingStrategy
    address constant MOCK_LP_STRATEGY = 0xaCe325ba665D6c579b0A8786A71525ad855b3De7; // Fresh MockLPStrategy
    
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
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