/**
 * Wallet Routes
 * 
 * Provides address-based endpoints for wallet balance queries,
 * faucet claims, and user information.
 */

import { Router, Request, Response } from 'express';
import { walletService } from '../../services/wallet';
import { feeDelegationService } from '../../services/blockchain/feeDelegationService';
import { asyncHandler } from '../middleware/errorHandler';
import { createValidationError } from '../middleware/errorHandler';
import { CONTRACT_CONSTANTS } from '../../types/contracts';
import logger from '../../utils/logger';

const router: Router = Router();

/**
 * Get wallet balance
 * GET /api/v1/wallet/:address/balance
 */
router.get('/:address/balance', asyncHandler(async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!address) {
    throw createValidationError('wallet address is required');
  }

  const result = await walletService.getWalletBalance(address);

  if (result.success) {
    res.status(200).json({
      success: true,
      data: {
        address: address.toLowerCase(),
        balance: result.balance,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).correlationId,
      },
    });
  } else {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: 'BALANCE_FETCH_FAILED',
        message: result.error,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).correlationId,
      },
    });
  }
}));

/**
 * Get user information by wallet address
 * GET /api/v1/wallet/:address
 */
router.get('/:address', asyncHandler(async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!address) {
    throw createValidationError('wallet address is required');
  }

  const user = await walletService.getUser(address);

  if (user) {
    res.status(200).json({
      success: true,
      data: {
        walletAddress: user.walletAddress,
        firstTransferAt: user.firstTransferAt,
        lastTransferAt: user.lastTransferAt,
        transferCount: user.transferCount,
        createdAt: user.createdAt,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).correlationId,
      },
    });
  } else {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: 'USER_NOT_FOUND',
        message: 'No user found for this wallet address',
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).correlationId,
      },
    });
  }
}));

/**
 * Claim test USDT from faucet (user-authorized)
 * POST /api/v1/wallet/faucet
 */
router.post('/faucet', asyncHandler(async (req: Request, res: Response) => {
  const { userAddress, signature, message } = req.body;

  // For testing - allow faucet without signature if only userAddress is provided
  if (!userAddress) {
    throw createValidationError('userAddress is required');
  }

  const result = await walletService.claimFaucet({
    userAddress,
    signature,
    message,
  });

  if (result.success) {
    res.status(200).json({
      success: true,
      data: {
        userAddress: userAddress.toLowerCase(),
        transactionHash: result.transactionHash,
        message: 'Faucet claim completed successfully',
        amount: '100 USDT',
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).correlationId,
      },
    });
  } else {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: 'FAUCET_CLAIM_FAILED',
        message: result.error,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).correlationId,
      },
    });
  }
}));

/**
 * Get user's transfer history
 * GET /api/v1/wallet/:address/transfers
 */
router.get('/:address/transfers', asyncHandler(async (req: Request, res: Response) => {
  const { address } = req.params;
  const { limit = '10' } = req.query;

  if (!address) {
    throw createValidationError('wallet address is required');
  }

  const transfers = await walletService.getUserTransfers(address, parseInt(limit as string));

  res.status(200).json({
    success: true,
    data: {
      address: address.toLowerCase(),
      transfers,
      count: transfers.length,
    },
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: (req as any).correlationId,
    },
  });
}));

/**
 * Execute gasless approval for user's tokens (approve/permit)
 * POST /api/v1/wallet/approve
 * 
 * Allows specified spender to spend user's tokens for gasless operations.
 * Uses EIP-2612 permit if available, otherwise gas payer executes approve transaction.
 */
router.post('/approve', asyncHandler(async (req: Request, res: Response) => {
  const { userAddress, amount, senderRawTransaction, spenderAddress } = req.body;

  if (!userAddress || !amount) {
    throw createValidationError('userAddress and amount are required');
  }

  if (typeof amount !== 'number' || amount <= 0) {
    throw createValidationError('amount must be a positive number');
  }

  // Use provided spender or default to gas payer for backward compatibility
  const spender = spenderAddress || feeDelegationService.getGasPayerAddress();

  logger.info('🔑 Processing gasless approval request', {
    userAddress,
    amount,
    spender,
    hasPreSignedTx: !!senderRawTransaction,
  });

  const result = await feeDelegationService.executeGaslessApproval({
    userAddress,
    amount,
    senderRawTransaction,
    spenderAddress: spender,
  });

  if (result.success) {
    res.status(200).json({
      success: true,
      data: {
        userAddress: userAddress.toLowerCase(),
        amount,
        transactionHash: result.transactionHash,
        blockNumber: result.blockNumber,
        message: 'Gasless approval completed successfully',
        method: 'fee-delegated-approve', // Kaia fee delegation was used
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).correlationId,
      },
    });
  } else {
    // Check if it's a fee-delegation error requiring manual approval
    if (result.error?.includes('Manual approval required')) {
      res.status(200).json({
        success: false,
        data: {
          userAddress: userAddress.toLowerCase(),
          amount,
          requiresManualApproval: true,
          gasPayerAddress: feeDelegationService.getGasPayerAddress(),
          message: 'Manual approval required - user must provide pre-signed fee-delegated transaction',
          approveCallData: {
            to: CONTRACT_CONSTANTS.ADDRESS, // Use centralized contract address
            method: 'approve',
            params: [
              spender, // Use dynamic spender address
              (amount * 10 ** 6).toString(), // amount in wei (6 decimals for USDT)
            ],
          },
        },
        error: {
          code: 'MANUAL_APPROVAL_REQUIRED',
          message: result.error,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: (req as any).correlationId,
        },
      });
    } else {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: 'APPROVAL_FAILED',
          message: result.error,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: (req as any).correlationId,
        },
      });
    }
  }
}));

export default router;