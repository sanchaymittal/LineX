import { Request, Response, NextFunction } from 'express';
interface SignedRequest extends Request {
    signature?: {
        user: string;
        message: any;
        signature: string;
        recovered: string;
    };
}
export declare const validateEIP712Signature: (req: SignedRequest, res: Response, next: NextFunction) => void;
export declare const createDomain: (contractAddress: string, chainId?: number) => {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
};
export declare const EIP712Types: {
    DeFiDeposit: {
        name: string;
        type: string;
    }[];
    DeFiWithdraw: {
        name: string;
        type: string;
    }[];
    YieldSplit: {
        name: string;
        type: string;
    }[];
    YieldRecombine: {
        name: string;
        type: string;
    }[];
    YieldClaim: {
        name: string;
        type: string;
    }[];
    YieldDistribution: {
        name: string;
        type: string;
    }[];
    PortfolioCreate: {
        name: string;
        type: string;
    }[];
    PortfolioRedeem: {
        name: string;
        type: string;
    }[];
    PortfolioRebalance: {
        name: string;
        type: string;
    }[];
    NYTRedeem: {
        name: string;
        type: string;
    }[];
    AutoCompoundDeposit: {
        name: string;
        type: string;
    }[];
    AutoCompoundWithdraw: {
        name: string;
        type: string;
    }[];
};
export declare const verifyEIP712Signature: (domain: any, types: any, value: any, signature: string, expectedSigner: string) => boolean;
export declare const generateMessageHash: (domain: any, types: any, value: any) => string;
export {};
//# sourceMappingURL=signatureValidation.d.ts.map