export declare class RedisService {
    setJson<T>(key: string, data: T, ttlSeconds?: number): Promise<void>;
    getJson<T>(key: string): Promise<T | null>;
    del(key: string): Promise<boolean>;
    exists(key: string): Promise<boolean>;
    expire(key: string, ttlSeconds: number): Promise<boolean>;
    keys(pattern: string): Promise<string[]>;
    ping(): Promise<boolean>;
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, data: T, ttlSeconds?: number): Promise<void>;
    setWithTTL<T>(key: string, data: T, ttlSeconds: number): Promise<void>;
}
export declare const redisService: RedisService;
export default redisService;
//# sourceMappingURL=redisService.d.ts.map