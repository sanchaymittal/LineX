import { RedisClientType } from 'redis';
declare class RedisClient {
    private client;
    private isConnected;
    constructor();
    private setupEventHandlers;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    getClient(): RedisClientType;
    isReady(): boolean;
    ping(): Promise<boolean>;
    set(key: string, value: any, ttl?: number): Promise<void>;
    get<T>(key: string): Promise<T | null>;
    del(key: string): Promise<boolean>;
    exists(key: string): Promise<boolean>;
    expire(key: string, ttl: number): Promise<boolean>;
    keys(pattern: string): Promise<string[]>;
}
export declare const redisClient: RedisClient;
export default redisClient;
//# sourceMappingURL=client.d.ts.map