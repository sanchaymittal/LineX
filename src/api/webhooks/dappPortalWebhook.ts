/**
 * DappPortal Webhook Handler
 * 
 * Handles webhook callbacks from DappPortal when users complete transaction signing.
 * Implements HMAC signature verification for security (configurable for demo mode).
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import { walletService } from '../../services/wallet';
import logger from '../../utils/logger';
import config from '../../config';

export interface DappPortalWebhookPayload {
  sessionId: string;
  transactionHash?: string;
  status: 'signed' | 'failed' | 'timeout';
  error?: string;
  timestamp: number;
  signature?: string;
}

/**
 * Verify HMAC signature for webhook security
 */
function verifyWebhookSignature(payload: string, signature: string): boolean {
  try {
    const webhookSecret = config.dappPortal?.webhookSecret;
    if (!webhookSecret) {
      logger.warn('⚠️ Webhook secret not configured, skipping signature verification');
      return true; // Allow in demo mode
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload, 'utf8')
      .digest('hex');

    const providedSignature = signature.replace('sha256=', '');
    
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(providedSignature, 'hex')
    );
  } catch (error) {
    logger.error('❌ Webhook signature verification failed:', error);
    return false;
  }
}

/**
 * Handle DappPortal webhook for transaction signing completion
 */
export async function handleDappPortalWebhook(req: Request, res: Response): Promise<void> {
  try {
    const payload = JSON.stringify(req.body);
    const signature = req.headers['x-dappportal-signature'] as string;

    logger.info('🔔 Received DappPortal webhook', {
      headers: {
        signature: signature ? 'present' : 'missing',
        contentType: req.headers['content-type'],
      },
      bodySize: payload.length,
    });

    // Verify webhook signature in production
    if (!config.demo.enabled && signature) {
      if (!verifyWebhookSignature(payload, signature)) {
        logger.error('❌ Invalid webhook signature');
        res.status(401).json({
          success: false,
          error: 'Invalid signature',
        });
        return;
      }
    }

    const webhookData: DappPortalWebhookPayload = req.body;

    // Validate required fields
    if (!webhookData.sessionId || !webhookData.status) {
      logger.error('❌ Invalid webhook payload', { payload: webhookData });
      res.status(400).json({
        success: false,
        error: 'Invalid webhook payload',
      });
      return;
    }

    // Validate timestamp (prevent replay attacks)
    const now = Date.now() / 1000;
    const webhookTime = webhookData.timestamp || now;
    const timeDiff = Math.abs(now - webhookTime);
    
    if (timeDiff > 300) { // 5 minutes tolerance
      logger.error('❌ Webhook timestamp too old', { 
        timeDiff,
        webhookTime,
        currentTime: now,
      });
      res.status(400).json({
        success: false,
        error: 'Webhook timestamp too old',
      });
      return;
    }

    // Process the webhook
    const result = await walletService.handleSigningWebhook({
      sessionId: webhookData.sessionId,
      transactionHash: webhookData.transactionHash,
      status: webhookData.status === 'signed' ? 'signed' : 'failed',
      error: webhookData.error,
    });

    if (result.success) {
      logger.info('✅ DappPortal webhook processed successfully', {
        sessionId: webhookData.sessionId,
        status: webhookData.status,
        transactionHash: webhookData.transactionHash,
      });

      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully',
      });
    } else {
      logger.error('❌ Failed to process DappPortal webhook', {
        sessionId: webhookData.sessionId,
        error: result.error,
      });

      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    logger.error('❌ DappPortal webhook handler error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}

/**
 * Health check endpoint for webhook
 */
export async function webhookHealthCheck(req: Request, res: Response): Promise<void> {
  res.status(200).json({
    success: true,
    message: 'DappPortal webhook endpoint is healthy',
    timestamp: new Date().toISOString(),
  });
}