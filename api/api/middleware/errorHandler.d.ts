import { Request, Response, NextFunction } from 'express';
export interface CustomError extends Error {
    statusCode?: number;
    code?: string;
    details?: any;
}
export declare class AppError extends Error implements CustomError {
    readonly statusCode: number;
    readonly code: string;
    readonly details?: any;
    constructor(message: string, statusCode?: number, code?: string, details?: any);
}
export declare const errorHandler: (error: CustomError, req: Request, res: Response, next: NextFunction) => void;
export declare const notFoundHandler: (req: Request, res: Response) => void;
export declare const asyncHandler: (fn: Function) => (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const createValidationError: (message: string, details?: any) => AppError;
export declare const createNotFoundError: (resource: string) => AppError;
export declare const createUnauthorizedError: (message?: string) => AppError;
export declare const createForbiddenError: (message?: string) => AppError;
export declare const createConflictError: (message: string) => AppError;
export declare const createRateLimitError: (message?: string) => AppError;
export declare const createInternalError: (message?: string, details?: any) => AppError;
//# sourceMappingURL=errorHandler.d.ts.map