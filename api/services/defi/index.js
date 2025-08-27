"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeDeFiServices = initializeDeFiServices;
exports.attachDeFiServices = attachDeFiServices;
const provider_1 = require("../blockchain/provider");
const feeDelegationService_1 = require("../blockchain/feeDelegationService");
const redisService_1 = require("../redis/redisService");
const syVaultService_1 = require("./syVaultService");
const autoCompoundVaultService_1 = require("./autoCompoundVaultService");
const logger_1 = __importDefault(require("../../utils/logger"));
async function initializeDeFiServices() {
    try {
        logger_1.default.info('🔄 Initializing DeFi services...');
        const kaiaProvider = new provider_1.KaiaProviderManager();
        const redisService = new redisService_1.RedisService();
        const feeDelegation = new feeDelegationService_1.FeeDelegationService();
        await kaiaProvider.connect();
        logger_1.default.info('✅ Kaia provider connected for DeFi services');
        const standardizedYieldService = new syVaultService_1.SYVaultService(kaiaProvider, feeDelegation, redisService);
        const autoCompoundVaultService = new autoCompoundVaultService_1.AutoCompoundVaultService(kaiaProvider, feeDelegation, redisService);
        logger_1.default.info('✅ All DeFi services initialized successfully');
        return {
            standardizedYieldService,
            autoCompoundVaultService
        };
    }
    catch (error) {
        logger_1.default.error('❌ Failed to initialize DeFi services:', error);
        throw new Error(`DeFi services initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
function attachDeFiServices(app, services) {
    app.locals.defiServices = {
        vault: services.standardizedYieldService,
        autoCompoundVault: services.autoCompoundVaultService
    };
    if (!app.locals.services) {
        app.locals.services = {};
    }
    Object.assign(app.locals.services, services);
}
//# sourceMappingURL=index.js.map