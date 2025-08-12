import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import logger from '../../utils/logger';

export interface ValidationSchemas {
  body?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
}

export const validateRequest = (schemas: ValidationSchemas) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];

    // Validate request body
    if (schemas.body) {
      const { error } = schemas.body.validate(req.body);
      if (error) {
        errors.push(`Body: ${error.details.map(d => d.message).join(', ')}`);
      }
    }

    // Validate query parameters
    if (schemas.query) {
      const { error } = schemas.query.validate(req.query);
      if (error) {
        errors.push(`Query: ${error.details.map(d => d.message).join(', ')}`);
      }
    }

    // Validate route parameters
    if (schemas.params) {
      const { error } = schemas.params.validate(req.params);
      if (error) {
        errors.push(`Params: ${error.details.map(d => d.message).join(', ')}`);
      }
    }

    if (errors.length > 0) {
      logger.warn('Validation error:', { errors, correlationId: (req as any).correlationId });
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: errors,
        },
      });
      return;
    }

    next();
  };
};

// Common validation schemas
export const commonSchemas = {
  // Quote validation
  quoteRequest: Joi.object({
    fromCurrency: Joi.string().valid('KRW', 'USD').required(),
    toCurrency: Joi.string().valid('PHP', 'USDT').required(),
    amount: Joi.number().positive().required(),
    amountType: Joi.string().valid('source', 'destination').required(),
  }),

  // Transfer validation
  transferRequest: Joi.object({
    quoteId: Joi.string().uuid().required(),
    recipientWallet: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required(),
    paymentMethod: Joi.string().valid('onramp', 'blockchain').required(),
  }),

  // Parameter validation
  uuidParam: Joi.object({
    id: Joi.string().uuid().required(),
  }),

  transferParam: Joi.object({
    transferId: Joi.string().uuid().required(),
  }),

  quoteParam: Joi.object({
    quoteId: Joi.string().uuid().required(),
  }),

  // Faucet validation
  faucetRequest: Joi.object({
    walletAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required(),
    amount: Joi.number().positive().max(1000).default(100),
  }),

  // Webhook validation
  dappPortalWebhook: Joi.object({
    sessionId: Joi.string().required(),
    status: Joi.string().valid('transaction_signed', 'transaction_failed').required(),
    transactionData: Joi.object({
      hash: Joi.string().required(),
      signedTransaction: Joi.string().required(),
    }).when('status', {
      is: 'transaction_signed',
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
    timestamp: Joi.string().isoDate().required(),
  }),

  mockPaymentWebhook: Joi.object({
    transactionId: Joi.string().required(),
    status: Joi.string().valid('completed', 'failed').required(),
    amount: Joi.number().positive().required(),
    currency: Joi.string().required(),
    timestamp: Joi.string().isoDate().required(),
  }),
};

// Middleware to validate specific endpoints
export const validateQuoteRequest = validateRequest({
  body: commonSchemas.quoteRequest,
});

export const validateTransferRequest = validateRequest({
  body: commonSchemas.transferRequest,
});

export const validateTransferParam = validateRequest({
  params: commonSchemas.transferParam,
});

export const validateQuoteParam = validateRequest({
  params: commonSchemas.quoteParam,
});

export const validateFaucetRequest = validateRequest({
  body: commonSchemas.faucetRequest,
});

export const validateDappPortalWebhook = validateRequest({
  body: commonSchemas.dappPortalWebhook,
});

export const validateMockPaymentWebhook = validateRequest({
  body: commonSchemas.mockPaymentWebhook,
});