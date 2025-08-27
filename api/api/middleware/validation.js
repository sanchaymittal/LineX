"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateMockPaymentWebhook = exports.validateDappPortalWebhook = exports.validateFaucetRequest = exports.validateQuoteParam = exports.validateTransferParam = exports.validateTransferRequest = exports.validateQuoteRequest = exports.commonSchemas = exports.validateRequest = void 0;
const joi_1 = __importDefault(require("joi"));
const logger_1 = __importDefault(require("../../utils/logger"));
const validateRequest = (schemas) => {
    return (req, res, next) => {
        const errors = [];
        if (schemas.body) {
            const { error } = schemas.body.validate(req.body);
            if (error) {
                errors.push(`Body: ${error.details.map(d => d.message).join(', ')}`);
            }
        }
        if (schemas.query) {
            const { error } = schemas.query.validate(req.query);
            if (error) {
                errors.push(`Query: ${error.details.map(d => d.message).join(', ')}`);
            }
        }
        if (schemas.params) {
            const { error } = schemas.params.validate(req.params);
            if (error) {
                errors.push(`Params: ${error.details.map(d => d.message).join(', ')}`);
            }
        }
        if (errors.length > 0) {
            logger_1.default.warn('Validation error:', { errors, correlationId: req.correlationId });
            res.status(400).json({
                success: false,
                data: null,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Request validation failed',
                    details: errors,
                },
            });
            return;
        }
        next();
    };
};
exports.validateRequest = validateRequest;
exports.commonSchemas = {
    quoteRequest: joi_1.default.object({
        fromCurrency: joi_1.default.string().valid('KRW', 'USD').required(),
        toCurrency: joi_1.default.string().valid('PHP', 'USDT').required(),
        amount: joi_1.default.number().positive().required(),
        amountType: joi_1.default.string().valid('source', 'destination').required(),
    }),
    transferRequest: joi_1.default.object({
        quoteId: joi_1.default.string().uuid().required(),
        recipientWallet: joi_1.default.string().pattern(/^0x[a-fA-F0-9]{40}$/).required(),
        paymentMethod: joi_1.default.string().valid('onramp', 'blockchain').required(),
    }),
    uuidParam: joi_1.default.object({
        id: joi_1.default.string().uuid().required(),
    }),
    transferParam: joi_1.default.object({
        transferId: joi_1.default.string().uuid().required(),
    }),
    quoteParam: joi_1.default.object({
        quoteId: joi_1.default.string().uuid().required(),
    }),
    faucetRequest: joi_1.default.object({
        walletAddress: joi_1.default.string().pattern(/^0x[a-fA-F0-9]{40}$/).required(),
        amount: joi_1.default.number().positive().max(1000).default(100),
    }),
    dappPortalWebhook: joi_1.default.object({
        sessionId: joi_1.default.string().required(),
        status: joi_1.default.string().valid('transaction_signed', 'transaction_failed').required(),
        transactionData: joi_1.default.object({
            hash: joi_1.default.string().required(),
            signedTransaction: joi_1.default.string().required(),
        }).when('status', {
            is: 'transaction_signed',
            then: joi_1.default.required(),
            otherwise: joi_1.default.optional(),
        }),
        timestamp: joi_1.default.string().isoDate().required(),
    }),
    mockPaymentWebhook: joi_1.default.object({
        transactionId: joi_1.default.string().required(),
        status: joi_1.default.string().valid('completed', 'failed').required(),
        amount: joi_1.default.number().positive().required(),
        currency: joi_1.default.string().required(),
        timestamp: joi_1.default.string().isoDate().required(),
    }),
};
exports.validateQuoteRequest = (0, exports.validateRequest)({
    body: exports.commonSchemas.quoteRequest,
});
exports.validateTransferRequest = (0, exports.validateRequest)({
    body: exports.commonSchemas.transferRequest,
});
exports.validateTransferParam = (0, exports.validateRequest)({
    params: exports.commonSchemas.transferParam,
});
exports.validateQuoteParam = (0, exports.validateRequest)({
    params: exports.commonSchemas.quoteParam,
});
exports.validateFaucetRequest = (0, exports.validateRequest)({
    body: exports.commonSchemas.faucetRequest,
});
exports.validateDappPortalWebhook = (0, exports.validateRequest)({
    body: exports.commonSchemas.dappPortalWebhook,
});
exports.validateMockPaymentWebhook = (0, exports.validateRequest)({
    body: exports.commonSchemas.mockPaymentWebhook,
});
//# sourceMappingURL=validation.js.map