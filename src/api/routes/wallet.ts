/**
 * Wallet Routes
 * 
 * Provides address-based endpoints for wallet balance queries,
 * faucet claims, and user information.
 */

import { Router, Request, Response } from 'express';
import { walletService } from '../../services/wallet';
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

export default router;