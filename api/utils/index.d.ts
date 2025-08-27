export declare function generateId(): string;
export declare function generateCorrelationId(): string;
export declare function generateToken(): string;
export declare function formatCurrency(amount: number, currency: string): string;
export declare function isValidEmail(email: string): boolean;
export declare function isValidEthereumAddress(address: string): boolean;
export declare function calculateExpirationTime(minutes: number): string;
export declare function isExpired(expirationTime: string): boolean;
export declare function delay(ms: number): Promise<void>;
export declare function retryAsync<T>(fn: () => Promise<T>, maxRetries?: number, delayMs?: number): Promise<T>;
//# sourceMappingURL=index.d.ts.map