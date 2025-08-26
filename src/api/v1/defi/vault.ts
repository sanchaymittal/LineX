/**
 * DeFi Vault API Routes
 * Core StandardizedYield vault operations
 */

/// <reference path="../../../types/express.d.ts" />
import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { SYVaultService } from '../../../services/defi/syVaultService';
import { validateEIP712Signature } from '../../middleware/signatureValidation';
import { errorHandler } from '../../middleware/errorHandler';
import logger from '../../../utils/logger';
import { parseUnits, formatUnits } from 'ethers';

const router = Router();

// Auth middleware is applied at the parent router level

/**
 * POST /api/v1/defi/vault/deposit
 * Deposit USDT to SY vault with user authorization
 */
router.post('/deposit',
  [
    body('amount').isString().notEmpty().withMessage('Amount is required'),
    body('signature').isString().notEmpty().withMessage('Signature is required'),
    body('nonce').isInt({ min: 1 }).withMessage('Valid nonce is required'),
    body('deadline').isInt({ min: 1 }).withMessage('Valid deadline is required'),
    validateEIP712Signature
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Invalid input',
          details: errors.array()
        });
        return;
      }

      const { amount, signature, nonce, deadline, senderRawTransaction } = req.body;
      const user = (req as any).user?.walletAddress || (req as any).user?.address;

      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
        return;
      }

      const standardizedYieldService = req.app.locals.services.standardizedYieldService as SYVaultService;
      
      const result = await standardizedYieldService.deposit({
        user,
        amount,
        signature,
        nonce,
        deadline,
        senderRawTransaction
      });

      logger.info(`Vault deposit successful for ${user}: ${result.shares} shares`);

      res.json({
        success: true,
        data: {
          txHash: result.txHash,
          shares: result.shares,
          timestamp: Date.now()
        }
      });
      return;

    } catch (error) {
      logger.error('Vault deposit failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Deposit failed'
      });
      return;
    }
  }
);

/**
 * POST /api/v1/defi/vault/withdraw
 * Withdraw from SY vault with user authorization
 */
router.post('/withdraw',
  [
    body('shares').isString().notEmpty().withMessage('Shares amount is required'),
    body('signature').isString().notEmpty().withMessage('Signature is required'),
    body('nonce').isInt({ min: 1 }).withMessage('Valid nonce is required'),
    body('deadline').isInt({ min: 1 }).withMessage('Valid deadline is required'),
    validateEIP712Signature
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Invalid input',
          details: errors.array()
        });
        return;
      }

      const { shares, signature, nonce, deadline, senderRawTransaction } = req.body;
      const user = (req as any).user?.walletAddress || (req as any).user?.address;

      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
        return;
      }

      const standardizedYieldService = req.app.locals.services.standardizedYieldService as SYVaultService;
      
      const result = await standardizedYieldService.withdraw({
        user,
        shares,
        signature,
        nonce,
        deadline,
        senderRawTransaction
      });

      logger.info(`Vault withdrawal successful for ${user}: ${result.assets} assets`);

      res.json({
        success: true,
        data: {
          txHash: result.txHash,
          assets: result.assets,
          timestamp: Date.now()
        }
      });
      return;

    } catch (error) {
      logger.error('Vault withdrawal failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Withdrawal failed'
      });
      return;
    }
  }
);

/**
 * GET /api/v1/defi/vault/balance/:address
 * Get user's SY vault balance
 */
router.get('/balance/:address',
  [
    param('address').isEthereumAddress().withMessage('Valid Ethereum address required')
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Invalid address format',
          details: errors.array()
        });
        return;
      }

      const address = req.params.address;
      if (!address) {
        res.status(400).json({ success: false, error: 'Address is required' });
        return;
      }
      
      const standardizedYieldService = req.app.locals.services.standardizedYieldService as SYVaultService;
      
      const balance = await standardizedYieldService.getBalance(address);

      res.json({
        success: true,
        data: {
          address,
          balance,
          timestamp: Date.now()
        }
      });
      return;

    } catch (error) {
      logger.error(`Failed to get balance for ${req.params.address}:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch balance'
      });
      return;
    }
  }
);

/**
 * GET /api/v1/defi/vault/apy
 * Get current vault APY
 */
router.get('/apy', async (req: Request, res: Response): Promise<void> => {
  try {
    const standardizedYieldService = req.app.locals.services.standardizedYieldService as SYVaultService;
    const vaultInfo = await standardizedYieldService.getVaultInfo();

    res.json({
      success: true,
      data: {
        apy: vaultInfo.apy,
        totalAssets: vaultInfo.totalAssets,
        totalSupply: vaultInfo.totalSupply,
        timestamp: Date.now()
      }
    });
    return;

  } catch (error) {
    logger.error('Failed to get vault APY:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch APY'
    });
    return;
  }
});

/**
 * GET /api/v1/defi/vault/strategies
 * Get active strategies and allocations
 */
router.get('/strategies', async (req: Request, res: Response): Promise<void> => {
  try {
    const standardizedYieldService = req.app.locals.services.standardizedYieldService as SYVaultService;
    const vaultInfo = await standardizedYieldService.getVaultInfo();

    res.json({
      success: true,
      data: {
        strategies: vaultInfo.strategies,
        totalStrategies: vaultInfo.strategies.length,
        timestamp: Date.now()
      }
    });
    return;

  } catch (error) {
    logger.error('Failed to get vault strategies:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch strategies'
    });
    return;
  }
});

/**
 * POST /api/v1/defi/vault/deposit/preview
 * Preview deposit to SY vault (calculate expected shares)
 */
router.post('/deposit/preview',
  [
    body('amount').isString().notEmpty().withMessage('Amount is required'),
    body('userAddress').isEthereumAddress().withMessage('Valid user address required')
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Invalid input',
          details: errors.array()
        });
        return;
      }

      const { amount, userAddress } = req.body;
      const standardizedYieldService = req.app.locals.services.standardizedYieldService as SYVaultService;
      
      try {
        // Get vault info for calculations
        const vaultInfo = await standardizedYieldService.getVaultInfo();
        
        // Calculate expected shares (1:1 for simplicity, or use actual contract previewDeposit)
        const amountBN = parseUnits(amount, 6); // USDT has 6 decimals
        const totalAssets = parseUnits(vaultInfo.totalAssets || '1000000', 6);
        const totalSupply = parseUnits(vaultInfo.totalSupply || '1000000', 18);
        
        // Calculate share price and expected shares
        const sharePrice = totalSupply > 0 ? (totalAssets * parseUnits('1', 18)) / totalSupply : parseUnits('1', 18);
        const expectedShares = (amountBN * parseUnits('1', 18)) / sharePrice;
        
        // Estimate gas (mock values)
        const gasEstimate = {
          gasLimit: '500000',
          gasPrice: '25000000000', // 25 gwei
          estimatedCost: '0.0125' // ETH equivalent
        };
        
        const preview = {
          deposit: {
            amount: amount,
            asset: 'USDT'
          },
          expected: {
            shares: formatUnits(expectedShares, 18),
            sharePrice: formatUnits(sharePrice, 18),
            slippage: '0.1', // 0.1% estimated slippage
            minimumShares: formatUnits(expectedShares * BigInt(999) / BigInt(1000), 18) // 0.1% slippage tolerance
          },
          fees: {
            platformFee: '0', // No platform fee for deposits
            networkFee: gasEstimate.estimatedCost
          },
          gasEstimate,
          vaultInfo: {
            currentAPY: vaultInfo.apy,
            totalAssets: vaultInfo.totalAssets,
            utilizationRate: '95.0',
            strategies: vaultInfo.strategies?.length || 3
          },
          risks: {
            level: 2,
            factors: ['Strategy allocation risk', 'Smart contract risk', 'Market volatility']
          },
          timestamp: Date.now()
        };

        res.json({
          success: true,
          data: preview
        });
        return;

      } catch (error) {
        logger.error('Failed to generate deposit preview:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to calculate deposit preview'
        });
        return;
      }

    } catch (error) {
      logger.error('Deposit preview failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Preview failed'
      });
      return;
    }
  }
);

/**
 * POST /api/v1/defi/vault/withdraw/preview
 * Preview withdrawal from SY vault (calculate expected assets)
 */
router.post('/withdraw/preview',
  [
    body('shares').isString().notEmpty().withMessage('Shares amount is required'),
    body('userAddress').isEthereumAddress().withMessage('Valid user address required')
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Invalid input',
          details: errors.array()
        });
        return;
      }

      const { shares, userAddress } = req.body;
      const standardizedYieldService = req.app.locals.services.standardizedYieldService as SYVaultService;
      
      try {
        // Get vault info and user balance for calculations
        const vaultInfo = await standardizedYieldService.getVaultInfo();
        const userBalance = await standardizedYieldService.getBalance(userAddress);
        
        // Calculate expected assets
        const sharesBN = parseUnits(shares, 18);
        const totalAssets = parseUnits(vaultInfo.totalAssets || '1000000', 6);
        const totalSupply = parseUnits(vaultInfo.totalSupply || '1000000', 18);
        
        // Calculate expected assets
        const expectedAssets = totalSupply > 0 ? (sharesBN * totalAssets) / totalSupply : BigInt(0);
        
        // Check if user has enough shares
        const userShares = parseUnits(userBalance.syShares || '0', 18);
        const canWithdraw = userShares >= sharesBN;
        
        // Estimate gas
        const gasEstimate = {
          gasLimit: '400000',
          gasPrice: '25000000000',
          estimatedCost: '0.01'
        };
        
        // Calculate withdrawal fee (0% for SY vault)
        const withdrawalFee = BigInt(0);
        const assetsAfterFee = expectedAssets - withdrawalFee;
        
        const preview = {
          withdrawal: {
            shares: shares,
            maxShares: formatUnits(userShares, 18)
          },
          expected: {
            assets: formatUnits(expectedAssets, 6),
            assetsAfterFee: formatUnits(assetsAfterFee, 6),
            asset: 'USDT',
            sharePrice: totalSupply > 0 ? formatUnits((totalAssets * parseUnits('1', 18)) / totalSupply, 18) : '1.0'
          },
          fees: {
            withdrawalFee: '0', // 0% withdrawal fee for SY vault
            withdrawalFeeAmount: '0',
            networkFee: gasEstimate.estimatedCost
          },
          validation: {
            canWithdraw,
            reason: canWithdraw ? null : 'Insufficient shares balance'
          },
          gasEstimate,
          taxImplications: {
            gainLoss: 'TBD', // Would calculate based on entry price
            taxCategory: 'Capital gains (consult tax advisor)'
          },
          timing: {
            processingTime: '1-2 minutes',
            cooldownPeriod: 'None'
          },
          timestamp: Date.now()
        };

        res.json({
          success: true,
          data: preview
        });
        return;

      } catch (error) {
        logger.error('Failed to generate withdrawal preview:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to calculate withdrawal preview'
        });
        return;
      }

    } catch (error) {
      logger.error('Withdrawal preview failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Preview failed'
      });
      return;
    }
  }
);

// Apply error handler
router.use(errorHandler);

export default router;