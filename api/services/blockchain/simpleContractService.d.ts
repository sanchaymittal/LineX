export declare class SimpleContractService {
    private readonly contractAddress;
    getContractInfo(): Promise<{
        success: boolean;
        data?: any;
        error?: string;
    }>;
    getBalance(address: string): Promise<{
        success: boolean;
        data?: any;
        error?: string;
    }>;
    getNetworkInfo(): Promise<{
        success: boolean;
        data?: any;
        error?: string;
    }>;
    healthCheck(): Promise<{
        status: 'healthy' | 'unhealthy';
        provider: boolean;
        contract: boolean;
        error?: string;
    }>;
    private formatBalance;
    private decodeString;
    getContractAddress(): string;
}
export declare const simpleContractService: SimpleContractService;
export default simpleContractService;
//# sourceMappingURL=simpleContractService.d.ts.map