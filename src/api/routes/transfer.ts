/**
 * Transfer Routes
 * 
 * Provides endpoints for user-authorized gasless transfer creation and status tracking
 * for cross-border remittance transactions.
 */

import { Router, Request, Response } from 'express';
import { transferService } from '../../services/transfer';
import { asyncHandler } from '../middleware/errorHandler';
import { createValidationError } from '../middleware/errorHandler';
import logger from '../../utils/logger';

const router: Router = Router();

/**
 * Create and execute a user-authorized gasless transfer
 * POST /api/v1/transfer
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { quoteId, from, to, signature, nonce, deadline } = req.body;

  if (!quoteId || !from || !to || !signature || nonce === undefined || !deadline) {
    throw createValidationError('quoteId, from, to, signature, nonce, and deadline are required');
  }

  const result = await transferService.createTransfer({
    quoteId,
    from,
    to,
    signature,
    nonce: parseInt(nonce),
    deadline: parseInt(deadline),
  });

  if (result.success && result.transfer) {
    res.status(201).json({
      success: true,
      data: {
        transfer: {
          id: result.transfer.id,
          status: result.transfer.status,
          senderAddress: result.transfer.senderAddress,
          recipientAddress: result.transfer.recipientAddress,
          fromCurrency: result.transfer.fromCurrency,
          toCurrency: result.transfer.toCurrency,
          fromAmount: result.transfer.fromAmount,
          toAmount: result.transfer.toAmount,
          exchangeRate: result.transfer.exchangeRate,
          platformFeeAmount: result.transfer.platformFeeAmount,
          transactionHash: result.transfer.transactionHash,
          createdAt: result.transfer.createdAt,
          completedAt: result.transfer.completedAt,
        },
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).correlationId,
      },
    });

    logger.info('✅ User-authorized transfer processed via API', {
      transferId: result.transfer.id,
      senderAddress: result.transfer.senderAddress,
      recipientAddress: result.transfer.recipientAddress,
      amount: result.transfer.toAmount,
      status: result.transfer.status,
      transactionHash: result.transfer.transactionHash,
      correlationId: (req as any).correlationId,
    });
  } else {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: 'TRANSFER_CREATION_FAILED',
        message: result.error,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).correlationId,
      },
    });
  }
}));

// Note: Transfer execution endpoint removed - transfers are now executed immediately upon creation

/**
 * Get transfer status by ID
 * GET /api/v1/transfer/:transferId
 */
router.get('/:transferId', asyncHandler(async (req: Request, res: Response) => {
  const { transferId } = req.params;

  if (!transferId) {
    throw createValidationError('transferId is required');
  }

  const transfer = await transferService.getTransfer(transferId);

  if (transfer) {
    res.status(200).json({
      success: true,
      data: {
        transfer: {
          id: transfer.id,
          quoteId: transfer.quoteId,
          status: transfer.status,
          fromCurrency: transfer.fromCurrency,
          toCurrency: transfer.toCurrency,
          fromAmount: transfer.fromAmount,
          toAmount: transfer.toAmount,
          exchangeRate: transfer.exchangeRate,
          platformFeeAmount: transfer.platformFeeAmount,
          senderAddress: transfer.senderAddress,
          recipientAddress: transfer.recipientAddress,
          transactionHash: transfer.transactionHash,
          createdAt: transfer.createdAt,
          updatedAt: transfer.updatedAt,
          completedAt: transfer.completedAt,
          error: transfer.error,
        },
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
        code: 'TRANSFER_NOT_FOUND',
        message: 'Transfer not found or expired',
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).correlationId,
      },
    });
  }
}));

/**
 * Get user's transfers by wallet address
 * GET /api/v1/transfer/user/:address
 */
router.get('/user/:address', asyncHandler(async (req: Request, res: Response) => {
  const { address } = req.params;
  const { limit = '10' } = req.query;

  if (!address) {
    throw createValidationError('wallet address is required');
  }

  const transfers = await transferService.getUserTransfers(address, parseInt(limit as string));

  res.status(200).json({
    success: true,
    data: {
      transfers: transfers.map(transfer => ({
        id: transfer.id,
        quoteId: transfer.quoteId,
        status: transfer.status,
        senderAddress: transfer.senderAddress,
        recipientAddress: transfer.recipientAddress,
        fromCurrency: transfer.fromCurrency,
        toCurrency: transfer.toCurrency,
        fromAmount: transfer.fromAmount,
        toAmount: transfer.toAmount,
        exchangeRate: transfer.exchangeRate,
        platformFeeAmount: transfer.platformFeeAmount,
        transactionHash: transfer.transactionHash,
        createdAt: transfer.createdAt,
        completedAt: transfer.completedAt,
      })),
      count: transfers.length,
    },
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: (req as any).correlationId,
    },
  });
}));

/**
 * Cancel a transfer
 * POST /api/v1/transfer/:transferId/cancel
 */
router.post('/:transferId/cancel', asyncHandler(async (req: Request, res: Response) => {
  const { transferId } = req.params;
  const { reason } = req.body;

  if (!transferId) {
    throw createValidationError('transferId is required');
  }

  const result = await transferService.cancelTransfer(transferId, reason);

  if (result.success && result.transfer) {
    res.status(200).json({
      success: true,
      data: {
        transferId: result.transfer.id,
        status: result.transfer.status,
        message: 'Transfer cancelled successfully',
        reason,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).correlationId,
      },
    });

    logger.info('🚫 Transfer cancelled via API', {
      transferId,
      reason,
      correlationId: (req as any).correlationId,
    });
  } else {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: 'TRANSFER_CANCELLATION_FAILED',
        message: result.error,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).correlationId,
      },
    });
  }
}));

export default router;