/**
 * Webhook Routes
 * 
 * Simple webhook endpoints for development and testing.
 * DappPortal webhooks removed - all authorization now handled via frontend signatures.
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import logger from '../../utils/logger';

const router: Router = Router();

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

/**
 * General webhook health check
 * GET /api/v1/webhook/health
 */
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Webhook system healthy',
    timestamp: new Date().toISOString(),
  });
}));

export default router;