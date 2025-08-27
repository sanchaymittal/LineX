"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.quoteService = exports.QuoteService = void 0;
const crypto_1 = require("crypto");
const redisService_1 = require("../redis/redisService");
const logger_1 = __importDefault(require("../../utils/logger"));
class QuoteService {
    constructor() {
        this.QUOTE_TTL = 5 * 60;
        this.PLATFORM_FEE_RATE = 0.005;
        this.QUOTE_KEY_PREFIX = 'quote:';
        this.EXCHANGE_RATES = {
            'USD_KRW': 1150.0,
            'KRW_USD': 1 / 1150.0,
            'USD_PHP': 56.0,
            'PHP_USD': 1 / 56.0,
            'USD_USDT': 1.0,
            'USDT_USD': 1.0,
            'KRW_USDT': 1 / 1150.0,
            'USDT_KRW': 1150.0,
            'PHP_USDT': 1 / 56.0,
            'USDT_PHP': 56.0,
            'KRW_PHP': (1 / 1150.0) * 56.0,
            'PHP_KRW': (1 / 56.0) * 1150.0,
            'USD_USD': 1.0,
            'KRW_KRW': 1.0,
            'PHP_PHP': 1.0,
            'USDT_USDT': 1.0,
        };
    }
    async generateQuote(request) {
        try {
            const validation = this.validateQuoteRequest(request);
            if (!validation.isValid) {
                return {
                    success: false,
                    error: validation.error,
                };
            }
            const exchangeRate = this.getExchangeRate(request.fromCurrency, request.toCurrency);
            if (!exchangeRate) {
                return {
                    success: false,
                    error: `Exchange rate not available for ${request.fromCurrency} to ${request.toCurrency}`,
                };
            }
            const rawToAmount = request.fromAmount * exchangeRate;
            const platformFeeAmount = request.fromAmount * this.PLATFORM_FEE_RATE;
            const totalCost = request.fromAmount + platformFeeAmount;
            const toAmount = rawToAmount;
            const quote = {
                id: (0, crypto_1.randomUUID)(),
                fromCurrency: request.fromCurrency,
                toCurrency: request.toCurrency,
                fromAmount: request.fromAmount,
                toAmount: parseFloat(toAmount.toFixed(2)),
                exchangeRate,
                platformFee: this.PLATFORM_FEE_RATE,
                platformFeeAmount: parseFloat(platformFeeAmount.toFixed(2)),
                totalCost: parseFloat(totalCost.toFixed(2)),
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + this.QUOTE_TTL * 1000),
                isValid: true,
            };
            await this.storeQuote(quote);
            logger_1.default.info('✅ Anonymous quote generated successfully', {
                quoteId: quote.id,
                fromCurrency: quote.fromCurrency,
                toCurrency: quote.toCurrency,
                fromAmount: quote.fromAmount,
                toAmount: quote.toAmount,
                exchangeRate: quote.exchangeRate,
                platformFeeAmount: quote.platformFeeAmount,
            });
            return {
                success: true,
                quote,
            };
        }
        catch (error) {
            logger_1.default.error('❌ Failed to generate quote:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    async getQuote(quoteId) {
        try {
            const quoteKey = `${this.QUOTE_KEY_PREFIX}${quoteId}`;
            const quote = await redisService_1.redisService.getJson(quoteKey);
            if (quote) {
                if (new Date() > new Date(quote.expiresAt)) {
                    quote.isValid = false;
                    await this.storeQuote(quote);
                    logger_1.default.info('⏰ Quote expired', { quoteId });
                }
            }
            return quote;
        }
        catch (error) {
            logger_1.default.error('❌ Failed to get quote:', { quoteId, error });
            return null;
        }
    }
    async validateQuote(quoteId) {
        try {
            const quote = await this.getQuote(quoteId);
            if (!quote) {
                return {
                    isValid: false,
                    error: 'Quote not found',
                };
            }
            if (!quote.isValid) {
                return {
                    isValid: false,
                    quote,
                    error: 'Quote is no longer valid',
                };
            }
            if (new Date() > new Date(quote.expiresAt)) {
                quote.isValid = false;
                await this.storeQuote(quote);
                return {
                    isValid: false,
                    quote,
                    error: 'Quote has expired',
                };
            }
            return {
                isValid: true,
                quote,
            };
        }
        catch (error) {
            logger_1.default.error('❌ Failed to validate quote:', { quoteId, error });
            return {
                isValid: false,
                error: 'Failed to validate quote',
            };
        }
    }
    getAvailableCurrencyPairs() {
        const pairs = [];
        const currencies = ['USD', 'KRW', 'PHP', 'USDT'];
        for (const from of currencies) {
            for (const to of currencies) {
                if (from !== to) {
                    const rate = this.getExchangeRate(from, to);
                    if (rate) {
                        pairs.push({
                            fromCurrency: from,
                            toCurrency: to,
                            rate,
                        });
                    }
                }
            }
        }
        return pairs;
    }
    getCurrentRates() {
        const rates = {};
        const now = new Date();
        Object.entries(this.EXCHANGE_RATES).forEach(([pair, rate]) => {
            const [from, to] = pair.split('_');
            rates[pair] = {
                fromCurrency: from,
                toCurrency: to,
                rate,
                lastUpdated: now,
            };
        });
        return rates;
    }
    async invalidateQuote(quoteId) {
        try {
            const quote = await this.getQuote(quoteId);
            if (quote) {
                quote.isValid = false;
                await this.storeQuote(quote);
                logger_1.default.info('🚫 Quote invalidated', { quoteId });
                return true;
            }
            return false;
        }
        catch (error) {
            logger_1.default.error('❌ Failed to invalidate quote:', { quoteId, error });
            return false;
        }
    }
    getExchangeRate(fromCurrency, toCurrency) {
        const pair = `${fromCurrency}_${toCurrency}`;
        return this.EXCHANGE_RATES[pair] || null;
    }
    validateQuoteRequest(request) {
        if (!request.fromCurrency || !request.toCurrency) {
            return {
                isValid: false,
                error: 'From and to currencies are required',
            };
        }
        if (!['USD', 'KRW', 'PHP', 'USDT'].includes(request.fromCurrency)) {
            return {
                isValid: false,
                error: 'Invalid from currency. Supported: USD, KRW, PHP, USDT',
            };
        }
        if (!['USD', 'KRW', 'PHP', 'USDT'].includes(request.toCurrency)) {
            return {
                isValid: false,
                error: 'Invalid to currency. Supported: USD, KRW, PHP, USDT',
            };
        }
        if (request.fromCurrency === request.toCurrency) {
            return {
                isValid: false,
                error: 'From and to currencies cannot be the same',
            };
        }
        if (!request.fromAmount || request.fromAmount <= 0) {
            return {
                isValid: false,
                error: 'Amount must be greater than 0',
            };
        }
        const minimumAmounts = {
            USD: 1.0,
            KRW: 1000,
            PHP: 50,
            USDT: 1.0,
        };
        if (request.fromAmount < minimumAmounts[request.fromCurrency]) {
            return {
                isValid: false,
                error: `Minimum amount is ${minimumAmounts[request.fromCurrency]} ${request.fromCurrency}`,
            };
        }
        const maximumAmounts = {
            USD: 10000,
            KRW: 10000000,
            PHP: 500000,
            USDT: 10000,
        };
        if (request.fromAmount > maximumAmounts[request.fromCurrency]) {
            return {
                isValid: false,
                error: `Maximum amount is ${maximumAmounts[request.fromCurrency]} ${request.fromCurrency}`,
            };
        }
        return { isValid: true };
    }
    async storeQuote(quote) {
        const quoteKey = `${this.QUOTE_KEY_PREFIX}${quote.id}`;
        await redisService_1.redisService.setJson(quoteKey, quote, this.QUOTE_TTL);
    }
}
exports.QuoteService = QuoteService;
exports.quoteService = new QuoteService();
exports.default = exports.quoteService;
//# sourceMappingURL=quoteService.js.map