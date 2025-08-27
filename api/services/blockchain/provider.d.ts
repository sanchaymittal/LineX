import { JsonRpcProvider } from '@kaiachain/ethers-ext';
export declare class KaiaProviderManager {
    private provider;
    private isConnected;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectDelay;
    constructor();
    connect(): Promise<void>;
    private testProvider;
    private setupEventListeners;
    private handleProviderError;
    getProvider(): JsonRpcProvider;
    isProviderConnected(): boolean;
    getNetworkInfo(): Promise<{
        chainId: number;
        name: string;
        blockNumber: number;
        gasPrice: string;
    }>;
    disconnect(): Promise<void>;
}
export declare const kaiaProvider: KaiaProviderManager;
export default kaiaProvider;
//# sourceMappingURL=provider.d.ts.map