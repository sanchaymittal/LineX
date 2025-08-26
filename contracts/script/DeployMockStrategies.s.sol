// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/strategies/MockLendingStrategy.sol";
import "../src/strategies/MockStakingStrategy.sol";  
import "../src/strategies/MockLPStrategy.sol";

/**
 * @title Deploy Mock Strategies
 * @notice Deploys all 3 mock strategies for testing the DeFi ecosystem
 */
contract DeployMockStrategies is Script {
    // Known contract addresses
    address constant USDT_ADDRESS = 0xb5Ad080243b3de7ee561F3D85AD3521C3238D0eb;
    
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        console.log("Deploying Mock Strategies...");
        console.log("USDT Address:", USDT_ADDRESS);
        
        // Deploy MockLendingStrategy (Aave-like, 10% APY)
        MockLendingStrategy lendingStrategy = new MockLendingStrategy(
            USDT_ADDRESS,
            msg.sender // deployer as owner
        );
        console.log("MockLendingStrategy deployed at:", address(lendingStrategy));
        
        // Deploy MockStakingStrategy (Ethereum staking-like, 8% APY)  
        MockStakingStrategy stakingStrategy = new MockStakingStrategy(
            USDT_ADDRESS,
            msg.sender // deployer as owner
        );
        console.log("MockStakingStrategy deployed at:", address(stakingStrategy));
        
        // Deploy MockLPStrategy (Uniswap LP-like, 12% volatile APY)
        MockLPStrategy lpStrategy = new MockLPStrategy(
            USDT_ADDRESS,
            msg.sender // deployer as owner
        );
        console.log("MockLPStrategy deployed at:", address(lpStrategy));
        
        vm.stopBroadcast();
        
        console.log("\n=== Mock Strategies Deployment Summary ===");
        console.log("MockLendingStrategy:", address(lendingStrategy), "(10% APY)");
        console.log("MockStakingStrategy:", address(stakingStrategy), "(8% APY)");
        console.log("MockLPStrategy:", address(lpStrategy), "(12% volatile APY)");
        console.log("All strategies use USDT as base asset:", USDT_ADDRESS);
    }
}