/**
 * Blockchain Services
 * 
 * This module provides blockchain integration services for the LineX platform,
 * including Kaia network connectivity and TestUSDT contract interactions.
 */

export { KaiaProviderManager, kaiaProvider } from './provider';
export { SimpleContractService, simpleContractService } from './simpleContractService';

// Re-export contract constants for convenience
export { CONTRACT_CONSTANTS } from '../../types/contracts';