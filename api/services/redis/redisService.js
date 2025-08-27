"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisService = exports.RedisService = void 0;
const client_1 = require("./client");
const logger_1 = __importDefault(require("../../utils/logger"));
class RedisService {
    async setJson(key, data, ttlSeconds) {
        try {
            await client_1.redisClient.set(key, data, ttlSeconds);
            logger_1.default.debug('Redis SET', { key, ttl: ttlSeconds });
        }
        catch (error) {
            logger_1.default.error('Redis setJson error:', { key, error });
            throw error;
        }
    }
    async getJson(key) {
        try {
            const data = await client_1.redisClient.get(key);
            logger_1.default.debug('Redis GET', { key, found: data !== null });
            return data;
        }
        catch (error) {
            logger_1.default.error('Redis getJson error:', { key, error });
            return null;
        }
    }
    async del(key) {
        try {
            const result = await client_1.redisClient.del(key);
            logger_1.default.debug('Redis DEL', { key, deleted: result });
            return result;
        }
        catch (error) {
            logger_1.default.error('Redis del error:', { key, error });
            return false;
        }
    }
    async exists(key) {
        try {
            const result = await client_1.redisClient.exists(key);
            return result;
        }
        catch (error) {
            logger_1.default.error('Redis exists error:', { key, error });
            return false;
        }
    }
    async expire(key, ttlSeconds) {
        try {
            const result = await client_1.redisClient.expire(key, ttlSeconds);
            return result;
        }
        catch (error) {
            logger_1.default.error('Redis expire error:', { key, ttl: ttlSeconds, error });
            return false;
        }
    }
    async keys(pattern) {
        try {
            return await client_1.redisClient.keys(pattern);
        }
        catch (error) {
            logger_1.default.error('Redis keys error:', { pattern, error });
            return [];
        }
    }
    async ping() {
        try {
            return await client_1.redisClient.ping();
        }
        catch (error) {
            logger_1.default.error('Redis ping error:', error);
            return false;
        }
    }
    async get(key) {
        return this.getJson(key);
    }
    async set(key, data, ttlSeconds) {
        return this.setJson(key, data, ttlSeconds);
    }
    async setWithTTL(key, data, ttlSeconds) {
        return this.setJson(key, data, ttlSeconds);
    }
}
exports.RedisService = RedisService;
exports.redisService = new RedisService();
exports.default = exports.redisService;
//# sourceMappingURL=redisService.js.map