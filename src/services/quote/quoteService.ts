/**
 * Quote Service
 * 
 * Handles exchange rate calculations and quote generation for cross-border remittances.
 * Supports KRW ↔ USD ↔ PHP conversions with fixed rates for demo purposes.
 * 
 * Features:
 * - Fixed exchange rates for predictable demo experience
 * - Fee calculation (0.5% platform fee)
 * - Quote caching with Redis TTL (5 minutes)
 * - Multiple currency pair support
 * - Quote validation and expiry management
 */

import { randomUUID } from 'crypto';
import { redisService } from '../redis/redisService';
import logger from '../../utils/logger';

export type Currency = 'KRW' | 'USD' | 'PHP';

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
  lineUserId: string;
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
  lineUserId: string;
  createdAt: Date;
  expiresAt: Date;
  isValid: boolean;
}

export interface QuoteResult {
  success: boolean;
  quote?: Quote;
  error?: string;
}

export class QuoteService {
  private readonly QUOTE_TTL = 5 * 60; // 5 minutes
  private readonly PLATFORM_FEE_RATE = 0.005; // 0.5%
  private readonly QUOTE_KEY_PREFIX = 'quote:';

  // Fixed exchange rates for demo (in production, these would come from external API)
  private readonly EXCHANGE_RATES: Record<string, number> = {
    // USD as base currency
    'USD_KRW': 1150.0,  // 1 USD = 1,150 KRW
    'KRW_USD': 1 / 1150.0,
    'USD_PHP': 56.0,    // 1 USD = 56 PHP
    'PHP_USD': 1 / 56.0,
    
    // Cross rates (USD as bridge currency)
    'KRW_PHP': (1 / 1150.0) * 56.0,  // KRW → USD → PHP
    'PHP_KRW': (1 / 56.0) * 1150.0,  // PHP → USD → KRW
    
    // Same currency (1:1)
    'USD_USD': 1.0,
    'KRW_KRW': 1.0,
    'PHP_PHP': 1.0,
  };

  /**
   * Generate a new quote for currency conversion
   */
  async generateQuote(request: QuoteRequest): Promise<QuoteResult> {
    try {
      // Validate input
      const validation = this.validateQuoteRequest(request);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.error,
        };
      }

      // Get exchange rate
      const exchangeRate = this.getExchangeRate(request.fromCurrency, request.toCurrency);
      if (!exchangeRate) {
        return {
          success: false,
          error: `Exchange rate not available for ${request.fromCurrency} to ${request.toCurrency}`,
        };
      }

      // Calculate amounts
      const rawToAmount = request.fromAmount * exchangeRate;
      const platformFeeAmount = request.fromAmount * this.PLATFORM_FEE_RATE;
      const totalCost = request.fromAmount + platformFeeAmount;
      const toAmount = rawToAmount; // Fee is deducted from sender, not receiver

      const quote: Quote = {
        id: randomUUID(),
        fromCurrency: request.fromCurrency,
        toCurrency: request.toCurrency,
        fromAmount: request.fromAmount,
        toAmount: parseFloat(toAmount.toFixed(2)),
        exchangeRate,
        platformFee: this.PLATFORM_FEE_RATE,
        platformFeeAmount: parseFloat(platformFeeAmount.toFixed(2)),
        totalCost: parseFloat(totalCost.toFixed(2)),
        lineUserId: request.lineUserId,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.QUOTE_TTL * 1000),
        isValid: true,
      };

      // Store quote in Redis with TTL
      await this.storeQuote(quote);

      logger.info('✅ Quote generated successfully', {
        quoteId: quote.id,
        fromCurrency: quote.fromCurrency,
        toCurrency: quote.toCurrency,
        fromAmount: quote.fromAmount,
        toAmount: quote.toAmount,
        exchangeRate: quote.exchangeRate,
        platformFeeAmount: quote.platformFeeAmount,
        lineUserId: quote.lineUserId,
      });

      return {
        success: true,
        quote,
      };
    } catch (error) {
      logger.error('❌ Failed to generate quote:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Retrieve a quote by ID
   */
  async getQuote(quoteId: string): Promise<Quote | null> {
    try {
      const quoteKey = `${this.QUOTE_KEY_PREFIX}${quoteId}`;
      const quote = await redisService.getJson<Quote>(quoteKey);
      
      if (quote) {
        // Check if quote has expired
        if (new Date() > new Date(quote.expiresAt)) {
          quote.isValid = false;
          await this.storeQuote(quote); // Update the stored quote
          logger.info('⏰ Quote expired', { quoteId });
        }
      }

      return quote;
    } catch (error) {
      logger.error('❌ Failed to get quote:', { quoteId, error });
      return null;
    }
  }

  /**
   * Validate a quote before using it for transfer
   */
  async validateQuote(quoteId: string): Promise<{
    isValid: boolean;
    quote?: Quote;
    error?: string;
  }> {
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
    } catch (error) {
      logger.error('❌ Failed to validate quote:', { quoteId, error });
      return {
        isValid: false,
        error: 'Failed to validate quote',
      };
    }
  }

  /**
   * Get all available currency pairs
   */
  getAvailableCurrencyPairs(): Array<{
    fromCurrency: Currency;
    toCurrency: Currency;
    rate: number;
  }> {
    const pairs: Array<{
      fromCurrency: Currency;
      toCurrency: Currency;
      rate: number;
    }> = [];

    const currencies: Currency[] = ['USD', 'KRW', 'PHP'];
    
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

  /**
   * Get current exchange rates for display
   */
  getCurrentRates(): Record<string, ExchangeRate> {
    const rates: Record<string, ExchangeRate> = {};
    const now = new Date();

    Object.entries(this.EXCHANGE_RATES).forEach(([pair, rate]) => {
      const [from, to] = pair.split('_') as [Currency, Currency];
      rates[pair] = {
        fromCurrency: from,
        toCurrency: to,
        rate,
        lastUpdated: now,
      };
    });

    return rates;
  }

  /**
   * Invalidate a quote (e.g., when used for transfer)
   */
  async invalidateQuote(quoteId: string): Promise<boolean> {
    try {
      const quote = await this.getQuote(quoteId);
      if (quote) {
        quote.isValid = false;
        await this.storeQuote(quote);
        logger.info('🚫 Quote invalidated', { quoteId });
        return true;
      }
      return false;
    } catch (error) {
      logger.error('❌ Failed to invalidate quote:', { quoteId, error });
      return false;
    }
  }

  // Private helper methods

  private getExchangeRate(fromCurrency: Currency, toCurrency: Currency): number | null {
    const pair = `${fromCurrency}_${toCurrency}`;
    return this.EXCHANGE_RATES[pair] || null;
  }

  private validateQuoteRequest(request: QuoteRequest): {
    isValid: boolean;
    error?: string;
  } {
    if (!request.fromCurrency || !request.toCurrency) {
      return {
        isValid: false,
        error: 'From and to currencies are required',
      };
    }

    if (!['USD', 'KRW', 'PHP'].includes(request.fromCurrency)) {
      return {
        isValid: false,
        error: 'Invalid from currency. Supported: USD, KRW, PHP',
      };
    }

    if (!['USD', 'KRW', 'PHP'].includes(request.toCurrency)) {
      return {
        isValid: false,
        error: 'Invalid to currency. Supported: USD, KRW, PHP',
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

    // Set minimum amounts by currency
    const minimumAmounts: Record<Currency, number> = {
      USD: 1.0,    // $1 minimum
      KRW: 1000,   // ₩1,000 minimum
      PHP: 50,     // ₱50 minimum
    };

    if (request.fromAmount < minimumAmounts[request.fromCurrency]) {
      return {
        isValid: false,
        error: `Minimum amount is ${minimumAmounts[request.fromCurrency]} ${request.fromCurrency}`,
      };
    }

    // Set maximum amounts by currency (for demo)
    const maximumAmounts: Record<Currency, number> = {
      USD: 10000,    // $10,000 maximum
      KRW: 10000000, // ₩10M maximum
      PHP: 500000,   // ₱500K maximum
    };

    if (request.fromAmount > maximumAmounts[request.fromCurrency]) {
      return {
        isValid: false,
        error: `Maximum amount is ${maximumAmounts[request.fromCurrency]} ${request.fromCurrency}`,
      };
    }

    if (!request.lineUserId) {
      return {
        isValid: false,
        error: 'LINE user ID is required',
      };
    }

    return { isValid: true };
  }

  private async storeQuote(quote: Quote): Promise<void> {
    const quoteKey = `${this.QUOTE_KEY_PREFIX}${quote.id}`;
    await redisService.setJson(quoteKey, quote, this.QUOTE_TTL);
  }
}

// Export singleton instance
export const quoteService = new QuoteService();
export default quoteService;