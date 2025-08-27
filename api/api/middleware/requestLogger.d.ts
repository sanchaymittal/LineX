import { Request, Response, NextFunction, RequestHandler } from 'express';
export declare const correlationMiddleware: (req: Request, res: Response, next: NextFunction) => void;
export declare const morganMiddleware: RequestHandler;
export declare const requestTimingMiddleware: (req: Request, res: Response, next: NextFunction) => void;
export declare const requestSizeLimiter: (req: Request, res: Response, next: NextFunction) => void;
export declare const sanitizeLogData: (data: any) => any;
//# sourceMappingURL=requestLogger.d.ts.map