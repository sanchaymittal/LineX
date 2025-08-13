/**
 * Quote Routes
 * 
 * Provides endpoints for quote generation, retrieval, and exchange rate information
 * for cross-border remittance transactions.
 */

import { Router, Request, Response } from 'express';
import { quoteService } from '../../services/quote';
import { asyncHandler } from '../middleware/errorHandler';
import { createValidationError } from '../middleware/errorHandler';
import logger from '../../utils/logger';

const router: Router = Router();

/**
 * Generate a new quote
 * POST /api/v1/quote
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { fromCurrency, toCurrency, fromAmount, lineUserId } = req.body;

  if (!fromCurrency || !toCurrency || !fromAmount || !lineUserId) {
    throw createValidationError('fromCurrency, toCurrency, fromAmount, and lineUserId are required');
  }

  const result = await quoteService.generateQuote({
    fromCurrency: fromCurrency.toUpperCase(),
    toCurrency: toCurrency.toUpperCase(),
    fromAmount: parseFloat(fromAmount),
    lineUserId,
  });

  if (result.success && result.quote) {
    res.status(201).json({
      success: true,
      data: {
        quote: {
          id: result.quote.id,
          fromCurrency: result.quote.fromCurrency,
          toCurrency: result.quote.toCurrency,
          fromAmount: result.quote.fromAmount,
          toAmount: result.quote.toAmount,
          exchangeRate: result.quote.exchangeRate,
          platformFee: result.quote.platformFee,
          platformFeeAmount: result.quote.platformFeeAmount,
          totalCost: result.quote.totalCost,
          expiresAt: result.quote.expiresAt,
          isValid: result.quote.isValid,
        },
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).correlationId,
      },
    });

    logger.info('✅ Quote generated via API', {
      quoteId: result.quote.id,
      fromCurrency: result.quote.fromCurrency,
      toCurrency: result.quote.toCurrency,
      fromAmount: result.quote.fromAmount,
      lineUserId,
      correlationId: (req as any).correlationId,
    });
  } else {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: 'QUOTE_GENERATION_FAILED',
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
 * Get quote by ID
 * GET /api/v1/quote/:quoteId
 */
router.get('/:quoteId', asyncHandler(async (req: Request, res: Response) => {
  const { quoteId } = req.params;

  if (!quoteId) {
    throw createValidationError('quoteId is required');
  }

  const quote = await quoteService.getQuote(quoteId);

  if (quote) {
    res.status(200).json({
      success: true,
      data: {
        quote: {
          id: quote.id,
          fromCurrency: quote.fromCurrency,
          toCurrency: quote.toCurrency,
          fromAmount: quote.fromAmount,
          toAmount: quote.toAmount,
          exchangeRate: quote.exchangeRate,
          platformFee: quote.platformFee,
          platformFeeAmount: quote.platformFeeAmount,
          totalCost: quote.totalCost,
          createdAt: quote.createdAt,
          expiresAt: quote.expiresAt,
          isValid: quote.isValid,
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
        code: 'QUOTE_NOT_FOUND',
        message: 'Quote not found or expired',
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).correlationId,
      },
    });
  }
}));

/**
 * Validate a quote
 * GET /api/v1/quote/:quoteId/validate
 */
router.get('/:quoteId/validate', asyncHandler(async (req: Request, res: Response) => {
  const { quoteId } = req.params;

  if (!quoteId) {
    throw createValidationError('quoteId is required');
  }

  const validation = await quoteService.validateQuote(quoteId);

  if (validation.isValid && validation.quote) {
    res.status(200).json({
      success: true,
      data: {
        isValid: true,
        quote: {
          id: validation.quote.id,
          fromCurrency: validation.quote.fromCurrency,
          toCurrency: validation.quote.toCurrency,
          fromAmount: validation.quote.fromAmount,
          toAmount: validation.quote.toAmount,
          exchangeRate: validation.quote.exchangeRate,
          platformFeeAmount: validation.quote.platformFeeAmount,
          totalCost: validation.quote.totalCost,
          expiresAt: validation.quote.expiresAt,
        },
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).correlationId,
      },
    });
  } else {
    res.status(400).json({
      success: false,
      data: {
        isValid: false,
        quote: validation.quote ? {
          id: validation.quote.id,
          expiresAt: validation.quote.expiresAt,
          isValid: validation.quote.isValid,
        } : null,
      },
      error: {
        code: 'QUOTE_INVALID',
        message: validation.error,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: (req as any).correlationId,
      },
    });
  }
}));

/**
 * Get current exchange rates
 * GET /api/v1/quote/rates
 */
router.get('/rates/current', asyncHandler(async (req: Request, res: Response) => {
  const rates = quoteService.getCurrentRates();
  const currencyPairs = quoteService.getAvailableCurrencyPairs();

  res.status(200).json({
    success: true,
    data: {
      rates,
      currencyPairs,
      lastUpdated: new Date().toISOString(),
      platformFee: 0.005, // 0.5%
    },
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: (req as any).correlationId,
    },
  });
}));

/**
 * Get available currency pairs
 * GET /api/v1/quote/currencies
 */
router.get('/currencies/pairs', asyncHandler(async (req: Request, res: Response) => {
  const currencyPairs = quoteService.getAvailableCurrencyPairs();

  res.status(200).json({
    success: true,
    data: {
      supportedCurrencies: ['USD', 'KRW', 'PHP'],
      currencyPairs,
      platformFee: 0.005,
      minimumAmounts: {
        USD: 1.0,
        KRW: 1000,
        PHP: 50,
      },
      maximumAmounts: {
        USD: 10000,
        KRW: 10000000,
        PHP: 500000,
      },
    },
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: (req as any).correlationId,
    },
  });
}));

export default router;