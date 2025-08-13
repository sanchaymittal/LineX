/**
 * Webhook Routes
 * 
 * Defines webhook endpoints for external service integrations
 * including DappPortal transaction signing callbacks.
 */

import { Router, Request, Response } from 'express';
import { handleDappPortalWebhook, webhookHealthCheck } from '../webhooks/dappPortalWebhook';
import { asyncHandler } from '../middleware/errorHandler';
import logger from '../../utils/logger';

const router = Router();

// Middleware to log all webhook requests
router.use((req, res, next) => {
  logger.info('📥 Webhook request received', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  next();
});

/**
 * DappPortal webhook endpoint
 * POST /api/v1/webhook/dappportal
 * 
 * Handles transaction signing completion callbacks from DappPortal
 */
router.post('/dappportal', asyncHandler(handleDappPortalWebhook));

/**
 * DappPortal webhook health check
 * GET /api/v1/webhook/dappportal/health
 */
router.get('/dappportal/health', asyncHandler(webhookHealthCheck));

/**
 * Mock payment webhook (for testing)
 * POST /api/v1/webhook/mock
 * 
 * Simulates payment provider webhooks for development/testing
 */
router.post('/mock', asyncHandler(async (req: Request, res: Response) => {
  logger.info('🧪 Mock webhook received', { body: req.body });
  
  res.status(200).json({
    success: true,
    message: 'Mock webhook processed',
    received: req.body,
    timestamp: new Date().toISOString(),
  });
}));

export default router;