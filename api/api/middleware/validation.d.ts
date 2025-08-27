import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
export interface ValidationSchemas {
    body?: Joi.ObjectSchema;
    query?: Joi.ObjectSchema;
    params?: Joi.ObjectSchema;
}
export declare const validateRequest: (schemas: ValidationSchemas) => (req: Request, res: Response, next: NextFunction) => void;
export declare const commonSchemas: {
    quoteRequest: Joi.ObjectSchema<any>;
    transferRequest: Joi.ObjectSchema<any>;
    uuidParam: Joi.ObjectSchema<any>;
    transferParam: Joi.ObjectSchema<any>;
    quoteParam: Joi.ObjectSchema<any>;
    faucetRequest: Joi.ObjectSchema<any>;
    dappPortalWebhook: Joi.ObjectSchema<any>;
    mockPaymentWebhook: Joi.ObjectSchema<any>;
};
export declare const validateQuoteRequest: (req: Request, res: Response, next: NextFunction) => void;
export declare const validateTransferRequest: (req: Request, res: Response, next: NextFunction) => void;
export declare const validateTransferParam: (req: Request, res: Response, next: NextFunction) => void;
export declare const validateQuoteParam: (req: Request, res: Response, next: NextFunction) => void;
export declare const validateFaucetRequest: (req: Request, res: Response, next: NextFunction) => void;
export declare const validateDappPortalWebhook: (req: Request, res: Response, next: NextFunction) => void;
export declare const validateMockPaymentWebhook: (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=validation.d.ts.map