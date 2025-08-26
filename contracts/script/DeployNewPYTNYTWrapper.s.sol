// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/strategies/PYTNYTOrchestratorWrapper.sol";

/**
 * @title Deploy New PYTNYTOrchestratorWrapper
 * @notice Deploys wrapper for new PYTNYTOrchestrator with correct USDT address
 */
contract DeployNewPYTNYTWrapper is Script {
    // New PYTNYTOrchestrator with correct USDT address
    address constant NEW_PYT_NYT_ORCHESTRATOR = 0xfA21739267aFCF83C8c1bBb12846e3E74678a969;
    
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);
        
        console.log("Deploying New PYTNYTOrchestratorWrapper...");
        console.log("New PYTNYTOrchestrator Address:", NEW_PYT_NYT_ORCHESTRATOR);
        console.log("Deployer Address:", deployer);
        
        // Deploy new PYTNYTOrchestratorWrapper
        PYTNYTOrchestratorWrapper newWrapper = new PYTNYTOrchestratorWrapper(
            NEW_PYT_NYT_ORCHESTRATOR,
            deployer
        );
        console.log("New PYTNYTOrchestratorWrapper deployed at:", address(newWrapper));
        
        // Verify asset compatibility
        console.log("\nVerifying asset compatibility...");
        console.log("Wrapper asset:", newWrapper.asset());
        console.log("Expected USDT:", 0x2d889aAAD5F81e9eBc4D14630d7C14F1CE6878dD);
        
        vm.stopBroadcast();
        
        console.log("\n=== New PYTNYTOrchestratorWrapper Summary ===");
        console.log("New PYTNYTOrchestratorWrapper:", address(newWrapper));
        console.log("Wraps:", NEW_PYT_NYT_ORCHESTRATOR);
        console.log("Asset:", newWrapper.asset());
        console.log("Risk Level: 6 (Medium-High)");
        console.log("Now compatible with YieldSet!");
    }
}