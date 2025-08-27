import { Request, Response, NextFunction } from 'express';
import cors from 'cors';
export declare const corsMiddleware: (req: cors.CorsRequest, res: {
    statusCode?: number | undefined;
    setHeader(key: string, value: string): any;
    end(): any;
}, next: (err?: any) => any) => void;
export declare const customCorsMiddleware: (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=cors.d.ts.map