export type Currency = 'KRW' | 'USD' | 'PHP' | 'USDT';
export interface ExchangeRate {
    fromCurrency: Currency;
    toCurrency: Currency;
    rate: number;
    lastUpdated: Date;
}
export interface QuoteRequest {
    fromCurrency: Currency;
    toCurrency: Currency;
    fromAmount: number;
}
export interface Quote {
    id: string;
    fromCurrency: Currency;
    toCurrency: Currency;
    fromAmount: number;
    toAmount: number;
    exchangeRate: number;
    platformFee: number;
    platformFeeAmount: number;
    totalCost: number;
    createdAt: Date;
    expiresAt: Date;
    isValid: boolean;
}
export interface QuoteResult {
    success: boolean;
    quote?: Quote;
    error?: string;
}
export declare class QuoteService {
    private readonly QUOTE_TTL;
    private readonly PLATFORM_FEE_RATE;
    private readonly QUOTE_KEY_PREFIX;
    private readonly EXCHANGE_RATES;
    generateQuote(request: QuoteRequest): Promise<QuoteResult>;
    getQuote(quoteId: string): Promise<Quote | null>;
    validateQuote(quoteId: string): Promise<{
        isValid: boolean;
        quote?: Quote;
        error?: string;
    }>;
    getAvailableCurrencyPairs(): Array<{
        fromCurrency: Currency;
        toCurrency: Currency;
        rate: number;
    }>;
    getCurrentRates(): Record<string, ExchangeRate>;
    invalidateQuote(quoteId: string): Promise<boolean>;
    private getExchangeRate;
    private validateQuoteRequest;
    private storeQuote;
}
export declare const quoteService: QuoteService;
export default quoteService;
//# sourceMappingURL=quoteService.d.ts.map