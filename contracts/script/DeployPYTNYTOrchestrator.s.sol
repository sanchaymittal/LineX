// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/core/PYTNYTOrchestrator.sol";

/**
 * @title Deploy PYTNYTOrchestrator 
 * @notice Deploys PYTNYTOrchestrator with correct USDT address to match other contracts
 */
contract DeployPYTNYTOrchestrator is Script {
    // Correct contract addresses to match other deployed contracts
    address constant USDT_ADDRESS = 0x2d889aAAD5F81e9eBc4D14630d7C14F1CE6878dD;
    address constant STANDARDIZED_YIELD = 0x6A291219e8e83192f841cB577ebA20932808Fb45;
    
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);
        
        console.log("Deploying PYTNYTOrchestrator...");
        console.log("USDT Address:", USDT_ADDRESS);
        console.log("StandardizedYield Address:", STANDARDIZED_YIELD);
        console.log("Deployer Address:", deployer);
        
        // Deploy PYTNYTOrchestrator with correct SY vault
        PYTNYTOrchestrator orchestrator = new PYTNYTOrchestrator(
            ISY(STANDARDIZED_YIELD),
            deployer // deployer as owner
        );
        console.log("PYTNYTOrchestrator deployed at:", address(orchestrator));
        
        // Verify asset compatibility
        console.log("\nVerifying asset compatibility...");
        console.log("Orchestrator base asset:", orchestrator.syVault().asset());
        console.log("Expected USDT address:", USDT_ADDRESS);
        
        // Get token addresses
        console.log("\nPYT/NYT Token addresses:");
        console.log("PYT Token:", address(orchestrator.pytToken()));
        console.log("NYT Token:", address(orchestrator.nytToken()));
        
        vm.stopBroadcast();
        
        console.log("\n=== PYTNYTOrchestrator Deployment Summary ===");
        console.log("PYTNYTOrchestrator:", address(orchestrator));
        console.log("SY Vault:", address(orchestrator.syVault()));
        console.log("Base Asset:", orchestrator.syVault().asset());
        console.log("PYT Token:", address(orchestrator.pytToken()));
        console.log("NYT Token:", address(orchestrator.nytToken()));
        console.log("Forecaster:", address(orchestrator.forecaster()));
        console.log("\nFeatures:");
        console.log("- Splits SY vault positions into PYT/NYT tokens");
        console.log("- PYT: Claims all future yield from SY positions");  
        console.log("- NYT: Principal protection until maturity");
        console.log("- Compatible with YieldSet via wrapper");
        console.log("- Uses correct USDT address for integration");
    }
}