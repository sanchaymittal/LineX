// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {PerpetualYieldToken} from "../src/PerpetualYieldToken.sol";
import {NegativeYieldToken} from "../src/NegativeYieldToken.sol";
import {YieldOrchestrator} from "../src/YieldOrchestrator.sol";

/**
 * @title Deploy PYT/NYT System Script
 * @dev Deploys the complete PYT/NYT yield splitting system to Kaia testnet
 */
contract DeployPYTNYT is Script {
    // Kaia testnet contract addresses
    address constant SY_VAULT_ADDRESS = 0x13cFf25b9ce2F409b7e96F7C572234AF8e060420;
    address constant TESTUSDT_ADDRESS = 0x09D48C3b2DE92DDfD26ebac28324F1226da1f400;
    
    // Token parameters
    string constant PYT_NAME = "LineX Perpetual Yield Token";
    string constant PYT_SYMBOL = "lxPYT";
    string constant NYT_NAME = "LineX Negative Yield Token";
    string constant NYT_SYMBOL = "lxNYT";

    function run() external {
        // Get deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying PYT/NYT System...");
        console.log("Deployer:", deployer);
        console.log("SY Vault:", SY_VAULT_ADDRESS);
        console.log("TestUSDT:", TESTUSDT_ADDRESS);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy Perpetual Yield Token (PYT)
        PerpetualYieldToken pytToken = new PerpetualYieldToken(
            SY_VAULT_ADDRESS,
            TESTUSDT_ADDRESS,
            PYT_NAME,
            PYT_SYMBOL,
            deployer // Will be transferred to orchestrator later
        );
        console.log("PYT Token deployed at:", address(pytToken));

        // Deploy Negative Yield Token (NYT)
        NegativeYieldToken nytToken = new NegativeYieldToken(
            TESTUSDT_ADDRESS,
            NYT_NAME,
            NYT_SYMBOL,
            deployer // Will be transferred to orchestrator later
        );
        console.log("NYT Token deployed at:", address(nytToken));

        // Deploy Yield Orchestrator
        YieldOrchestrator orchestrator = new YieldOrchestrator(
            SY_VAULT_ADDRESS,
            address(pytToken),
            address(nytToken),
            deployer
        );
        console.log("Yield Orchestrator deployed at:", address(orchestrator));

        // Transfer ownership of tokens to orchestrator
        pytToken.transferOwnership(address(orchestrator));
        nytToken.transferOwnership(address(orchestrator));
        
        console.log("Token ownership transferred to orchestrator");

        vm.stopBroadcast();

        // Log deployment summary
        console.log("\n=== Deployment Summary ===");
        console.log("PYT_TOKEN_ADDRESS=%s", address(pytToken));
        console.log("NYT_TOKEN_ADDRESS=%s", address(nytToken));
        console.log("YIELD_ORCHESTRATOR_ADDRESS=%s", address(orchestrator));
        console.log("ORCHESTRATOR_OWNER=%s", deployer);
        
        // Verify initial state
        console.log("\n=== Initial Contract State ===");
        console.log("PYT Owner:", pytToken.owner());
        console.log("NYT Owner:", nytToken.owner());
        console.log("PYT Asset:", address(pytToken.asset()));
        console.log("NYT Asset:", address(nytToken.asset()));
        console.log("NYT Maturity:", nytToken.maturity());
        console.log("NYT Days to Maturity:", nytToken.daysToMaturity());
        
        // Get orchestrator stats
        (
            uint256 totalShares,
            uint256 pytSupply,
            uint256 nytSupply,
            uint256 lastDistribution,
            uint256 nextDistribution,
            uint256 vaultValue
        ) = orchestrator.getStats();
        
        console.log("\n=== Orchestrator Stats ===");
        console.log("Total SY Shares:", totalShares);
        console.log("PYT Supply:", pytSupply);
        console.log("NYT Supply:", nytSupply);
        console.log("Last Distribution:", lastDistribution);
        console.log("Vault Value:", vaultValue);
        
        // Test splitting preview
        uint256 testAmount = 1000e18; // 1000 SY shares
        (uint256 pytAmount, uint256 nytAmount, uint256 underlyingValue) = orchestrator.previewSplit(testAmount);
        console.log("\n=== Split Preview (1000 shares) ===");
        console.log("PYT Amount:", pytAmount);
        console.log("NYT Amount:", nytAmount);
        console.log("Underlying Value:", underlyingValue);
        
        console.log("\nPYT/NYT System deployment completed successfully!");
    }
}