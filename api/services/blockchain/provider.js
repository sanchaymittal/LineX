"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.kaiaProvider = exports.KaiaProviderManager = void 0;
const ethers_ext_1 = require("@kaiachain/ethers-ext");
const kaia_1 = require("../../config/kaia");
const logger_1 = __importDefault(require("../../utils/logger"));
class KaiaProviderManager {
    constructor() {
        this.provider = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        (0, kaia_1.validateKaiaConfig)();
    }
    async connect() {
        try {
            const kaiaConfig = (0, kaia_1.getKaiaConfig)();
            const primaryProvider = new ethers_ext_1.JsonRpcProvider(kaiaConfig.rpcUrl, {
                chainId: kaiaConfig.chainId,
                name: kaiaConfig.networkName,
            });
            await this.testProvider(primaryProvider);
            this.provider = primaryProvider;
            this.isConnected = true;
            this.reconnectAttempts = 0;
            logger_1.default.info('✅ Successfully connected to Kaia network', {
                network: kaiaConfig.networkName,
                chainId: kaiaConfig.chainId,
                rpcUrl: kaiaConfig.rpcUrl,
            });
            this.setupEventListeners();
        }
        catch (error) {
            logger_1.default.error('❌ Failed to connect to Kaia network:', error);
            this.isConnected = false;
            throw error;
        }
    }
    async testProvider(provider) {
        try {
            const network = await provider.getNetwork();
            const blockNumber = await provider.getBlockNumber();
            logger_1.default.info('🔍 Provider test successful', {
                chainId: network.chainId,
                currentBlock: blockNumber,
            });
        }
        catch (error) {
            logger_1.default.error('❌ Provider test failed:', error);
            throw new Error('Unable to connect to Kaia RPC endpoint');
        }
    }
    setupEventListeners() {
        if (!this.provider)
            return;
        this.provider.on('network', (newNetwork, oldNetwork) => {
            if (oldNetwork) {
                logger_1.default.warn('🔄 Network changed', {
                    from: oldNetwork.chainId,
                    to: newNetwork.chainId,
                });
            }
        });
        this.provider.on('error', (error) => {
            logger_1.default.error('🚨 Provider error:', error);
            this.handleProviderError(error);
        });
    }
    async handleProviderError(error) {
        this.isConnected = false;
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * this.reconnectAttempts;
            logger_1.default.info(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);
            setTimeout(async () => {
                try {
                    await this.connect();
                }
                catch (reconnectError) {
                    logger_1.default.error('❌ Reconnection attempt failed:', reconnectError);
                }
            }, delay);
        }
        else {
            logger_1.default.error('💥 Maximum reconnection attempts reached. Manual intervention required.');
        }
    }
    getProvider() {
        if (!this.provider || !this.isConnected) {
            throw new Error('Kaia provider not connected. Call connect() first.');
        }
        return this.provider;
    }
    isProviderConnected() {
        return this.isConnected && this.provider !== null;
    }
    async getNetworkInfo() {
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
    async disconnect() {
        try {
            if (this.provider) {
                this.provider = null;
            }
            this.isConnected = false;
            logger_1.default.info('✅ Disconnected from Kaia network');
        }
        catch (error) {
            logger_1.default.error('❌ Error disconnecting from Kaia network:', error);
        }
    }
}
exports.KaiaProviderManager = KaiaProviderManager;
exports.kaiaProvider = new KaiaProviderManager();
exports.default = exports.kaiaProvider;
//# sourceMappingURL=provider.js.map