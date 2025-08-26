/**
 * Signature generation endpoints for testing
 * These endpoints accept private keys for generating various signatures needed for fee delegation
 */

import { Router, Request, Response } from 'express';
import { Wallet, TxType, JsonRpcProvider } from '@kaiachain/ethers-ext';
import { feeDelegationService } from '../../services/blockchain/feeDelegationService';
import logger from '../../utils/logger';

const router = Router();

/**
 * Generate fee-delegated deposit transaction signature
 * POST /api/v1/signatures/deposit
 */
router.post('/deposit', async (req: Request, res: Response) => {
  try {
    const { privateKey, userAddress, vaultAddress, amount } = req.body;

    if (!privateKey || !userAddress || !vaultAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: privateKey, userAddress, vaultAddress, amount'
      });
    }

    logger.info('🔐 Generating fee-delegated deposit signature', {
      userAddress,
      vaultAddress,
      amount
    });

    // Connect to Kaia provider
    const provider = new JsonRpcProvider('https://public-en-kairos.node.kaia.io', {
      chainId: 1001,
      name: 'Kaia Testnet (Kairos)'
    });
    const senderWallet = new Wallet(privateKey, provider);

    // Verify address matches
    if (senderWallet.address.toLowerCase() !== userAddress.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: `Address mismatch: private key corresponds to ${senderWallet.address}, not ${userAddress}`
      });
    }

    // Build deposit function call data: deposit(uint256 assets, address receiver)
    const depositSelector = '0x6e553f65'; // deposit(uint256,address)
    const paddedAmount = BigInt(amount).toString(16).padStart(64, '0');
    const paddedReceiver = userAddress.slice(2).padStart(64, '0');
    const depositData = depositSelector + paddedAmount + paddedReceiver;

    // Create fee-delegated transaction
    const txRequest = {
      type: TxType.FeeDelegatedSmartContractExecution,
      from: userAddress,
      to: vaultAddress,
      data: depositData,
      gasLimit: 300000,
      value: 0
    };

    // Populate and sign transaction
    const populatedTx = await senderWallet.populateTransaction(txRequest);
    const senderTxHashRLP = await senderWallet.signTransaction(populatedTx);

    logger.info('✅ Fee-delegated deposit signature generated', {
      userAddress,
      transactionType: populatedTx.type,
      gasLimit: populatedTx.gasLimit,
      nonce: populatedTx.nonce
    });

    return res.json({
      success: true,
      data: {
        senderRawTransaction: senderTxHashRLP,
        transactionDetails: {
          type: populatedTx.type,
          from: populatedTx.from,
          to: populatedTx.to,
          gasLimit: populatedTx.gasLimit?.toString(),
          gasPrice: populatedTx.gasPrice?.toString(),
          nonce: populatedTx.nonce,
          dataLength: populatedTx.data?.length
        }
      }
    });

  } catch (error: any) {
    logger.error('❌ Failed to generate deposit signature', {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: `Signature generation failed: ${error.message}`
    });
  }
});

/**
 * Generate fee-delegated approval transaction signature
 * POST /api/v1/signatures/approval
 */
router.post('/approval', async (req: Request, res: Response) => {
  try {
    const { privateKey, userAddress, tokenAddress, spenderAddress, amount } = req.body;

    if (!privateKey || !userAddress || !tokenAddress || !spenderAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: privateKey, userAddress, tokenAddress, spenderAddress, amount'
      });
    }

    logger.info('🔐 Generating fee-delegated approval signature', {
      userAddress,
      tokenAddress,
      spenderAddress,
      amount
    });

    // Connect to Kaia provider
    const provider = new JsonRpcProvider('https://public-en-kairos.node.kaia.io', {
      chainId: 1001,
      name: 'Kaia Testnet (Kairos)'
    });
    const senderWallet = new Wallet(privateKey, provider);

    // Verify address matches
    if (senderWallet.address.toLowerCase() !== userAddress.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: `Address mismatch: private key corresponds to ${senderWallet.address}, not ${userAddress}`
      });
    }

    // Build approval function call data: approve(address spender, uint256 amount)
    const approveSelector = '0x095ea7b3'; // approve(address,uint256)
    const paddedSpender = spenderAddress.slice(2).padStart(64, '0');
    const paddedAmount = BigInt(amount).toString(16).padStart(64, '0');
    const approveData = approveSelector + paddedSpender + paddedAmount;

    // Create fee-delegated transaction
    const txRequest = {
      type: TxType.FeeDelegatedSmartContractExecution,
      from: userAddress,
      to: tokenAddress,
      data: approveData,
      gasLimit: 100000,
      value: 0
    };

    // Populate and sign transaction
    const populatedTx = await senderWallet.populateTransaction(txRequest);
    const senderTxHashRLP = await senderWallet.signTransaction(populatedTx);

    logger.info('✅ Fee-delegated approval signature generated', {
      userAddress,
      transactionType: populatedTx.type,
      gasLimit: populatedTx.gasLimit,
      nonce: populatedTx.nonce
    });

    return res.json({
      success: true,
      data: {
        senderRawTransaction: senderTxHashRLP,
        transactionDetails: {
          type: populatedTx.type,
          from: populatedTx.from,
          to: populatedTx.to,
          gasLimit: populatedTx.gasLimit?.toString(),
          gasPrice: populatedTx.gasPrice?.toString(),
          nonce: populatedTx.nonce,
          dataLength: populatedTx.data?.length
        }
      }
    });

  } catch (error: any) {
    logger.error('❌ Failed to generate approval signature', {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: `Signature generation failed: ${error.message}`
    });
  }
});

/**
 * Execute fee-delegated transaction (for testing)
 * POST /api/v1/signatures/execute
 */
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { senderRawTransaction } = req.body;

    if (!senderRawTransaction) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: senderRawTransaction'
      });
    }

    logger.info('🚀 Executing fee-delegated transaction via API');

    const result = await feeDelegationService.executeFeeDelegatedTransaction(senderRawTransaction);

    logger.info('✅ Fee-delegated transaction executed successfully', {
      transactionHash: result.transactionHash,
      blockNumber: result.blockNumber
    });

    return res.json({
      success: true,
      data: {
        transactionHash: result.transactionHash,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed?.toString(),
        message: 'Transaction executed successfully'
      }
    });

  } catch (error: any) {
    logger.error('❌ Fee-delegated transaction execution failed', {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: `Transaction execution failed: ${error.message}`
    });
  }
});

export default router;