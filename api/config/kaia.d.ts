export interface KaiaConfig {
    rpcUrl: string;
    chainId: number;
    networkName: string;
    blockTime: number;
    finality: number;
}
export declare const KAIA_NETWORKS: {
    readonly MAINNET: {
        readonly rpcUrl: "https://public-en.node.kaia.io";
        readonly chainId: 8217;
        readonly networkName: "Kaia Mainnet";
        readonly blockTime: 1000;
        readonly finality: 1;
    };
    readonly TESTNET: {
        readonly rpcUrl: "https://public-en-kairos.node.kaia.io";
        readonly chainId: 1001;
        readonly networkName: "Kaia Testnet (Kairos)";
        readonly blockTime: 1000;
        readonly finality: 1;
    };
};
export declare function getKaiaConfig(): KaiaConfig;
export declare function validateKaiaConfig(): void;
//# sourceMappingURL=kaia.d.ts.map