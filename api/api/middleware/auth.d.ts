import { Request, Response, NextFunction } from 'express';
export interface JWTPayload {
    walletAddress: string;
    sessionToken: string;
    iat: number;
    exp: number;
}
export declare const authMiddleware: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const optionalAuthMiddleware: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare function generateJWT(walletAddress: string, sessionToken: string): string;
//# sourceMappingURL=auth.d.ts.map