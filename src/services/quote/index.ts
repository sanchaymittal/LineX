/**
 * Quote Services
 * 
 * This module provides quote generation and management services for the LineX platform,
 * including exchange rate calculations and fee computations.
 */

export { QuoteService, quoteService } from './quoteService';
export type {
  Currency,
  ExchangeRate,
  QuoteRequest,
  Quote,
  QuoteResult,
} from './quoteService';