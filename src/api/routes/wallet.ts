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

  if (!userAddress || !signature || !message) {
    throw createValidationError('userAddress, signature, and message are required');
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
 * Allows gas payer to spend user's tokens for gasless transfers.
 * Uses EIP-2612 permit if available, otherwise returns error for manual approve.
 */
router.post('/approve', asyncHandler(async (req: Request, res: Response) => {
  const { userAddress, amount, permitData } = req.body;

  if (!userAddress || !amount) {
    throw createValidationError('userAddress and amount are required');
  }

  if (typeof amount !== 'number' || amount <= 0) {
    throw createValidationError('amount must be a positive number');
  }

  logger.info('🔑 Processing gasless approval request', {
    userAddress,
    amount,
    hasPermitData: !!permitData,
  });

  const result = await feeDelegationService.executeGaslessApproval({
    userAddress,
    amount,
    permitData,
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
        method: 'permit', // EIP-2612 permit was used
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).correlationId,
      },
    });
  } else {
    // Check if it's a permit-not-supported error
    if (result.error?.includes('gasless permit')) {
      res.status(200).json({
        success: false,
        data: {
          userAddress: userAddress.toLowerCase(),
          amount,
          requiresManualApproval: true,
          gasPayerAddress: feeDelegationService.getGasPayerAddress(),
          message: 'Manual approval required - contract does not support EIP-2612 permit',
          approveCallData: {
            to: '0x2d889aAAD5F81e9eBc4D14630d7C14F1CE6878dD', // Contract address
            method: 'approve',
            params: [
              feeDelegationService.getGasPayerAddress(), // spender
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