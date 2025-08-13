/**
 * Transfer Routes
 * 
 * Provides endpoints for transfer creation, execution, and status tracking
 * for cross-border remittance transactions.
 */

import { Router, Request, Response } from 'express';
import { transferService } from '../../services/transfer';
import { asyncHandler } from '../middleware/errorHandler';
import { createValidationError } from '../middleware/errorHandler';
import logger from '../../utils/logger';

const router = Router();

/**
 * Create a new transfer from a quote
 * POST /api/v1/transfer
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { quoteId, sender, recipient, gasless = true, metadata } = req.body;

  if (!quoteId || !sender || !recipient) {
    throw createValidationError('quoteId, sender, and recipient are required');
  }

  if (!sender.lineUserId || !sender.country) {
    throw createValidationError('sender.lineUserId and sender.country are required');
  }

  if (!recipient.country) {
    throw createValidationError('recipient.country is required');
  }

  const result = await transferService.createTransfer({
    quoteId,
    sender,
    recipient,
    gasless,
    metadata,
  });

  if (result.success && result.transfer) {
    res.status(201).json({
      success: true,
      data: {
        transfer: {
          id: result.transfer.id,
          status: result.transfer.status,
          fromCurrency: result.transfer.fromCurrency,
          toCurrency: result.transfer.toCurrency,
          fromAmount: result.transfer.fromAmount,
          toAmount: result.transfer.toAmount,
          exchangeRate: result.transfer.exchangeRate,
          platformFeeAmount: result.transfer.platformFeeAmount,
          totalCost: result.transfer.totalCost,
          gasless: result.transfer.gasless,
          sender: {
            lineUserId: result.transfer.sender.lineUserId,
            country: result.transfer.sender.country,
            name: result.transfer.sender.name,
          },
          recipient: {
            country: result.transfer.recipient.country,
            name: result.transfer.recipient.name,
          },
          createdAt: result.transfer.createdAt,
          expiresAt: result.transfer.expiresAt,
        },
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).correlationId,
      },
    });

    logger.info('✅ Transfer created via API', {
      transferId: result.transfer.id,
      quoteId,
      gasless,
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

/**
 * Execute a transfer (initiate signing/processing)
 * POST /api/v1/transfer/:transferId/execute
 */
router.post('/:transferId/execute', asyncHandler(async (req: Request, res: Response) => {
  const { transferId } = req.params;

  if (!transferId) {
    throw createValidationError('transferId is required');
  }

  const result = await transferService.executeTransfer(transferId);

  if (result.success && result.transfer) {
    const responseData: any = {
      transferId: result.transfer.id,
      status: result.transfer.status,
      gasless: result.transfer.gasless,
    };

    if (result.transfer.gasless) {
      responseData.message = 'Gasless transfer completed successfully';
      responseData.transactionHash = result.transfer.transactionHash;
      responseData.completedAt = result.transfer.completedAt;
    } else {
      responseData.message = 'Please complete signing to execute transfer';
      responseData.signingSessionId = result.transfer.signingSessionId;
      // Note: signingUrl would come from the wallet service in a real implementation
    }

    res.status(200).json({
      success: true,
      data: responseData,
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).correlationId,
      },
    });

    logger.info('✅ Transfer executed via API', {
      transferId,
      status: result.transfer.status,
      gasless: result.transfer.gasless,
      correlationId: (req as any).correlationId,
    });
  } else {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: 'TRANSFER_EXECUTION_FAILED',
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
          totalCost: transfer.totalCost,
          gasless: transfer.gasless,
          sender: {
            lineUserId: transfer.sender.lineUserId,
            country: transfer.sender.country,
            name: transfer.sender.name,
          },
          recipient: {
            country: transfer.recipient.country,
            name: transfer.recipient.name,
          },
          signingSessionId: transfer.signingSessionId,
          transactionHash: transfer.transactionHash,
          createdAt: transfer.createdAt,
          updatedAt: transfer.updatedAt,
          expiresAt: transfer.expiresAt,
          completedAt: transfer.completedAt,
          error: transfer.error,
          retryCount: transfer.retryCount,
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
 * Get user's transfers
 * GET /api/v1/transfer/user/:lineUserId
 */
router.get('/user/:lineUserId', asyncHandler(async (req: Request, res: Response) => {
  const { lineUserId } = req.params;
  const { limit = '10' } = req.query;

  if (!lineUserId) {
    throw createValidationError('lineUserId is required');
  }

  const transfers = await transferService.getUserTransfers(lineUserId, parseInt(limit as string));

  res.status(200).json({
    success: true,
    data: {
      transfers: transfers.map(transfer => ({
        id: transfer.id,
        quoteId: transfer.quoteId,
        status: transfer.status,
        fromCurrency: transfer.fromCurrency,
        toCurrency: transfer.toCurrency,
        fromAmount: transfer.fromAmount,
        toAmount: transfer.toAmount,
        totalCost: transfer.totalCost,
        gasless: transfer.gasless,
        recipient: {
          country: transfer.recipient.country,
          name: transfer.recipient.name,
        },
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