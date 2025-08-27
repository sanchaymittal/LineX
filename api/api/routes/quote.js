"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const quote_1 = require("../../services/quote");
const errorHandler_1 = require("../middleware/errorHandler");
const errorHandler_2 = require("../middleware/errorHandler");
const logger_1 = __importDefault(require("../../utils/logger"));
const router = (0, express_1.Router)();
router.post('/', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { fromCurrency, toCurrency, fromAmount } = req.body;
    if (!fromCurrency || !toCurrency || !fromAmount) {
        throw (0, errorHandler_2.createValidationError)('fromCurrency, toCurrency, and fromAmount are required');
    }
    const result = await quote_1.quoteService.generateQuote({
        fromCurrency: fromCurrency.toUpperCase(),
        toCurrency: toCurrency.toUpperCase(),
        fromAmount: parseFloat(fromAmount),
    });
    if (result.success && result.quote) {
        res.status(201).json({
            success: true,
            data: {
                quote: {
                    id: result.quote.id,
                    fromCurrency: result.quote.fromCurrency,
                    toCurrency: result.quote.toCurrency,
                    fromAmount: result.quote.fromAmount,
                    toAmount: result.quote.toAmount,
                    exchangeRate: result.quote.exchangeRate,
                    platformFee: result.quote.platformFee,
                    platformFeeAmount: result.quote.platformFeeAmount,
                    totalCost: result.quote.totalCost,
                    expiresAt: result.quote.expiresAt,
                    isValid: result.quote.isValid,
                },
            },
            metadata: {
                timestamp: new Date().toISOString(),
                requestId: req.correlationId,
            },
        });
        logger_1.default.info('✅ Quote generated via API', {
            quoteId: result.quote.id,
            fromCurrency: result.quote.fromCurrency,
            toCurrency: result.quote.toCurrency,
            fromAmount: result.quote.fromAmount,
            correlationId: req.correlationId,
        });
    }
    else {
        res.status(400).json({
            success: false,
            data: null,
            error: {
                code: 'QUOTE_GENERATION_FAILED',
                message: result.error,
            },
            metadata: {
                timestamp: new Date().toISOString(),
                requestId: req.correlationId,
            },
        });
    }
}));
router.get('/:quoteId', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { quoteId } = req.params;
    if (!quoteId) {
        throw (0, errorHandler_2.createValidationError)('quoteId is required');
    }
    const quote = await quote_1.quoteService.getQuote(quoteId);
    if (quote) {
        res.status(200).json({
            success: true,
            data: {
                quote: {
                    id: quote.id,
                    fromCurrency: quote.fromCurrency,
                    toCurrency: quote.toCurrency,
                    fromAmount: quote.fromAmount,
                    toAmount: quote.toAmount,
                    exchangeRate: quote.exchangeRate,
                    platformFee: quote.platformFee,
                    platformFeeAmount: quote.platformFeeAmount,
                    totalCost: quote.totalCost,
                    createdAt: quote.createdAt,
                    expiresAt: quote.expiresAt,
                    isValid: quote.isValid,
                },
            },
            metadata: {
                timestamp: new Date().toISOString(),
                requestId: req.correlationId,
            },
        });
    }
    else {
        res.status(404).json({
            success: false,
            data: null,
            error: {
                code: 'QUOTE_NOT_FOUND',
                message: 'Quote not found or expired',
            },
            metadata: {
                timestamp: new Date().toISOString(),
                requestId: req.correlationId,
            },
        });
    }
}));
router.get('/:quoteId/validate', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { quoteId } = req.params;
    if (!quoteId) {
        throw (0, errorHandler_2.createValidationError)('quoteId is required');
    }
    const validation = await quote_1.quoteService.validateQuote(quoteId);
    if (validation.isValid && validation.quote) {
        res.status(200).json({
            success: true,
            data: {
                isValid: true,
                quote: {
                    id: validation.quote.id,
                    fromCurrency: validation.quote.fromCurrency,
                    toCurrency: validation.quote.toCurrency,
                    fromAmount: validation.quote.fromAmount,
                    toAmount: validation.quote.toAmount,
                    exchangeRate: validation.quote.exchangeRate,
                    platformFeeAmount: validation.quote.platformFeeAmount,
                    totalCost: validation.quote.totalCost,
                    expiresAt: validation.quote.expiresAt,
                },
            },
            metadata: {
                timestamp: new Date().toISOString(),
                requestId: req.correlationId,
            },
        });
    }
    else {
        res.status(400).json({
            success: false,
            data: {
                isValid: false,
                quote: validation.quote ? {
                    id: validation.quote.id,
                    expiresAt: validation.quote.expiresAt,
                    isValid: validation.quote.isValid,
                } : null,
            },
            error: {
                code: 'QUOTE_INVALID',
                message: validation.error,
            },
            metadata: {
                timestamp: new Date().toISOString(),
                requestId: req.correlationId,
            },
        });
    }
}));
router.get('/rates/current', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const rates = quote_1.quoteService.getCurrentRates();
    const currencyPairs = quote_1.quoteService.getAvailableCurrencyPairs();
    res.status(200).json({
        success: true,
        data: {
            rates,
            currencyPairs,
            lastUpdated: new Date().toISOString(),
            platformFee: 0.005,
        },
        metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.correlationId,
        },
    });
}));
router.get('/currencies/pairs', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const currencyPairs = quote_1.quoteService.getAvailableCurrencyPairs();
    res.status(200).json({
        success: true,
        data: {
            supportedCurrencies: ['USD', 'KRW', 'PHP'],
            currencyPairs,
            platformFee: 0.005,
            minimumAmounts: {
                USD: 1.0,
                KRW: 1000,
                PHP: 50,
            },
            maximumAmounts: {
                USD: 10000,
                KRW: 10000000,
                PHP: 500000,
            },
        },
        metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.correlationId,
        },
    });
}));
exports.default = router;
//# sourceMappingURL=quote.js.map