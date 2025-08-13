/**
 * Wallet Routes
 * 
 * Provides endpoints for wallet management, transaction signing,
 * and DappPortal integration.
 */

import { Router, Request, Response } from 'express';
import { walletService } from '../../services/wallet';
import { asyncHandler } from '../middleware/errorHandler';
import { createValidationError } from '../middleware/errorHandler';
import logger from '../../utils/logger';

const router = Router();

/**
 * Connect a wallet to a LINE user
 * POST /api/v1/wallet/connect
 */
router.post('/connect', asyncHandler(async (req: Request, res: Response) => {
  const { lineUserId, walletAddress } = req.body;

  if (!lineUserId || !walletAddress) {
    throw createValidationError('lineUserId and walletAddress are required');
  }

  const result = await walletService.connectWallet(lineUserId, walletAddress);

  if (result.success) {
    res.status(200).json({
      success: true,
      data: result.wallet,
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
        code: 'WALLET_CONNECTION_FAILED',
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
 * Get user's wallet information
 * GET /api/v1/wallet/:lineUserId
 */
router.get('/:lineUserId', asyncHandler(async (req: Request, res: Response) => {
  const { lineUserId } = req.params;

  if (!lineUserId) {
    throw createValidationError('lineUserId is required');
  }

  const wallet = await walletService.getUserWallet(lineUserId);

  if (wallet) {
    res.status(200).json({
      success: true,
      data: wallet,
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
        code: 'WALLET_NOT_FOUND',
        message: 'No wallet found for this user',
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).correlationId,
      },
    });
  }
}));

/**
 * Create faucet signing session
 * POST /api/v1/wallet/faucet
 */
router.post('/faucet', asyncHandler(async (req: Request, res: Response) => {
  const { lineUserId, userAddress, gasless = true } = req.body;

  if (!lineUserId || !userAddress) {
    throw createValidationError('lineUserId and userAddress are required');
  }

  const result = await walletService.createFaucetSigningSession(
    { userAddress, gasless },
    lineUserId
  );

  if (result.success) {
    const responseData = gasless 
      ? {
          sessionId: result.sessionId,
          status: 'completed',
          gasless: true,
          message: 'Gasless faucet claim completed successfully',
        }
      : {
          sessionId: result.sessionId,
          signingUrl: result.signingUrl,
          status: 'pending_signature',
          gasless: false,
          message: 'Please complete signing to claim faucet',
        };

    res.status(gasless ? 200 : 201).json({
      success: true,
      data: responseData,
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
        code: 'FAUCET_REQUEST_FAILED',
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
 * Create transfer signing session
 * POST /api/v1/wallet/transfer
 */
router.post('/transfer', asyncHandler(async (req: Request, res: Response) => {
  const { lineUserId, from, to, amount, gasless = true } = req.body;

  if (!lineUserId || !from || !to || !amount) {
    throw createValidationError('lineUserId, from, to, and amount are required');
  }

  if (amount <= 0) {
    throw createValidationError('Amount must be greater than 0');
  }

  const result = await walletService.createTransferSigningSession(
    { from, to, amount, gasless },
    lineUserId
  );

  if (result.success) {
    const responseData = gasless 
      ? {
          sessionId: result.sessionId,
          status: 'completed',
          gasless: true,
          message: 'Gasless transfer completed successfully',
          transfer: { from, to, amount },
        }
      : {
          sessionId: result.sessionId,
          signingUrl: result.signingUrl,
          status: 'pending_signature',
          gasless: false,
          message: 'Please complete signing to execute transfer',
          transfer: { from, to, amount },
        };

    res.status(gasless ? 200 : 201).json({
      success: true,
      data: responseData,
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
        code: 'TRANSFER_REQUEST_FAILED',
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
 * Get signing session status
 * GET /api/v1/wallet/session/:sessionId
 */
router.get('/session/:sessionId', asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  if (!sessionId) {
    throw createValidationError('sessionId is required');
  }

  const session = await walletService.getSigningSession(sessionId);

  if (session) {
    res.status(200).json({
      success: true,
      data: {
        sessionId: session.sessionId,
        status: session.status,
        transactionType: session.transactionType,
        transactionHash: session.transactionHash,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        error: session.error,
        signingUrl: session.signingUrl,
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
        code: 'SESSION_NOT_FOUND',
        message: 'Signing session not found or expired',
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).correlationId,
      },
    });
  }
}));

export default router;