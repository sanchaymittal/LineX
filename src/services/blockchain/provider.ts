import { JsonRpcProvider } from '@kaiachain/ethers-ext';
import { getKaiaConfig, validateKaiaConfig } from '../../config/kaia';
import config from '../../config';
import logger from '../../utils/logger';

export class KaiaProviderManager {
  private provider: JsonRpcProvider | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000; // 2 seconds

  constructor() {
    validateKaiaConfig();
  }

  async connect(): Promise<void> {
    try {
      const kaiaConfig = getKaiaConfig();
      
      // Primary HTTP provider
      const primaryProvider = new JsonRpcProvider(kaiaConfig.rpcUrl, {
        chainId: kaiaConfig.chainId,
        name: kaiaConfig.networkName,
      });

      // Test connection
      await this.testProvider(primaryProvider);

      // Use single provider for now
      this.provider = primaryProvider;

      this.isConnected = true;
      this.reconnectAttempts = 0;

      logger.info('✅ Successfully connected to Kaia network', {
        network: kaiaConfig.networkName,
        chainId: kaiaConfig.chainId,
        rpcUrl: kaiaConfig.rpcUrl,
      });

      // Setup event listeners
      this.setupEventListeners();

    } catch (error) {
      logger.error('❌ Failed to connect to Kaia network:', error);
      this.isConnected = false;
      throw error;
    }
  }

  // WebSocket support can be added later if needed

  private async testProvider(provider: JsonRpcProvider): Promise<void> {
    try {
      // Test basic connectivity
      const network = await provider.getNetwork();
      const blockNumber = await provider.getBlockNumber();
      
      logger.info('🔍 Provider test successful', {
        chainId: network.chainId,
        currentBlock: blockNumber,
      });
    } catch (error) {
      logger.error('❌ Provider test failed:', error);
      throw new Error('Unable to connect to Kaia RPC endpoint');
    }
  }

  private setupEventListeners(): void {
    if (!this.provider) return;

    // Listen for network changes
    this.provider.on('network', (newNetwork: any, oldNetwork: any) => {
      if (oldNetwork) {
        logger.warn('🔄 Network changed', {
          from: oldNetwork.chainId,
          to: newNetwork.chainId,
        });
      }
    });

    // Listen for errors
    this.provider.on('error', (error: any) => {
      logger.error('🚨 Provider error:', error);
      this.handleProviderError(error);
    });
  }

  private async handleProviderError(error: any): Promise<void> {
    this.isConnected = false;
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * this.reconnectAttempts;
      
      logger.info(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);
      
      setTimeout(async () => {
        try {
          await this.connect();
        } catch (reconnectError) {
          logger.error('❌ Reconnection attempt failed:', reconnectError);
        }
      }, delay);
    } else {
      logger.error('💥 Maximum reconnection attempts reached. Manual intervention required.');
    }
  }

  // WebSocket reconnection removed for simplicity

  getProvider(): JsonRpcProvider {
    if (!this.provider || !this.isConnected) {
      throw new Error('Kaia provider not connected. Call connect() first.');
    }
    return this.provider;
  }

  isProviderConnected(): boolean {
    return this.isConnected && this.provider !== null;
  }

  async getNetworkInfo(): Promise<{
    chainId: number;
    name: string;
    blockNumber: number;
    gasPrice: string;
  }> {
    const provider = this.getProvider();
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    const feeData = await provider.getFeeData();

    return {
      chainId: Number(network.chainId),
      name: network.name,
      blockNumber,
      gasPrice: feeData.gasPrice?.toString() || '0',
    };
  }

  async disconnect(): Promise<void> {
    try {
      if (this.provider) {
        // Note: JsonRpcProvider doesn't have destroy method, so we just null it
        this.provider = null;
      }

      this.isConnected = false;
      logger.info('✅ Disconnected from Kaia network');
    } catch (error) {
      logger.error('❌ Error disconnecting from Kaia network:', error);
    }
  }
}

// Export singleton instance
export const kaiaProvider = new KaiaProviderManager();
export default kaiaProvider;