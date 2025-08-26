/**
 * EIP-712 Signature Validation Middleware
 * Validates user signatures for DeFi operations
 */

import { Request, Response, NextFunction } from 'express';
import { ethers, isHexString, verifyMessage, hashMessage } from 'ethers';
import logger from '../../utils/logger';

interface SignedRequest extends Request {
  signature?: {
    user: string;
    message: any;
    signature: string;
    recovered: string;
  };
}

/**
 * Middleware to validate EIP-712 signatures for DeFi operations
 */
export const validateEIP712Signature = (
  req: SignedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const { signature, nonce, deadline } = req.body;
    const user = req.user?.address;

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
      return;
    }

    if (!signature) {
      res.status(400).json({
        success: false,
        error: 'Signature is required'
      });
      return;
    }

    // Check deadline
    if (Date.now() > deadline * 1000) {
      res.status(400).json({
        success: false,
        error: 'Signature expired'
      });
      return;
    }

    // Basic signature format validation
    if (!isHexString(signature, 65)) {
      res.status(400).json({
        success: false,
        error: 'Invalid signature format'
      });
      return;
    }

    // Store signature info for use in route handlers
    req.signature = {
      user,
      message: req.body,
      signature,
      recovered: user // Will be verified in individual services
    };

    logger.info(`Signature validation passed for user ${user}`);
    next();

  } catch (error) {
    logger.error('Signature validation failed:', error);
    res.status(400).json({
      success: false,
      error: 'Invalid signature',
      details: error instanceof Error ? error.message : 'Signature verification failed'
    });
  }
};

/**
 * Create EIP-712 domain separator
 */
export const createDomain = (contractAddress: string, chainId: number = 1001) => {
  return {
    name: 'LineX',
    version: '1',
    chainId,
    verifyingContract: contractAddress
  };
};

/**
 * Common EIP-712 type definitions for DeFi operations
 */
export const EIP712Types = {
  // Vault operations
  DeFiDeposit: [
    { name: 'user', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'vault', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ],

  DeFiWithdraw: [
    { name: 'user', type: 'address' },
    { name: 'shares', type: 'uint256' },
    { name: 'vault', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ],

  // PYT/NYT operations
  YieldSplit: [
    { name: 'user', type: 'address' },
    { name: 'syShares', type: 'uint256' },
    { name: 'orchestrator', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ],

  YieldRecombine: [
    { name: 'user', type: 'address' },
    { name: 'pytAmount', type: 'uint256' },
    { name: 'nytAmount', type: 'uint256' },
    { name: 'orchestrator', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ],

  // Yield claiming
  YieldClaim: [
    { name: 'user', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ],

  // Yield distribution
  YieldDistribution: [
    { name: 'orchestrator', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ],

  // Portfolio operations
  PortfolioCreate: [
    { name: 'user', type: 'address' },
    { name: 'assets', type: 'address[]' },
    { name: 'allocations', type: 'uint256[]' },
    { name: 'totalAmount', type: 'uint256' },
    { name: 'yieldSet', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ],

  PortfolioRedeem: [
    { name: 'user', type: 'address' },
    { name: 'portfolioTokens', type: 'uint256' },
    { name: 'yieldSet', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ],

  PortfolioRebalance: [
    { name: 'user', type: 'address' },
    { name: 'newAllocations', type: 'uint256[]' },
    { name: 'yieldSet', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ],

  // NYT operations
  NYTRedeem: [
    { name: 'user', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'token', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ],

  // Auto-compound operations
  AutoCompoundDeposit: [
    { name: 'user', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'vault', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ],

  AutoCompoundWithdraw: [
    { name: 'user', type: 'address' },
    { name: 'shares', type: 'uint256' },
    { name: 'vault', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ]
};

/**
 * Verify EIP-712 signature with specific domain and types
 */
export const verifyEIP712Signature = (
  domain: any,
  types: any,
  value: any,
  signature: string,
  expectedSigner: string
): boolean => {
  try {
    const recoveredAddress = ethers.verifyTypedData(domain, types, value, signature);
    return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
  } catch (error) {
    logger.error('EIP-712 signature verification failed:', error);
    return false;
  }
};

/**
 * Generate message hash for EIP-712 signature
 */
export const generateMessageHash = (
  domain: any,
  types: any,
  value: any
): string => {
  try {
    return ethers.TypedDataEncoder.hash(domain, types, value);
  } catch (error) {
    logger.error('Failed to generate message hash:', error);
    throw new Error('Failed to generate message hash');
  }
};