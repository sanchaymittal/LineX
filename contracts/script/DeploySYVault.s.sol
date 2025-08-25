// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {SYVault} from "../src/SYVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Deploy SY Vault Script
 * @dev Deploys the Standardized Yield Vault to Kaia testnet
 */
contract DeploySYVault is Script {
    // Kaia testnet TestUSDT contract address
    address constant TESTUSDT_ADDRESS = 0x09D48C3b2DE92DDfD26ebac28324F1226da1f400;
    
    // Vault parameters
    string constant VAULT_NAME = "LineX SY Vault";
    string constant VAULT_SYMBOL = "lxSY";

    function run() external {
        // Get deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying SY Vault...");
        console.log("Deployer:", deployer);
        console.log("TestUSDT:", TESTUSDT_ADDRESS);
        console.log("Vault Name:", VAULT_NAME);
        console.log("Vault Symbol:", VAULT_SYMBOL);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy SY Vault
        SYVault syVault = new SYVault(
            IERC20(TESTUSDT_ADDRESS),
            VAULT_NAME,
            VAULT_SYMBOL,
            deployer // Initial owner
        );

        vm.stopBroadcast();

        console.log("SY Vault deployed at:", address(syVault));
        console.log("Initial owner:", syVault.owner());
        console.log("Underlying asset:", address(syVault.asset()));
        console.log("Management fee:", syVault.managementFee(), "basis points");
        console.log("Yield rate:", syVault.yieldRate(), "basis points (APY)");
        
        // Log deployment info for easy copy-paste
        console.log("\n=== Deployment Summary ===");
        console.log("SY_VAULT_ADDRESS=%s", address(syVault));
        console.log("VAULT_OWNER=%s", deployer);
        console.log("UNDERLYING_TOKEN=%s", TESTUSDT_ADDRESS);
        
        // Verify initial state
        (uint256 totalDeposits, uint256 totalShares, uint256 sharePrice, uint256 totalYield) = syVault.getVaultStats();
        console.log("\n=== Initial Vault State ===");
        console.log("Total Deposits:", totalDeposits);
        console.log("Total Shares:", totalShares);
        console.log("Share Price:", sharePrice);
        console.log("Total Yield Generated:", totalYield);
    }
}