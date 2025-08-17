/**
 * Script to transfer USDT from owner wallet to a specified address
 */

import { Wallet } from '@kaiachain/ethers-ext';
import { JsonRpcProvider } from '@kaiachain/ethers-ext';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const USDT_CONTRACT = '0x09D48C3b2DE92DDfD26ebac28324F1226da1f400';
const RECIPIENT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const AMOUNT_USDT = 1000; // Transfer 1000 USDT

async function transferUSDT() {
  try {
    // Setup provider and wallet
    const provider = new JsonRpcProvider('https://public-en-kairos.node.kaia.io');
    
    // Get owner private key from environment
    const ownerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!ownerPrivateKey) {
      throw new Error('DEPLOYER_PRIVATE_KEY not found in .env');
    }
    
    const ownerWallet = new Wallet(ownerPrivateKey, provider);
    console.log('🔑 Owner wallet:', ownerWallet.address);
    
    // Check owner's USDT balance
    const balanceData = '0x70a08231' + ownerWallet.address.replace('0x', '').padStart(64, '0');
    const balanceResult = await provider.call({
      to: USDT_CONTRACT,
      data: balanceData
    });
    
    const balance = BigInt(balanceResult);
    const balanceInUSDT = Number(balance) / 10**6;
    console.log('💰 Owner USDT balance:', balanceInUSDT, 'USDT');
    
    // Prepare transfer transaction
    const amountInUnits = BigInt(AMOUNT_USDT * 10**6); // Convert to 6 decimals
    const transferData = '0xa9059cbb' + 
      RECIPIENT.replace('0x', '').padStart(64, '0') +
      amountInUnits.toString(16).padStart(64, '0');
    
    console.log(`📤 Transferring ${AMOUNT_USDT} USDT to ${RECIPIENT}...`);
    
    // Execute transfer
    const tx = await ownerWallet.sendTransaction({
      to: USDT_CONTRACT,
      data: transferData,
      gasLimit: 100000,
    });
    
    console.log('⏳ Transaction sent:', tx.hash);
    console.log('⏳ Waiting for confirmation...');
    
    const receipt = await tx.wait();
    console.log('✅ Transfer successful!');
    console.log('🧾 Transaction hash:', receipt.transactionHash);
    console.log('⛽ Gas used:', receipt.gasUsed.toString());
    
    // Check recipient's new balance
    const newBalanceData = '0x70a08231' + RECIPIENT.replace('0x', '').padStart(64, '0');
    const newBalanceResult = await provider.call({
      to: USDT_CONTRACT,
      data: newBalanceData
    });
    
    const newBalance = BigInt(newBalanceResult);
    const newBalanceInUSDT = Number(newBalance) / 10**6;
    console.log(`💰 Recipient's new USDT balance: ${newBalanceInUSDT} USDT`);
    
  } catch (error) {
    console.error('❌ Transfer failed:', error);
    process.exit(1);
  }
}

// Run the transfer
transferUSDT().then(() => {
  console.log('🎉 Script completed successfully');
  process.exit(0);
}).catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});