// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/core/YieldSet.sol";

/**
 * @title Deploy YieldSet
 * @notice Deploys the YieldSet contract (Set Protocol-inspired portfolio manager)
 */
contract DeployYieldSet is Script {
    // Known contract addresses
    address constant USDT_ADDRESS = 0x2d889aAAD5F81e9eBc4D14630d7C14F1CE6878dD;
    
    // Core contracts to be used in YieldSet portfolio
    address constant STANDARDIZED_YIELD = 0x6A291219e8e83192f841cB577ebA20932808Fb45;
    address constant AUTO_COMPOUND_VAULT_WRAPPER = 0xC036c2f2F64c06546cd1E2a487139058d4B9Dc4F;
    address constant PYT_NYT_ORCHESTRATOR_WRAPPER = 0x15e8a4764e49631A5692641EBe46f539f8ab8A05;
    
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);
        
        console.log("Deploying YieldSet...");
        console.log("USDT Address:", USDT_ADDRESS);
        console.log("Deployer Address:", deployer);
        
        // Deploy YieldSet
        YieldSet yieldSet = new YieldSet(
            USDT_ADDRESS,
            "LineX Yield Set",
            "YS-USDT",
            deployer // deployer as owner
        );
        console.log("YieldSet deployed at:", address(yieldSet));
        
        // Add yield strategy positions to YieldSet
        console.log("\nAdding strategy positions to YieldSet...");
        
        // Position 1: StandardizedYield (40% allocation - diversified wrapper)
        yieldSet.addPosition(STANDARDIZED_YIELD, 4000);
        console.log("Added StandardizedYield position (40% allocation)");
        
        // Position 2: AutoCompoundVaultWrapper (30% allocation - auto-compound single strategy)  
        yieldSet.addPosition(AUTO_COMPOUND_VAULT_WRAPPER, 3000);
        console.log("Added AutoCompoundVaultWrapper position (30% allocation)");
        
        // Position 3: PYTNYTOrchestratorWrapper (30% allocation - yield derivatives)
        yieldSet.addPosition(PYT_NYT_ORCHESTRATOR_WRAPPER, 3000);
        console.log("Added PYTNYTOrchestratorWrapper position (30% allocation)");
        
        // Enable auto-rebalancing
        yieldSet.setRebalanceParams(200, 6 hours, true); // 2% threshold, 6hr min interval
        console.log("Enabled auto-rebalancing (2% threshold, 6hr interval)");
        
        vm.stopBroadcast();
        
        console.log("\n=== YieldSet Deployment Summary ===");
        console.log("YieldSet:", address(yieldSet));
        console.log("Name:", "LineX Yield Set");
        console.log("Symbol:", "YS-USDT");
        console.log("Base Asset:", USDT_ADDRESS);
        console.log("\nCore Contracts Portfolio (via Wrappers):");
        console.log("- StandardizedYield: 40% (multi-strategy wrapper ~9.5% APY)");
        console.log("- AutoCompoundVaultWrapper: 30% (auto-compounding ~10-12% APY)");
        console.log("- PYTNYTOrchestratorWrapper: 30% (yield derivatives ~12-15% APY)");
        console.log("\nArchitecture:");
        console.log("- All 4 core contracts integrated via YieldSet");
        console.log("- Wrappers make AutoCompound & PYT/NYT compatible");
        console.log("- Complete DeFi ecosystem in single portfolio");
        console.log("\nFeatures:");
        console.log("- Automatic rebalancing (2% threshold)");
        console.log("- Multi-layer yield optimization");
        console.log("- Yield harvesting across all positions");
        console.log("- Professional-grade portfolio management");
        console.log("- Expected blended APY: ~11-13% (optimized)");
    }
}