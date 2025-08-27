"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.simpleContractService = exports.SimpleContractService = void 0;
const provider_1 = require("./provider");
const contracts_1 = require("../../types/contracts");
const logger_1 = __importDefault(require("../../utils/logger"));
class SimpleContractService {
    constructor() {
        this.contractAddress = contracts_1.CONTRACT_CONSTANTS.ADDRESS;
    }
    async getContractInfo() {
        try {
            const provider = provider_1.kaiaProvider.getProvider();
            const nameData = '0x06fdde03';
            const symbolData = '0x95d89b41';
            const decimalsData = '0x313ce567';
            const totalSupplyData = '0x18160ddd';
            const [nameResult, symbolResult, decimalsResult, totalSupplyResult] = await Promise.all([
                provider.call({ to: this.contractAddress, data: nameData }),
                provider.call({ to: this.contractAddress, data: symbolData }),
                provider.call({ to: this.contractAddress, data: decimalsData }),
                provider.call({ to: this.contractAddress, data: totalSupplyData }),
            ]);
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
            const loggableInfo = {
                ...contractInfo,
                totalSupply: {
                    ...contractInfo.totalSupply,
                    raw: contractInfo.totalSupply.raw.toString(),
                }
            };
            logger_1.default.info('📊 Simple contract info retrieved', { contractInfo: loggableInfo });
            return { success: true, data: contractInfo };
        }
        catch (error) {
            logger_1.default.error('❌ Failed to get contract info:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
    async getBalance(address) {
        try {
            const provider = provider_1.kaiaProvider.getProvider();
            const paddedAddress = address.replace('0x', '').padStart(64, '0');
            const balanceOfData = '0x70a08231' + paddedAddress;
            const result = await provider.call({
                to: this.contractAddress,
                data: balanceOfData
            });
            const balance = BigInt(result);
            const balanceInfo = this.formatBalance(balance);
            logger_1.default.debug('💰 Balance retrieved', { address, balance: balanceInfo });
            return { success: true, data: balanceInfo };
        }
        catch (error) {
            logger_1.default.error('❌ Failed to get balance:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
    async getNetworkInfo() {
        try {
            const networkInfo = await provider_1.kaiaProvider.getNetworkInfo();
            return { success: true, data: networkInfo };
        }
        catch (error) {
            logger_1.default.error('❌ Failed to get network info:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
    async healthCheck() {
        try {
            const providerConnected = provider_1.kaiaProvider.isProviderConnected();
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
        }
        catch (error) {
            return {
                status: 'unhealthy',
                provider: false,
                contract: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    formatBalance(rawBalance) {
        const divisor = BigInt(10 ** contracts_1.CONTRACT_CONSTANTS.DECIMALS);
        const wholePart = rawBalance / divisor;
        const fractionalPart = rawBalance % divisor;
        const formatted = `${wholePart}.${fractionalPart.toString().padStart(contracts_1.CONTRACT_CONSTANTS.DECIMALS, '0')}`;
        const usdt = parseFloat(formatted);
        return {
            raw: rawBalance.toString(),
            formatted,
            usdt,
        };
    }
    decodeString(hexData) {
        try {
            const hex = hexData.replace('0x', '');
            if (hex.length < 128)
                return '';
            const stringHex = hex.slice(128);
            let result = '';
            for (let i = 0; i < stringHex.length; i += 2) {
                const byte = parseInt(stringHex.substr(i, 2), 16);
                if (byte !== 0) {
                    result += String.fromCharCode(byte);
                }
            }
            return result;
        }
        catch (error) {
            logger_1.default.warn('Failed to decode string:', error);
            return '';
        }
    }
    getContractAddress() {
        return this.contractAddress;
    }
}
exports.SimpleContractService = SimpleContractService;
exports.simpleContractService = new SimpleContractService();
exports.default = exports.simpleContractService;
//# sourceMappingURL=simpleContractService.js.map