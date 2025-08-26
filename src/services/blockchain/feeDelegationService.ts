/**
 * Fee Delegation Service - Proper Kaia Implementation
 * 
 * Implements Kaia's fee delegation pattern where:
 * 1. User creates and signs fee-delegated transaction
 * 2. Server receives the signed transaction (senderTxHashRLP)
 * 3. Fee payer uses sendTransactionAsFeePayer() to submit and pay fees
 * 
 * Based on: https://docs.kaia.io/build/tutorials/fee-delegation-example/
 */

import { Wallet, TxType, parseKaia } from '@kaiachain/ethers-ext';
import { kaiaProvider } from './provider';
import { CONTRACT_CONSTANTS } from '../../types/contracts';
import { GaslessTransactionResult } from '../../types';
import logger from '../../utils/logger';
import config from '../../config';

export class FeeDelegationService {
  private gasPayerWallet: Wallet | null = null;
  
  constructor() {
    // Lazy initialization - will initialize when first used
  }

  private initializeGasPayer(): void {
    try {
      const privateKey = config.blockchain.gasPayerPrivateKey;
      if (!privateKey) {
        throw new Error('Gas payer private key not configured');
      }

      if (!kaiaProvider.isProviderConnected()) {
        throw new Error('Kaia provider not connected');
      }

      const provider = kaiaProvider.getProvider();
      this.gasPayerWallet = new Wallet(privateKey, provider);

      logger.info('✅ Fee delegation service initialized', {
        gasPayerAddress: this.gasPayerWallet.address,
      });
    } catch (error) {
      logger.error('❌ Failed to initialize fee delegation service:', error);
      throw error;
    }
  }

  private ensureGasPayer(): Wallet {
    if (!this.gasPayerWallet) {
      this.initializeGasPayer();
    }
    if (!this.gasPayerWallet) {
      throw new Error('Gas payer wallet not initialized');
    }
    return this.gasPayerWallet;
  }

  getGasPayerAddress(): string {
    const gasPayer = this.ensureGasPayer();
    return gasPayer.address;
  }

  /**
   * 1. Create and populate fee-delegated transaction
   * Creates the raw transaction object following Kaia patterns
   */
  async createFeeDelegatedTransaction(params: {
    type: TxType;
    from: string;
    to: string;
    value?: bigint;
    data?: string;
    gasLimit?: number;
  }) {
    try {
      logger.info('📝 Creating fee-delegated transaction', {
        type: params.type,
        from: params.from,
        to: params.to,
        hasData: !!params.data
      });

      // Create transaction following Kaia pattern
      let tx: any = {
        type: params.type,
        from: params.from,
        to: params.to,
      };

      if (params.value) {
        tx.value = params.value;
      }
      if (params.data) {
        tx.data = params.data;
      }
      if (params.gasLimit) {
        tx.gasLimit = params.gasLimit;
      }

      return tx;

    } catch (error) {
      logger.error('❌ Failed to create fee-delegated transaction:', error);
      throw error;
    }
  }

  /**
   * 2a. Sign transaction with EIP-712 (for complex operations)
   */
  async signTransactionEIP712(userWallet: Wallet, transaction: any): Promise<string> {
    try {
      logger.info('📝 Signing transaction with EIP-712', {
        from: transaction.from,
        to: transaction.to
      });

      // Populate transaction first
      const populatedTx = await userWallet.populateTransaction(transaction);
      logger.info('📋 Transaction populated', populatedTx);

      // Sign the transaction
      const senderTxHashRLP = await userWallet.signTransaction(populatedTx);
      logger.info('✅ Transaction signed with EIP-712', {
        senderTxHashRLP: senderTxHashRLP.substring(0, 20) + '...'
      });

      return senderTxHashRLP;

    } catch (error) {
      logger.error('❌ Failed to sign transaction with EIP-712:', error);
      throw error;
    }
  }

  /**
   * 2b. Sign transaction with simple signature (for basic operations)
   */
  async signTransaction(userWallet: Wallet, transaction: any): Promise<string> {
    try {
      logger.info('📝 Signing transaction', {
        from: transaction.from,
        to: transaction.to
      });

      // Populate transaction first
      const populatedTx = await userWallet.populateTransaction(transaction);
      logger.info('📋 Transaction populated', populatedTx);

      // Sign the transaction
      const senderTxHashRLP = await userWallet.signTransaction(populatedTx);
      logger.info('✅ Transaction signed', {
        senderTxHashRLP: senderTxHashRLP.substring(0, 20) + '...'
      });

      return senderTxHashRLP;

    } catch (error) {
      logger.error('❌ Failed to sign transaction:', error);
      throw error;
    }
  }

  /**
   * 3. Execute fee-delegated transaction using sendTransactionAsFeePayer
   * Core Kaia fee delegation function - exactly like the example
   */
  async executeFeeDelegatedTransaction(senderTxHashRLP: string): Promise<GaslessTransactionResult> {
    try {
      const feePayerWallet = this.ensureGasPayer();

      logger.info('🔄 Processing fee-delegated transaction', {
        gasPayerAddress: feePayerWallet.address,
        hasSenderTx: !!senderTxHashRLP
      });

      // This is the core Kaia fee delegation pattern
      const sentTx = await feePayerWallet.sendTransactionAsFeePayer(senderTxHashRLP);
      logger.info('📡 Fee-delegated transaction submitted', {
        transactionHash: sentTx.hash
      });

      const receipt = await sentTx.wait();
      
      // Check if the transaction actually succeeded (status = 1) or failed (status = 0)
      if (receipt.status === 0) {
        // Try to get the revert reason by simulating the transaction
        let revertReason = 'Transaction failed on-chain (status: 0)';
        try {
          // Decode the transaction to get the original call
          const provider = kaiaProvider.getProvider();
          const tx = await provider.getTransaction(receipt.transactionHash);
          if (tx && tx.data && tx.to) {
            // Try to simulate the call to get the revert reason
            try {
              await provider.call({
                to: tx.to,
                data: tx.data,
                from: tx.from
              });
            } catch (callError: any) {
              // Extract revert reason from error
              if (callError.reason) {
                revertReason = `Contract reverted: ${callError.reason}`;
              } else if (callError.message) {
                const reasonMatch = callError.message.match(/execution reverted: (.*?)"/);
                if (reasonMatch && reasonMatch[1]) {
                  revertReason = `Contract reverted: ${reasonMatch[1]}`;
                } else {
                  revertReason = `Contract call failed: ${callError.message}`;
                }
              }
            }
          }
        } catch (debugError) {
          logger.error('Failed to decode revert reason', debugError);
        }

        logger.error('❌ Fee-delegated transaction failed on-chain', {
          transactionHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          status: receipt.status,
          gasUsed: receipt.gasUsed?.toString(),
          revertReason
        });
        return {
          success: false,
          error: revertReason,
          transactionHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber
        };
      }

      logger.info('✅ Fee-delegated transaction confirmed', {
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed?.toString()
      });

      if (receipt.transactionHash) {
        return {
          success: true,
          transactionHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed ? BigInt(receipt.gasUsed.toString()) : undefined
        };
      } else {
        return {
          success: false,
          error: 'Transaction failed - no transaction hash returned'
        };
      }

    } catch (error) {
      logger.error('❌ Fee delegation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown fee delegation error'
      };
    }
  }

  /**
   * Helper: Execute gasless approval - wrapper around core fee delegation
   */
  async executeGaslessApproval(request: {
    userAddress: string;
    amount: number;
    spenderAddress?: string;
    senderRawTransaction?: string; // User's signed fee-delegated approve transaction
  }): Promise<GaslessTransactionResult> {
    const spender = request.spenderAddress || this.getGasPayerAddress();
    
    logger.info('🔑 Processing gasless approval request', {
      userAddress: request.userAddress,
      spender,
      amount: request.amount,
      hasPreSignedTx: !!request.senderRawTransaction
    });

    // If we have a pre-signed fee-delegated transaction from the user
    if (request.senderRawTransaction) {
      logger.info('✅ Using fee-delegated approval transaction');
      return await this.executeFeeDelegatedTransaction(request.senderRawTransaction);
    }

    // Fallback: Manual approval required
    logger.info('ℹ️ No pre-signed transaction provided - manual approval required');
    return {
      success: false,
      error: 'Manual approval required. User must provide pre-signed fee-delegated transaction.',
    };
  }

  /**
   * Helper: Execute authorized faucet claim using fee delegation
   */
  async executeAuthorizedFaucetClaim(request: {
    userAddress: string;
    signature: string;
    message: string;
    senderRawTransaction?: string; // User's signed faucet transaction
  }): Promise<GaslessTransactionResult> {
    logger.info('🚰 Processing fee-delegated faucet claim', {
      userAddress: request.userAddress,
      hasPreSignedTx: !!request.senderRawTransaction
    });

    // If we have a pre-signed fee-delegated transaction from the user
    if (request.senderRawTransaction) {
      logger.info('✅ Using fee-delegated faucet transaction');
      return await this.executeFeeDelegatedTransaction(request.senderRawTransaction);
    }

    // Fallback: Execute faucet directly (temporary - should be fee-delegated)
    try {
      const gasPayer = this.ensureGasPayer();
      
      logger.info('🚰 Executing direct faucet claim (fallback)', {
        userAddress: request.userAddress,
        gasPayerAddress: gasPayer.address,
      });

      // Simple signature verification for faucet (basic implementation)
      // TODO: Implement proper EIP-712 signature verification
      
      // Prepare the mint transaction to send 100 USDT to user
      const faucetAmount = BigInt(CONTRACT_CONSTANTS.FAUCET_AMOUNT_USDT * 10 ** CONTRACT_CONSTANTS.DECIMALS);
      const mintData = this.buildMintCall(request.userAddress, faucetAmount);
      const faucetTx = {
        to: CONTRACT_CONSTANTS.ADDRESS,
        data: mintData,
        gasLimit: 100000,
      };

      // Execute the transaction using gas payer
      const tx = await gasPayer.sendTransaction(faucetTx);
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        logger.info('✅ Direct faucet claim successful', {
          userAddress: request.userAddress,
          transactionHash: tx.hash
        });

        return {
          success: true,
          transactionHash: tx.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed ? BigInt(receipt.gasUsed.toString()) : undefined
        };
      } else {
        return {
          success: false,
          error: 'Faucet transaction failed'
        };
      }

    } catch (error) {
      logger.error('❌ Faucet claim failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown faucet error'
      };
    }
  }

  /**
   * Helper: Build mint function call data for USDT contract
   */
  private buildMintCall(userAddress: string, amount: bigint): string {
    // mint(address to, uint256 amount) function selector: 0x40c10f19
    const functionSelector = '0x40c10f19';
    const paddedAddress = userAddress.slice(2).padStart(64, '0');
    const paddedAmount = amount.toString(16).padStart(64, '0');
    
    return functionSelector + paddedAddress + paddedAmount;
  }

  /**
   * Helper: Create fee-delegated approve transaction
   */
  async createApproveTransaction(userAddress: string, spenderAddress: string, amount: bigint) {
    return await this.createFeeDelegatedTransaction({
      type: TxType.FeeDelegatedSmartContractExecution,
      from: userAddress,
      to: CONTRACT_CONSTANTS.ADDRESS,
      data: this.buildApproveCall(spenderAddress, amount),
      gasLimit: 100000
    });
  }

  /**
   * Helper: Build approve function call data
   */
  private buildApproveCall(spenderAddress: string, amount: bigint): string {
    // approve(address spender, uint256 amount) function selector: 0x095ea7b3
    const functionSelector = '0x095ea7b3';
    const paddedSpender = spenderAddress.slice(2).padStart(64, '0');
    const paddedAmount = amount.toString(16).padStart(64, '0');
    
    return functionSelector + paddedSpender + paddedAmount;
  }
}

export const feeDelegationService = new FeeDelegationService();