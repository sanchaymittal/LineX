"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KAIA_NETWORKS = void 0;
exports.getKaiaConfig = getKaiaConfig;
exports.validateKaiaConfig = validateKaiaConfig;
const index_1 = __importDefault(require("./index"));
const logger_1 = __importDefault(require("../utils/logger"));
exports.KAIA_NETWORKS = {
    MAINNET: {
        rpcUrl: 'https://public-en.node.kaia.io',
        chainId: 8217,
        networkName: 'Kaia Mainnet',
        blockTime: 1000,
        finality: 1,
    },
    TESTNET: {
        rpcUrl: 'https://public-en-kairos.node.kaia.io',
        chainId: 1001,
        networkName: 'Kaia Testnet (Kairos)',
        blockTime: 1000,
        finality: 1,
    },
};
function getKaiaConfig() {
    const isTestnet = index_1.default.kaia.chainId === 1001;
    return isTestnet ? exports.KAIA_NETWORKS.TESTNET : exports.KAIA_NETWORKS.MAINNET;
}
function validateKaiaConfig() {
    const errors = [];
    if (!index_1.default.kaia.rpcUrl) {
        errors.push('KAIA_RPC_URL is required');
    }
    if (!index_1.default.kaia.chainId || ![8217, 1001].includes(index_1.default.kaia.chainId)) {
        errors.push('KAIA_CHAIN_ID must be 8217 (mainnet) or 1001 (testnet)');
    }
    if (index_1.default.nodeEnv === 'production' && index_1.default.kaia.chainId === 1001) {
        logger_1.default.warn('⚠️  Using Kaia testnet in production environment');
    }
    if (errors.length > 0) {
        throw new Error(`Kaia configuration errors: ${errors.join(', ')}`);
    }
    logger_1.default.info(`🔗 Kaia network configured: ${getKaiaConfig().networkName}`);
}
//# sourceMappingURL=kaia.js.map