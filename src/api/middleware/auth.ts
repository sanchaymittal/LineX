import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import config from '../../config';
import { dataService } from '../../services/redis/dataService';
import logger from '../../utils/logger';

// Request interface is extended in src/types/express.d.ts

export interface JWTPayload {
  lineUserId: string;
  sessionToken: string;
  iat: number;
  exp: number;
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        data: null,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authorization header missing or invalid',
        },
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify JWT token
    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;
    } catch (error) {
      res.status(401).json({
        success: false,
        data: null,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired token',
        },
      });
      return;
    }

    // Check if session exists in Redis
    const session = await dataService.getUserSession(decoded.sessionToken);
    if (!session) {
      res.status(401).json({
        success: false,
        data: null,
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Session has expired',
        },
      });
      return;
    }

    // Check if session is expired
    if (new Date() > new Date(session.expiresAt)) {
      await dataService.deleteUserSession(decoded.sessionToken);
      res.status(401).json({
        success: false,
        data: null,
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Session has expired',
        },
      });
      return;
    }

    // Attach user data to request
    (req as any).user = {
      lineUserId: decoded.lineUserId,
      sessionToken: decoded.sessionToken,
    };

    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      data: null,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication failed',
      },
    });
  }
};

export const optionalAuthMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  try {
    await authMiddleware(req, res, next);
  } catch (error) {
    // Continue without auth if optional
    next();
  }
};

export function generateJWT(lineUserId: string, sessionToken: string): string {
  const payload = { lineUserId, sessionToken };
  return jwt.sign(payload, config.jwt.secret, { expiresIn: '12h' });
}