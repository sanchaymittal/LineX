"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisClient = void 0;
const redis_1 = require("redis");
const config_1 = __importDefault(require("../../config"));
const logger_1 = __importDefault(require("../../utils/logger"));
class RedisClient {
    constructor() {
        this.isConnected = false;
        this.client = (0, redis_1.createClient)({
            url: config_1.default.redis.url,
            socket: {
                reconnectStrategy: (retries) => {
                    if (retries > 10) {
                        logger_1.default.error('Redis connection failed after 10 retries');
                        return false;
                    }
                    return Math.min(retries * 100, 3000);
                },
            },
        });
        this.setupEventHandlers();
    }
    setupEventHandlers() {
        this.client.on('connect', () => {
            logger_1.default.info('Redis client connected');
        });
        this.client.on('ready', () => {
            logger_1.default.info('Redis client ready');
            this.isConnected = true;
        });
        this.client.on('error', (error) => {
            logger_1.default.error('Redis client error:', error);
            this.isConnected = false;
        });
        this.client.on('end', () => {
            logger_1.default.info('Redis client disconnected');
            this.isConnected = false;
        });
    }
    async connect() {
        try {
            await this.client.connect();
            logger_1.default.info('Successfully connected to Redis');
        }
        catch (error) {
            logger_1.default.error('Failed to connect to Redis:', error);
            throw error;
        }
    }
    async disconnect() {
        try {
            if (this.isConnected) {
                await this.client.disconnect();
                logger_1.default.info('Disconnected from Redis');
            }
        }
        catch (error) {
            logger_1.default.error('Error disconnecting from Redis:', error);
        }
    }
    getClient() {
        return this.client;
    }
    isReady() {
        return this.isConnected && this.client.isReady;
    }
    async ping() {
        try {
            const result = await this.client.ping();
            return result === 'PONG';
        }
        catch (error) {
            logger_1.default.error('Redis ping failed:', error);
            return false;
        }
    }
    async set(key, value, ttl) {
        try {
            const serializedValue = JSON.stringify(value);
            if (ttl) {
                await this.client.setEx(key, ttl, serializedValue);
            }
            else {
                await this.client.set(key, serializedValue);
            }
        }
        catch (error) {
            logger_1.default.error(`Failed to set key ${key}:`, error);
            throw error;
        }
    }
    async get(key) {
        try {
            const value = await this.client.get(key);
            if (!value)
                return null;
            return JSON.parse(value);
        }
        catch (error) {
            logger_1.default.error(`Failed to get key ${key}:`, error);
            throw error;
        }
    }
    async del(key) {
        try {
            const result = await this.client.del(key);
            return result === 1;
        }
        catch (error) {
            logger_1.default.error(`Failed to delete key ${key}:`, error);
            throw error;
        }
    }
    async exists(key) {
        try {
            const result = await this.client.exists(key);
            return result === 1;
        }
        catch (error) {
            logger_1.default.error(`Failed to check existence of key ${key}:`, error);
            throw error;
        }
    }
    async expire(key, ttl) {
        try {
            const result = await this.client.expire(key, ttl);
            return result === 1;
        }
        catch (error) {
            logger_1.default.error(`Failed to set expiration for key ${key}:`, error);
            throw error;
        }
    }
    async keys(pattern) {
        try {
            return await this.client.keys(pattern);
        }
        catch (error) {
            logger_1.default.error(`Failed to get keys with pattern ${pattern}:`, error);
            throw error;
        }
    }
}
exports.redisClient = new RedisClient();
exports.default = exports.redisClient;
//# sourceMappingURL=client.js.map