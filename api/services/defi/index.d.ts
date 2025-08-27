import { SYVaultService } from './syVaultService';
import { AutoCompoundVaultService } from './autoCompoundVaultService';
export interface DeFiServices {
    standardizedYieldService: SYVaultService;
    autoCompoundVaultService: AutoCompoundVaultService;
}
export declare function initializeDeFiServices(): Promise<DeFiServices>;
export declare function attachDeFiServices(app: any, services: DeFiServices): void;
//# sourceMappingURL=index.d.ts.map