/**
 * Simple Contract Service
 * 
 * Simplified TestUSDT contract service that works with Kaia network
 * Focuses on read operations and basic functionality
 */

import { JsonRpcProvider } from '@kaiachain/ethers-ext';
import { kaiaProvider } from './provider';
import { CONTRACT_CONSTANTS } from '../../types/contracts';
import logger from '../../utils/logger';

export class SimpleContractService {
  private readonly contractAddress = CONTRACT_CONSTANTS.ADDRESS;

  async getContractInfo(): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      const provider = kaiaProvider.getProvider();
      
      // Simple contract call using provider.call
      const nameData = '0x06fdde03'; // name() function selector
      const symbolData = '0x95d89b41'; // symbol() function selector
      const decimalsData = '0x313ce567'; // decimals() function selector
      const totalSupplyData = '0x18160ddd'; // totalSupply() function selector
      
      const [nameResult, symbolResult, decimalsResult, totalSupplyResult] = await Promise.all([
        provider.call({ to: this.contractAddress, data: nameData }),
        provider.call({ to: this.contractAddress, data: symbolData }),
        provider.call({ to: this.contractAddress, data: decimalsData }),
        provider.call({ to: this.contractAddress, data: totalSupplyData }),
      ]);

      // Simple decoding (this is very basic, in production you'd use proper ABI decoding)
      const name = this.decodeString(nameResult);
      const symbol = this.decodeString(symbolResult);
      const decimals = parseInt(decimalsResult, 16);
      const totalSupply = BigInt(totalSupplyResult);

      const contractInfo = {
        address: this.contractAddress,
        name: name || 'Test USDT',
        symbol: symbol || 'USDT',
        decimals: decimals || 6,
        totalSupply: this.formatBalance(totalSupply),
        isConnected: true,
      };

      // Convert BigInt to string for logging
      const loggableInfo = {
        ...contractInfo,
        totalSupply: {
          ...contractInfo.totalSupply,
          raw: contractInfo.totalSupply.raw.toString(),
        }
      };
      logger.info('📊 Simple contract info retrieved', { contractInfo: loggableInfo });
      return { success: true, data: contractInfo };
    } catch (error) {
      logger.error('❌ Failed to get contract info:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async getBalance(address: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      const provider = kaiaProvider.getProvider();
      
      // balanceOf(address) function selector + padded address
      const paddedAddress = address.replace('0x', '').padStart(64, '0');
      const balanceOfData = '0x70a08231' + paddedAddress;
      
      const result = await provider.call({ 
        to: this.contractAddress, 
        data: balanceOfData 
      });
      
      const balance = BigInt(result);
      const balanceInfo = this.formatBalance(balance);

      // Convert BigInt to string for logging
      const loggableBalance = {
        ...balanceInfo,
        raw: balanceInfo.raw.toString(),
      };
      logger.debug('💰 Balance retrieved', { address, balance: loggableBalance });
      return { success: true, data: balanceInfo };
    } catch (error) {
      logger.error('❌ Failed to get balance:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async getNetworkInfo(): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      const networkInfo = await kaiaProvider.getNetworkInfo();
      return { success: true, data: networkInfo };
    } catch (error) {
      logger.error('❌ Failed to get network info:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    provider: boolean;
    contract: boolean;
    error?: string;
  }> {
    try {
      const providerConnected = kaiaProvider.isProviderConnected();
      
      if (!providerConnected) {
        return {
          status: 'unhealthy',
          provider: false,
          contract: false,
          error: 'Provider not connected',
        };
      }

      const contractInfo = await this.getContractInfo();
      const contractHealthy = contractInfo.success;

      return {
        status: contractHealthy ? 'healthy' : 'unhealthy',
        provider: true,
        contract: contractHealthy,
        error: contractHealthy ? undefined : contractInfo.error,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        provider: false,
        contract: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Utility methods
  private formatBalance(rawBalance: bigint): {
    raw: bigint;
    formatted: string;
    usdt: number;
  } {
    const divisor = BigInt(10 ** CONTRACT_CONSTANTS.DECIMALS);
    const wholePart = rawBalance / divisor;
    const fractionalPart = rawBalance % divisor;
    
    // Format to USDT with proper decimals
    const formatted = `${wholePart}.${fractionalPart.toString().padStart(CONTRACT_CONSTANTS.DECIMALS, '0')}`;
    const usdt = parseFloat(formatted);

    return {
      raw: rawBalance,
      formatted,
      usdt,
    };
  }

  private decodeString(hexData: string): string {
    try {
      // Very basic string decoding - remove 0x, then decode hex
      // This is simplified and works for basic strings
      const hex = hexData.replace('0x', '');
      if (hex.length < 128) return '';
      
      // Skip the first 64 chars (offset) and next 64 chars (length), then decode the actual string
      const stringHex = hex.slice(128);
      let result = '';
      for (let i = 0; i < stringHex.length; i += 2) {
        const byte = parseInt(stringHex.substr(i, 2), 16);
        if (byte !== 0) {
          result += String.fromCharCode(byte);
        }
      }
      return result;
    } catch (error) {
      logger.warn('Failed to decode string:', error);
      return '';
    }
  }

  getContractAddress(): string {
    return this.contractAddress;
  }
}

// Export singleton instance
export const simpleContractService = new SimpleContractService();
export default simpleContractService;