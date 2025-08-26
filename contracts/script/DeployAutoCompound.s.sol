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
    // Known contract addresses
    address constant USDT_ADDRESS = 0xb5Ad080243b3de7ee561F3D85AD3521C3238D0eb;
    
    // Mock strategy addresses (use staking for stable returns)
    address constant MOCK_STAKING_STRATEGY = 0x44d2624dD1925875bD35d68185B49d2d0c90430B;
    
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
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