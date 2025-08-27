"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateConfig = validateConfig;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const config = {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    demoMode: process.env.DEMO_MODE === 'true',
    app: {
        ngrokUrl: process.env.NGROK_URL,
    },
    demo: {
        enabled: process.env.DEMO_MODE === 'true',
    },
    redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
    },
    kaia: {
        rpcUrl: process.env.KAIA_RPC_URL || 'https://public-en-kairos.node.kaia.io',
        chainId: parseInt(process.env.KAIA_CHAIN_ID || '1001', 10),
        mockUsdtContractAddress: process.env.MOCK_USDT_CONTRACT_ADDRESS || '',
        gasPayer: {
            privateKey: process.env.GAS_PAYER_PRIVATE_KEY || '',
        },
    },
    blockchain: {
        mockUsdtAddress: process.env.MOCK_USDT_CONTRACT_ADDRESS || '',
        gasPayerPrivateKey: process.env.GAS_PAYER_PRIVATE_KEY || '',
    },
    dappPortal: {
        apiKey: process.env.DAPPPORTAL_API_KEY || '',
        webhookSecret: process.env.DAPPPORTAL_WEBHOOK_SECRET || '',
    },
    jwt: {
        secret: process.env.JWT_SECRET || 'fallback-secret-key',
        expiresIn: '12h',
    },
    webhook: {
        ngrokUrl: process.env.NGROK_URL || '',
    },
    logging: {
        level: process.env.LOG_LEVEL || 'info',
    },
};
function validateConfig() {
    const requiredFields = [
        'jwt.secret',
    ];
    const missingFields = [];
    requiredFields.forEach(field => {
        const value = getNestedValue(config, field);
        if (!value || value === 'fallback-secret-key') {
            missingFields.push(field);
        }
    });
    if (missingFields.length > 0) {
        console.warn('Missing required configuration fields:', missingFields);
        if (config.nodeEnv === 'production') {
            throw new Error(`Missing required configuration: ${missingFields.join(', ')}`);
        }
    }
}
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}
exports.default = config;
//# sourceMappingURL=index.js.map