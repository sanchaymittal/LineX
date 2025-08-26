// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/strategies/AutoCompoundVaultWrapper.sol";
import "../src/strategies/PYTNYTOrchestratorWrapper.sol";

/**
 * @title Deploy Wrapper Contracts
 * @notice Deploys wrapper contracts to make AutoCompoundVault and PYTNYTOrchestrator compatible with YieldSet
 */
contract DeployWrappers is Script {
    // Known contract addresses
    address constant AUTO_COMPOUND_VAULT = 0x7d5Aa1E9ECDD8C228d3328D2Ac6C4DDF63970c36;
    address constant PYT_NYT_ORCHESTRATOR = 0x8AcE67656eaf0442886141A10DF2Ea3f9862bA11;
    
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);
        
        console.log("Deploying Wrapper Contracts...");
        console.log("Deployer Address:", deployer);
        
        // Deploy AutoCompoundVaultWrapper
        AutoCompoundVaultWrapper acWrapper = new AutoCompoundVaultWrapper(
            AUTO_COMPOUND_VAULT,
            deployer
        );
        console.log("AutoCompoundVaultWrapper deployed at:", address(acWrapper));
        
        // Deploy PYTNYTOrchestratorWrapper
        PYTNYTOrchestratorWrapper pytNytWrapper = new PYTNYTOrchestratorWrapper(
            PYT_NYT_ORCHESTRATOR,
            deployer
        );
        console.log("PYTNYTOrchestratorWrapper deployed at:", address(pytNytWrapper));
        
        vm.stopBroadcast();
        
        console.log("\n=== Wrapper Contracts Deployment Summary ===");
        console.log("AutoCompoundVaultWrapper:", address(acWrapper));
        console.log("- Wraps:", AUTO_COMPOUND_VAULT);
        console.log("- Makes AutoCompoundVault compatible with IYieldStrategy");
        console.log("- Risk Level: 4 (Medium)");
        console.log("");
        console.log("PYTNYTOrchestratorWrapper:", address(pytNytWrapper));
        console.log("- Wraps:", PYT_NYT_ORCHESTRATOR);
        console.log("- Makes PYT/NYT system compatible with IYieldStrategy");
        console.log("- Risk Level: 6 (Medium-High)");
        console.log("");
        console.log("Both wrappers are now ready to be used in YieldSet!");
    }
}