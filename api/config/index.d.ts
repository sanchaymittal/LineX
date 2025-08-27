interface Config {
    port: number;
    nodeEnv: string;
    demoMode: boolean;
    app: {
        ngrokUrl?: string;
    };
    demo: {
        enabled: boolean;
    };
    redis: {
        url: string;
    };
    kaia: {
        rpcUrl: string;
        chainId: number;
        mockUsdtContractAddress: string;
        gasPayer: {
            privateKey: string;
        };
    };
    blockchain: {
        mockUsdtAddress: string;
        gasPayerPrivateKey: string;
    };
    dappPortal: {
        apiKey: string;
        webhookSecret: string;
    };
    jwt: {
        secret: string;
        expiresIn: string;
    };
    webhook: {
        ngrokUrl: string;
    };
    logging: {
        level: string;
    };
}
declare const config: Config;
export declare function validateConfig(): void;
export default config;
//# sourceMappingURL=index.d.ts.map