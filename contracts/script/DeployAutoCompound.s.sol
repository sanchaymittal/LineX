// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/core/AutoCompoundVault.sol";
import "../src/strategies/MockStakingStrategy.sol";

/**
 * @title Deploy AutoCompoundVault
 * @notice Deploys the AutoCompoundVault contract (single-strategy auto-compound)
 */
contract DeployAutoCompound is Script {
    // Contract addresses - UPDATED WITH FRESH DEPLOYMENT
    address constant USDT_ADDRESS = 0x0692640d5565735C67fcB40f45251DD5D3f8fb9f; // Fresh TestUSDT deployment
    
    // Mock strategy addresses - UPDATED WITH FRESH DEPLOYMENT
    address constant MOCK_STAKING_STRATEGY = 0x9A4d5239fC2257717d886f64632B3884839F055C; // Fresh MockStakingStrategy
    
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        vm.startBroadcast(deployerPrivateKey);
        
        console.log("Deploying AutoCompoundVault...");
        console.log("USDT Address:", USDT_ADDRESS);
        console.log("Selected Strategy:", MOCK_STAKING_STRATEGY);
        console.log("Deployer Address:", deployer);
        
        // Deploy AutoCompoundVault with MockStakingStrategy
        AutoCompoundVault vault = new AutoCompoundVault(
            IERC20(USDT_ADDRESS),
            IYieldStrategy(MOCK_STAKING_STRATEGY),
            "LineX Auto-Compound Vault",
            "AC-USDT",
            deployer // deployer as owner
        );
        console.log("AutoCompoundVault deployed at:", address(vault));
        
        // Verify strategy integration
        console.log("\nVerifying strategy integration...");
        console.log("Want asset:", address(vault.want()));
        console.log("Strategy:", address(vault.strategy()));
        
        vm.stopBroadcast();
        
        console.log("\n=== AutoCompoundVault Deployment Summary ===");
        console.log("AutoCompoundVault:", address(vault));
        console.log("Name:", "LineX Auto-Compound Vault");
        console.log("Symbol:", "AC-USDT");
        console.log("Underlying Asset:", USDT_ADDRESS);
        console.log("Strategy:", MOCK_STAKING_STRATEGY, "(MockStakingStrategy)");
        console.log("\nFeatures:");
        console.log("- Auto-harvest on deposit/withdraw");
        console.log("- Single-strategy focus (8% base APY)");
        console.log("- Automatic yield compounding");
        console.log("- Expected effective APY: 10-12% (with compounding)");
    }
}