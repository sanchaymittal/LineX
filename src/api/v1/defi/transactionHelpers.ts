/**
 * Transaction Request Helper Endpoints
 * 
 * Prepares transaction requests for frontend signing using encodeFunctionData
 * Frontend handles wallet connection, signing, and sends back signed transactions
 */

import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { TxType } from '@kaiachain/ethers-ext';
import { Interface } from 'ethers';
import logger from '../../../utils/logger';
import { feeDelegationService } from '../../../services/blockchain/feeDelegationService';
// Remove unused import - CONTRACT_CONSTANTS

const router: Router = Router();

// ERC20 ABI for approval
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)'
];

// ERC4626 Vault ABI for deposits
const VAULT_ABI = [
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)'
];

// AutoCompound Vault ABI
const AUTOCOMPOUND_ABI = [
  'function deposit(uint256 amount) returns (uint256 shares)'
];

/**
 * POST /api/v1/defi/approve-request
 * Prepare approval transaction request for frontend signing
 */
router.post('/approve-request',
  [
    body('tokenAddress').isEthereumAddress().withMessage('Valid token address required'),
    body('spenderAddress').isEthereumAddress().withMessage('Valid spender address required'),
    body('userAddress').isEthereumAddress().withMessage('Valid user address required'),
    body('amount').custom((value) => {
      if (typeof value === 'string' && value.trim() !== '') return true;
      if (typeof value === 'number' && value > 0) return true;
      return false;
    }).withMessage('Amount must be a positive number or non-empty string')
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Invalid input',
          details: errors.array()
        });
        return;
      }

      const { tokenAddress, spenderAddress, userAddress, amount } = req.body;

      logger.info('🔐 Preparing approval transaction request', {
        tokenAddress,
        spenderAddress,
        userAddress,
        amount
      });

      // Create interface and encode the approval function data
      const tokenInterface = new Interface(ERC20_ABI);
      const approvalData = tokenInterface.encodeFunctionData('approve', [
        spenderAddress,
        String(amount)
      ]);

      // Create fee-delegated transaction request
      const txRequest = {
        type: TxType.FeeDelegatedSmartContractExecution,
        from: userAddress,
        to: tokenAddress,
        data: approvalData,
        gasLimit: 100000,
        value: 0
      };

      logger.info('✅ Approval transaction request prepared', {
        from: userAddress,
        to: tokenAddress,
        dataLength: approvalData.length
      });

      res.json({
        success: true,
        data: {
          txRequest,
          description: 'ERC20 approval transaction request',
          expectedGas: '100000',
          function: 'approve',
          parameters: {
            spender: spenderAddress,
            amount: String(amount)
          }
        }
      });

    } catch (error) {
      logger.error('Failed to prepare approval request:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to prepare approval request'
      });
    }
  }
);

/**
 * POST /api/v1/defi/deposit-request
 * Prepare deposit transaction request for frontend signing
 */
router.post('/deposit-request',
  [
    body('vaultType').isIn(['standardized-yield', 'auto-compound']).withMessage('Valid vault type required'),
    body('vaultAddress').isEthereumAddress().withMessage('Valid vault address required'),
    body('userAddress').isEthereumAddress().withMessage('Valid user address required'),
    body('amount').custom((value) => {
      if (typeof value === 'string' && value.trim() !== '') return true;
      if (typeof value === 'number' && value > 0) return true;
      return false;
    }).withMessage('Amount must be a positive number or non-empty string')
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Invalid input',
          details: errors.array()
        });
        return;
      }

      const { vaultType, vaultAddress, userAddress, amount } = req.body;

      logger.info('🏦 Preparing deposit transaction request', {
        vaultType,
        vaultAddress,
        userAddress,
        amount
      });

      let depositData: string;
      let gasLimit: number;

      if (vaultType === 'standardized-yield') {
        // ERC4626 StandardizedYield vault: deposit(uint256 assets, address receiver)
        const vaultInterface = new Interface(VAULT_ABI);
        depositData = vaultInterface.encodeFunctionData('deposit', [
          String(amount),
          userAddress
        ]);
        gasLimit = 500000; // Higher for complex multi-strategy operations
      } else {
        // AutoCompound vault: deposit(uint256 amount)
        const vaultInterface = new Interface(AUTOCOMPOUND_ABI);
        depositData = vaultInterface.encodeFunctionData('deposit', [
          String(amount)
        ]);
        gasLimit = 500000; // Increased to safely handle AutoCompound + strategy interactions
      }

      // Create fee-delegated transaction request
      const txRequest = {
        type: TxType.FeeDelegatedSmartContractExecution,
        from: userAddress,
        to: vaultAddress,
        data: depositData,
        gasLimit,
        value: 0
      };

      logger.info('✅ Deposit transaction request prepared', {
        vaultType,
        from: userAddress,
        to: vaultAddress,
        gasLimit,
        dataLength: depositData.length
      });

      res.json({
        success: true,
        data: {
          txRequest,
          description: `${vaultType} deposit transaction request`,
          expectedGas: String(gasLimit),
          function: 'deposit',
          parameters: {
            amount: String(amount),
            receiver: vaultType === 'standardized-yield' ? userAddress : undefined
          }
        }
      });

    } catch (error) {
      logger.error('Failed to prepare deposit request:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to prepare deposit request'
      });
    }
  }
);

/**
 * POST /api/v1/defi/withdraw-request
 * Prepare withdrawal transaction request for frontend signing
 */
router.post('/withdraw-request',
  [
    body('vaultType').isIn(['standardized-yield', 'auto-compound']).withMessage('Valid vault type required'),
    body('vaultAddress').isEthereumAddress().withMessage('Valid vault address required'),
    body('userAddress').isEthereumAddress().withMessage('Valid user address required'),
    body('shares').custom((value) => {
      if (typeof value === 'string' && value.trim() !== '') return true;
      if (typeof value === 'number' && value > 0) return true;
      return false;
    }).withMessage('Shares must be a positive number or non-empty string')
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Invalid input',
          details: errors.array()
        });
        return;
      }

      const { vaultType, vaultAddress, userAddress, shares } = req.body;

      logger.info('💸 Preparing withdraw transaction request', {
        vaultType,
        vaultAddress,
        userAddress,
        shares
      });

      // Both vault types use similar withdraw function: withdraw(uint256 shares, address receiver, address owner)
      const WITHDRAW_ABI = [
        'function withdraw(uint256 shares, address receiver, address owner) returns (uint256 assets)'
      ];

      const vaultInterface = new Interface(WITHDRAW_ABI);
      const withdrawData = vaultInterface.encodeFunctionData('withdraw', [
        String(shares),
        userAddress, // receiver
        userAddress  // owner
      ]);

      const gasLimit = vaultType === 'standardized-yield' ? 500000 : 500000; // Both vaults need high gas for strategy interactions

      // Create fee-delegated transaction request
      const txRequest = {
        type: TxType.FeeDelegatedSmartContractExecution,
        from: userAddress,
        to: vaultAddress,
        data: withdrawData,
        gasLimit,
        value: 0
      };

      logger.info('✅ Withdraw transaction request prepared', {
        vaultType,
        from: userAddress,
        to: vaultAddress,
        gasLimit,
        dataLength: withdrawData.length
      });

      res.json({
        success: true,
        data: {
          txRequest,
          description: `${vaultType} withdraw transaction request`,
          expectedGas: String(gasLimit),
          function: 'withdraw',
          parameters: {
            shares: String(shares),
            receiver: userAddress,
            owner: userAddress
          }
        }
      });

    } catch (error) {
      logger.error('Failed to prepare withdraw request:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to prepare withdraw request'
      });
    }
  }
);

/**
 * POST /api/v1/defi/signature/execute
 * Execute a signed fee-delegated transaction
 */
router.post('/signature/execute',
  [
    body('senderRawTransaction').isString().notEmpty().withMessage('Signed transaction required')
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Invalid input',
          details: errors.array()
        });
        return;
      }

      const { senderRawTransaction } = req.body;

      logger.info('🚀 Executing fee-delegated transaction');

      // Use the fee delegation service to execute the transaction
      const result = await feeDelegationService.executeFeeDelegatedTransaction(senderRawTransaction);

      if (!result.success) {
        logger.error('❌ Transaction execution failed', {
          error: result.error,
          transactionHash: result.transactionHash
        });

        res.status(400).json({
          success: false,
          error: result.error || 'Transaction execution failed',
          data: {
            transactionHash: result.transactionHash,
            blockNumber: result.blockNumber
          }
        });
        return;
      }

      logger.info('✅ Transaction executed successfully', {
        transactionHash: result.transactionHash,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed?.toString()
      });

      res.json({
        success: true,
        data: {
          transactionHash: result.transactionHash,
          blockNumber: result.blockNumber,
          gasUsed: result.gasUsed?.toString(),
          message: 'Transaction executed successfully'
        }
      });

    } catch (error) {
      logger.error('Transaction execution error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Transaction execution failed'
      });
    }
  }
);

export default router;