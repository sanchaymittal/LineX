"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletService = exports.WalletService = void 0;
const redisService_1 = require("../redis/redisService");
const blockchain_1 = require("../blockchain");
const feeDelegationService_1 = require("../blockchain/feeDelegationService");
const logger_1 = __importDefault(require("../../utils/logger"));
class WalletService {
    async getUser(address) {
        try {
            const userKey = `user:${address.toLowerCase()}`;
            return await redisService_1.redisService.getJson(userKey);
        }
        catch (error) {
            logger_1.default.error('❌ Failed to get user by address:', { address, error });
            return null;
        }
    }
    async getWalletBalance(address) {
        try {
            if (!this.isValidAddress(address)) {
                return {
                    success: false,
                    error: 'Invalid wallet address format',
                };
            }
            const balanceResult = await blockchain_1.simpleContractService.getBalance(address);
            if (!balanceResult.success) {
                return {
                    success: false,
                    error: 'Failed to fetch wallet balance',
                };
            }
            return {
                success: true,
                balance: {
                    usdt: balanceResult.data.usdt,
                },
            };
        }
        catch (error) {
            logger_1.default.error('❌ Failed to get wallet balance:', { address, error });
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    async claimFaucet(request) {
        try {
            if (!this.isValidAddress(request.userAddress)) {
                return {
                    success: false,
                    error: 'Invalid wallet address format',
                };
            }
            const result = await feeDelegationService_1.feeDelegationService.executeAuthorizedFaucetClaim(request);
            logger_1.default.info('🚰 Faucet claim processed', {
                userAddress: request.userAddress,
                success: result.success,
                transactionHash: result.transactionHash,
            });
            return result;
        }
        catch (error) {
            logger_1.default.error('❌ Failed to process faucet claim:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    async getUserTransfers(address, limit = 10) {
        try {
            const { transferService } = await Promise.resolve().then(() => __importStar(require('../transfer/transferService')));
            return await transferService.getUserTransfers(address, limit);
        }
        catch (error) {
            logger_1.default.error('❌ Failed to get user transfers:', { address, error });
            return [];
        }
    }
    isValidAddress(address) {
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }
}
exports.WalletService = WalletService;
exports.walletService = new WalletService();
exports.default = exports.walletService;
//# sourceMappingURL=walletService.js.map