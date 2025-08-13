/**
 * Redis Service
 * 
 * Simple Redis service wrapper for JSON data storage with TTL support.
 * Provides a clean interface for storing and retrieving JSON objects.
 */

import { redisClient } from './client';
import logger from '../../utils/logger';

export class RedisService {
  /**
   * Store JSON data in Redis with optional TTL
   */
  async setJson<T>(key: string, data: T, ttlSeconds?: number): Promise<void> {
    try {
      // Use the existing redisClient.set method which handles JSON serialization
      await redisClient.set(key, data, ttlSeconds);
      logger.debug('Redis SET', { key, ttl: ttlSeconds });
    } catch (error) {
      logger.error('Redis setJson error:', { key, error });
      throw error;
    }
  }

  /**
   * Retrieve JSON data from Redis
   */
  async getJson<T>(key: string): Promise<T | null> {
    try {
      // Use the existing redisClient.get method which handles JSON parsing
      const data = await redisClient.get<T>(key);
      logger.debug('Redis GET', { key, found: data !== null });
      return data;
    } catch (error) {
      logger.error('Redis getJson error:', { key, error });
      return null;
    }
  }

  /**
   * Delete a key from Redis
   */
  async del(key: string): Promise<boolean> {
    try {
      const result = await redisClient.del(key);
      logger.debug('Redis DEL', { key, deleted: result });
      return result;
    } catch (error) {
      logger.error('Redis del error:', { key, error });
      return false;
    }
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await redisClient.exists(key);
      return result;
    } catch (error) {
      logger.error('Redis exists error:', { key, error });
      return false;
    }
  }

  /**
   * Set TTL for an existing key
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await redisClient.expire(key, ttlSeconds);
      return result;
    } catch (error) {
      logger.error('Redis expire error:', { key, ttl: ttlSeconds, error });
      return false;
    }
  }

  /**
   * Find keys matching a pattern
   */
  async keys(pattern: string): Promise<string[]> {
    try {
      return await redisClient.keys(pattern);
    } catch (error) {
      logger.error('Redis keys error:', { pattern, error });
      return [];
    }
  }

  /**
   * Health check
   */
  async ping(): Promise<boolean> {
    try {
      return await redisClient.ping();
    } catch (error) {
      logger.error('Redis ping error:', error);
      return false;
    }
  }
}

// Export singleton instance
export const redisService = new RedisService();
export default redisService;