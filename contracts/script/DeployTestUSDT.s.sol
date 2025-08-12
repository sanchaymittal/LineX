// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/TestUSDT.sol";

/**
 * @title DeployTestUSDT
 * @dev Deployment script for TestUSDT contract on Kaia testnet
 */
contract DeployTestUSDT is Script {
    function run() external {
        // Get deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying TestUSDT contract...");
        console.log("Deployer address:", deployer);
        console.log("Deployer balance:", deployer.balance);
        
        // Start broadcasting transactions
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy TestUSDT contract with deployer as initial owner
        TestUSDT testUSDT = new TestUSDT(deployer);
        
        // Stop broadcasting
        vm.stopBroadcast();
        
        // Log deployment information
        console.log("TestUSDT deployed at:", address(testUSDT));
        console.log("Contract name:", testUSDT.name());
        console.log("Contract symbol:", testUSDT.symbol());
        console.log("Contract decimals:", testUSDT.decimals());
        console.log("Initial total supply:", testUSDT.getFormattedTotalSupply(), "USDT");
        console.log("Faucet amount:", testUSDT.FAUCET_AMOUNT() / 10**testUSDT.decimals(), "USDT");
        console.log("Faucet cooldown:", testUSDT.FAUCET_COOLDOWN() / 3600, "hours");
        console.log("Contract owner:", testUSDT.owner());
        
        // Verify deployment
        require(address(testUSDT) != address(0), "Deployment failed");
        require(testUSDT.totalSupply() > 0, "Initial supply not minted");
        require(testUSDT.owner() == deployer, "Owner not set correctly");
        
        console.log("[SUCCESS] TestUSDT deployment successful!");
        
        // Create verification file
        string memory contractAddress = vm.toString(address(testUSDT));
        string memory verificationData = string(abi.encodePacked(
            "TestUSDT Contract Deployment\n",
            "===========================\n",
            "Network: Kaia Testnet (Kairos)\n",
            "Contract Address: ", contractAddress, "\n",
            "Name: Test USDT\n",
            "Symbol: USDT\n",
            "Decimals: 6\n",
            "Initial Supply: 1,000,000 USDT\n",
            "Deployer: ", vm.toString(deployer), "\n",
            "Deployment Time: ", vm.toString(block.timestamp), "\n",
            "Block Number: ", vm.toString(block.number), "\n"
        ));
        
        vm.writeFile("deployment-info.txt", verificationData);
        console.log("Deployment info saved to deployment-info.txt");
    }
}