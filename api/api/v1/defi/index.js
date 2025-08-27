"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const vault_1 = __importDefault(require("./vault"));
const autocompound_1 = __importDefault(require("./autocompound"));
const transactionHelpers_1 = __importDefault(require("./transactionHelpers"));
const testUsers_1 = require("../../../constants/testUsers");
const contractAbis_1 = require("../../../constants/contractAbis");
const logger_1 = __importDefault(require("../../../utils/logger"));
const router = (0, express_1.Router)();
router.use((req, res, next) => {
    let testUserAddress = testUsers_1.TEST_USERS.BOB.address;
    if (req.originalUrl.includes(testUsers_1.TEST_USERS.ALICE.address)) {
        testUserAddress = testUsers_1.TEST_USERS.ALICE.address;
    }
    req.user = {
        walletAddress: testUserAddress,
        address: testUserAddress,
        sessionToken: 'hardcoded-test-session'
    };
    next();
});
router.get('/vaults', async (req, res) => {
    try {
        const { minApy, maxRisk, isActive } = req.query;
        const standardizedYieldService = req.app.locals.services.standardizedYieldService;
        const vaults = [];
        try {
            const syVaultInfo = await standardizedYieldService.getVaultInfo();
            const syVault = {
                id: 'standardized-yield',
                name: 'LineX Standardized Yield',
                symbol: 'SY-USDT',
                type: 'multi-strategy',
                contractAddress: process.env.SY_VAULT_ADDRESS || '0x13cFf25b9ce2F409b7e96F7C572234AF8e060420',
                asset: 'USDT',
                currentAPY: syVaultInfo.apy || 9.5,
                riskLevel: 2,
                isActive: true,
                tvl: syVaultInfo.totalAssets || '0',
                strategy: 'diversified',
                description: 'Multi-strategy diversified vault for risk-conscious users',
                targetUser: 'Bob (Risk Management)',
                features: ['Risk Diversification', 'Multi-Strategy', 'ERC4626 Compatible']
            };
            if (!minApy || syVault.currentAPY >= parseFloat(minApy)) {
                if (!maxRisk || syVault.riskLevel <= parseInt(maxRisk)) {
                    if (!isActive || syVault.isActive === (isActive === 'true')) {
                        vaults.push(syVault);
                    }
                }
            }
        }
        catch (error) {
            logger_1.default.warn('Failed to get SY vault info:', error);
        }
        const autoVault = {
            id: 'auto-compound',
            name: 'LineX Auto-Compound Vault',
            symbol: 'AC-USDT',
            type: 'single-strategy',
            contractAddress: process.env.AUTO_COMPOUND_VAULT_ADDRESS || '0x0a92B94D0fD3A4014aBCbF84f0BBe6273eA4d5B9',
            asset: 'USDT',
            currentAPY: 10.5,
            riskLevel: 3,
            isActive: true,
            tvl: '0',
            strategy: 'auto-compound',
            description: 'Single-strategy auto-compound vault for maximum yield',
            targetUser: 'Alice (Yield Maximization)',
            features: ['Auto-Compounding', 'Harvest Rewards', 'Gas Optimized']
        };
        if (!minApy || autoVault.currentAPY >= parseFloat(minApy)) {
            if (!maxRisk || autoVault.riskLevel <= parseInt(maxRisk)) {
                if (!isActive || autoVault.isActive === (isActive === 'true')) {
                    vaults.push(autoVault);
                }
            }
        }
        res.json({
            success: true,
            data: {
                vaults,
                count: vaults.length,
                filters: {
                    minApy: minApy || null,
                    maxRisk: maxRisk || null,
                    isActive: isActive || null
                },
                timestamp: Date.now()
            }
        });
    }
    catch (error) {
        logger_1.default.error('Failed to get vaults:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch vaults'
        });
    }
});
router.get('/vaults/:address/metrics', [
    (0, express_validator_1.param)('address').isEthereumAddress().withMessage('Valid vault address required')
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            res.status(400).json({
                success: false,
                error: 'Invalid address format',
                details: errors.array()
            });
            return;
        }
        const address = req.params.address;
        const standardizedYieldService = req.app.locals.services.standardizedYieldService;
        const syVaultAddress = process.env.SY_VAULT_ADDRESS;
        const autoVaultAddress = process.env.AUTO_COMPOUND_VAULT_ADDRESS;
        let metrics;
        if (address && address.toLowerCase() === syVaultAddress?.toLowerCase()) {
            const vaultInfo = await standardizedYieldService.getVaultInfo();
            metrics = {
                vaultAddress: address,
                name: 'LineX Standardized Yield',
                type: 'multi-strategy',
                totalValueLocked: vaultInfo.totalAssets || '0',
                totalSupply: vaultInfo.totalSupply || '0',
                currentAPY: vaultInfo.apy || 9.5,
                utilizationRate: 95.0,
                riskScore: 2.0,
                activeStrategies: vaultInfo.strategies?.length || 3,
                performanceMetrics: {
                    weeklyReturn: 0.18,
                    monthlyReturn: 0.79,
                    yearlyReturn: 9.5,
                    volatility: 0.05,
                    sharpeRatio: 1.9
                },
                lastUpdated: Date.now()
            };
        }
        else if (address && address.toLowerCase() === autoVaultAddress?.toLowerCase()) {
            metrics = {
                vaultAddress: address,
                name: 'LineX Auto-Compound Vault',
                type: 'single-strategy',
                totalValueLocked: '0',
                totalSupply: '0',
                currentAPY: 10.5,
                utilizationRate: 98.0,
                riskScore: 3.0,
                activeStrategies: 1,
                performanceMetrics: {
                    weeklyReturn: 0.20,
                    monthlyReturn: 0.88,
                    yearlyReturn: 10.5,
                    volatility: 0.08,
                    sharpeRatio: 1.3
                },
                compoundingInfo: {
                    frequency: '24h',
                    lastCompound: Date.now() - 3600000,
                    nextCompound: Date.now() + 82800000
                },
                lastUpdated: Date.now()
            };
        }
        else {
            res.status(404).json({
                success: false,
                error: 'Vault not found'
            });
            return;
        }
        res.json({
            success: true,
            data: metrics
        });
    }
    catch (error) {
        logger_1.default.error(`Failed to get vault metrics for ${req.params.address}:`, error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch vault metrics'
        });
    }
});
router.get('/portfolio/:userAddress', [
    (0, express_validator_1.param)('userAddress').isEthereumAddress().withMessage('Valid user address required')
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            res.status(400).json({
                success: false,
                error: 'Invalid address format',
                details: errors.array()
            });
            return;
        }
        const userAddress = req.params.userAddress;
        const standardizedYieldService = req.app.locals.services.standardizedYieldService;
        const autoCompoundVaultService = req.app.locals.services.autoCompoundVaultService;
        const syBalance = await standardizedYieldService.getBalance(userAddress);
        const acBalance = await autoCompoundVaultService.getBalance(userAddress);
        const syValue = parseFloat(syBalance.underlyingAssets || '0') / 1e6;
        const acValue = parseFloat(acBalance.underlyingAssets || '0') / 1e6;
        const totalValue = syValue + acValue;
        const portfolio = {
            userAddress,
            totalValue: totalValue.toString(),
            totalValueUSD: totalValue,
            positions: [
                {
                    vaultId: 'standardized-yield',
                    vaultName: 'LineX Standardized Yield',
                    shares: syBalance.syShares || '0',
                    underlyingAssets: syBalance.underlyingAssets || '0',
                    valueUSD: syValue,
                    percentage: (totalValue > 0 ? (syValue / totalValue * 100) : 0).toString(),
                    apy: 0.095,
                    riskLevel: 2
                },
                {
                    vaultId: 'auto-compound',
                    vaultName: 'LineX Auto-Compound Vault',
                    shares: acBalance.shares || '0',
                    underlyingAssets: acBalance.underlyingAssets || '0',
                    valueUSD: acValue,
                    percentage: (totalValue > 0 ? (acValue / totalValue * 100) : 0).toString(),
                    apy: 0.105,
                    riskLevel: 3
                }
            ],
            performance: {
                averageAPY: totalValue > 0 ?
                    ((syValue * 0.095 + acValue * 0.105) / totalValue) : 0,
                riskDistribution: {
                    low: totalValue > 0 ? (syValue / totalValue * 100) : 0,
                    medium: totalValue > 0 ? (acValue / totalValue * 100) : 0,
                    high: 0
                },
                diversificationScore: totalValue > 0 ?
                    (syValue > 0 && acValue > 0 ? 0.8 : 0.5) : 0
            },
            lastUpdated: Date.now()
        };
        res.json({
            success: true,
            data: portfolio
        });
    }
    catch (error) {
        logger_1.default.error(`Failed to get portfolio for ${req.params.userAddress}:`, error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch portfolio'
        });
    }
});
router.get('/positions/:userAddress', [
    (0, express_validator_1.param)('userAddress').isEthereumAddress().withMessage('Valid user address required')
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            res.status(400).json({
                success: false,
                error: 'Invalid address format',
                details: errors.array()
            });
            return;
        }
        const userAddress = req.params.userAddress;
        const standardizedYieldService = req.app.locals.services.standardizedYieldService;
        const positions = [];
        try {
            const syBalance = await standardizedYieldService.getBalance(userAddress);
            const syVaultInfo = await standardizedYieldService.getVaultInfo();
            positions.push({
                vaultId: 'standardized-yield',
                vaultName: 'LineX Standardized Yield',
                vaultAddress: process.env.SY_VAULT_ADDRESS || '0x13cFf25b9ce2F409b7e96F7C572234AF8e060420',
                position: {
                    shares: syBalance.syShares || '0',
                    underlyingAssets: syBalance.underlyingAssets || '0',
                    sharePrice: syBalance.sharePrice || '1.0',
                    claimableRewards: '0',
                    entryPrice: '1.0',
                    unrealizedGains: '0'
                },
                metrics: {
                    apy: syVaultInfo.apy || 9.5,
                    riskLevel: 2,
                    strategies: syVaultInfo.strategies || [],
                    allocation: syVaultInfo.strategies || []
                },
                lastUpdated: Date.now()
            });
        }
        catch (error) {
            logger_1.default.warn('Failed to get SY position:', error);
        }
        try {
            const autoCompoundVaultService = req.app.locals.services.autoCompoundVaultService;
            const acBalance = await autoCompoundVaultService.getBalance(userAddress);
            const acVaultInfo = await autoCompoundVaultService.getVaultInfo();
            positions.push({
                vaultId: 'auto-compound',
                vaultName: 'LineX Auto-Compound Vault',
                vaultAddress: contractAbis_1.CONTRACT_ADDRESSES.AUTO_COMPOUND_VAULT,
                position: {
                    shares: acBalance.shares || '0',
                    underlyingAssets: acBalance.underlyingAssets || '0',
                    sharePrice: acBalance.sharePrice || '1.0',
                    claimableRewards: '0',
                    entryPrice: '1.0',
                    unrealizedGains: '0'
                },
                metrics: {
                    apy: acVaultInfo.apy || 10.5,
                    riskLevel: 3,
                    strategies: acVaultInfo.strategies || [{ name: 'MockStakingStrategy', apy: '8.0', allocation: 100 }],
                    compoundingInfo: {
                        frequency: '24h',
                        lastCompound: Date.now() - 3600000,
                        effectiveAPY: acVaultInfo.apy || 10.5
                    }
                },
                lastUpdated: Date.now()
            });
        }
        catch (error) {
            logger_1.default.warn('Failed to get AutoCompound position:', error);
        }
        res.json({
            success: true,
            data: {
                userAddress,
                positions: positions.filter(p => parseFloat(p.position.shares) > 0),
                totalPositions: positions.length,
                timestamp: Date.now()
            }
        });
    }
    catch (error) {
        logger_1.default.error(`Failed to get positions for ${req.params.userAddress}:`, error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch positions'
        });
    }
});
router.get('/strategies', async (req, res) => {
    try {
        const standardizedYieldService = req.app.locals.services.standardizedYieldService;
        const strategies = [];
        try {
            const vaultInfo = await standardizedYieldService.getVaultInfo();
            const totalAPY = vaultInfo.apy || 9.5;
            const underlyingStrategies = [
                {
                    id: 'lending-strategy',
                    name: 'DeFi Lending Strategy',
                    address: '0x0a3FFc636d13fDC90D5cd6a305Fbd2Cff8d07115',
                    category: 'lending',
                    apy: 8.5,
                    allocation: 40,
                    riskLevel: 1,
                    protocol: 'Kaia DeFi',
                    description: 'Conservative lending strategy for stable returns'
                },
                {
                    id: 'staking-strategy',
                    name: 'Validator Staking Strategy',
                    address: '0x44d2624dD1925875bD35d68185B49d2d0c90430B',
                    category: 'staking',
                    apy: 11.2,
                    allocation: 35,
                    riskLevel: 2,
                    protocol: 'Kaia Network',
                    description: 'Validator staking for network security rewards'
                },
                {
                    id: 'liquidity-strategy',
                    name: 'LP Farming Strategy',
                    address: '0x373AE28C9e5b9D2426ECEb36B0C18CB7d0CCEB91',
                    category: 'liquidity',
                    apy: 12.8,
                    allocation: 25,
                    riskLevel: 3,
                    protocol: 'Kaia DEX',
                    description: 'Liquidity provision farming for trading fees'
                }
            ];
            strategies.push({
                id: 'sy-diversified',
                name: 'Multi-Strategy Diversification',
                vaultType: 'standardized-yield',
                vaultName: 'LineX Standardized Yield',
                vaultAddress: process.env.SY_VAULT_ADDRESS || '0x121F0fe66052e7da2c223b972Fc81a7881a2643a',
                apy: totalAPY,
                effectiveAPY: totalAPY,
                riskLevel: 2,
                tvl: parseInt(vaultInfo.totalAssets || '0') / 1000000,
                category: 'lending',
                isActive: true,
                compounding: false,
                isRecommended: false,
                description: 'Risk-diversified multi-strategy vault for conservative yield farming',
                protocols: ['LineX', 'Kaia'],
                minDeposit: 100,
                capacity: 10000000,
                underlyingStrategies: underlyingStrategies,
                strategyCount: underlyingStrategies.length,
                totalAllocation: underlyingStrategies.reduce((sum, s) => sum + s.allocation, 0),
                weightedAPY: underlyingStrategies.reduce((sum, s) => sum + (s.apy * s.allocation / 100), 0).toFixed(2),
                riskDistribution: {
                    low: underlyingStrategies.filter(s => s.riskLevel === 1).reduce((sum, s) => sum + s.allocation, 0),
                    medium: underlyingStrategies.filter(s => s.riskLevel === 2).reduce((sum, s) => sum + s.allocation, 0),
                    high: underlyingStrategies.filter(s => s.riskLevel === 3).reduce((sum, s) => sum + s.allocation, 0)
                }
            });
        }
        catch (error) {
            logger_1.default.warn('Failed to get SY strategies:', error);
        }
        strategies.push({
            id: 'ac-auto-compound',
            name: 'Auto-Compound Optimization',
            vaultType: 'auto-compound',
            vaultName: 'LineX Auto-Compound Vault',
            vaultAddress: process.env.AUTO_COMPOUND_VAULT_ADDRESS || '0x7d5aa1e9ecdd8c228d3328d2ac6c4ddf63970c36',
            apy: 8.0,
            effectiveAPY: 10.5,
            riskLevel: 3,
            tvl: 500,
            category: 'farming',
            isActive: true,
            compounding: true,
            isRecommended: true,
            description: 'Single-strategy auto-compound vault for maximum yield efficiency',
            protocols: ['LineX', 'Kaia'],
            minDeposit: 100,
            capacity: 5000000
        });
        res.json({
            success: true,
            data: {
                strategies,
                count: strategies.length,
                categories: ['lending', 'staking', 'liquidity'],
                vaultTypes: ['standardized-yield', 'auto-compound'],
                timestamp: Date.now()
            }
        });
    }
    catch (error) {
        logger_1.default.error('Failed to get strategies:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch strategies'
        });
    }
});
router.get('/strategies/comparison', async (req, res) => {
    try {
        const standardizedYieldService = req.app.locals.services.standardizedYieldService;
        let syAPY = 9.5;
        try {
            const vaultInfo = await standardizedYieldService.getVaultInfo();
            syAPY = vaultInfo.apy || 9.5;
        }
        catch (error) {
            logger_1.default.warn('Using fallback SY APY:', error);
        }
        const comparison = {
            strategies: {
                standardizedYield: {
                    name: 'Multi-Strategy Diversification',
                    type: 'standardized-yield',
                    targetUser: 'Bob (Risk Management)',
                    apy: syAPY,
                    riskLevel: 2,
                    features: {
                        diversification: true,
                        multiStrategy: true,
                        erc4626Compatible: true,
                        autoRebalancing: true
                    },
                    pros: [
                        'Risk diversification across multiple strategies',
                        'Lower volatility through portfolio allocation',
                        'ERC4626 standard compatibility',
                        'Automated rebalancing based on performance'
                    ],
                    cons: [
                        'Moderate gas costs for rebalancing',
                        'Lower maximum yield potential',
                        'Complex strategy management'
                    ]
                },
                autoCompound: {
                    name: 'Single-Strategy Auto-Compound',
                    type: 'auto-compound',
                    targetUser: 'Alice (Yield Maximization)',
                    apy: 8.0,
                    effectiveAPY: 10.5,
                    riskLevel: 3,
                    features: {
                        autoCompounding: true,
                        singleStrategy: true,
                        harvestRewards: true,
                        gasOptimized: true
                    },
                    pros: [
                        'Maximum yield through compounding',
                        'Automated yield harvesting',
                        'Gas-efficient single strategy',
                        'Harvest incentive rewards'
                    ],
                    cons: [
                        'Higher risk concentration',
                        'No diversification benefits',
                        'Strategy-specific risks'
                    ]
                }
            },
            riskRewardAnalysis: {
                riskAdjustedReturns: {
                    standardizedYield: syAPY / 2,
                    autoCompound: 10.5 / 3
                },
                volatilityEstimate: {
                    standardizedYield: 0.05,
                    autoCompound: 0.08
                },
                recommendation: {
                    conservative: 'standardized-yield',
                    aggressive: 'auto-compound',
                    balanced: 'combination-50-50'
                }
            },
            performanceComparison: {
                timeframes: {
                    weekly: {
                        standardizedYield: syAPY / 52,
                        autoCompound: 10.5 / 52
                    },
                    monthly: {
                        standardizedYield: syAPY / 12,
                        autoCompound: 10.5 / 12
                    },
                    yearly: {
                        standardizedYield: syAPY,
                        autoCompound: 10.5
                    }
                }
            },
            lastUpdated: Date.now()
        };
        res.json({
            success: true,
            data: comparison
        });
    }
    catch (error) {
        logger_1.default.error('Failed to get strategy comparison:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch strategy comparison'
        });
    }
});
router.use('/vault', vault_1.default);
router.use('/autocompound', autocompound_1.default);
router.use('/', transactionHelpers_1.default);
router.get('/transactions/:userAddress', [
    (0, express_validator_1.param)('userAddress').isEthereumAddress().withMessage('Valid user address required')
], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            res.status(400).json({
                success: false,
                error: 'Invalid address format',
                details: errors.array()
            });
            return;
        }
        const userAddress = req.params.userAddress;
        const { limit = '10', type } = req.query;
        const recentTransactions = [
            {
                id: 'tx_001',
                type: 'deposit',
                vaultId: 'standardized-yield',
                vaultName: 'LineX Standardized Yield',
                amount: '200.00',
                amountUSD: 200.00,
                timestamp: Date.now() - 86400000,
                transactionHash: '0x1745b3fb0b2210b3fe4e196a5f3b225f2a5c53ab56abfd575c5cde82c3853ae1',
                status: 'completed',
                apy: 0.095,
                shares: '116666666'
            },
            {
                id: 'tx_002',
                type: 'deposit',
                vaultId: 'auto-compound',
                vaultName: 'LineX Auto-Compound Vault',
                amount: '100.00',
                amountUSD: 100.00,
                timestamp: Date.now() - 172800000,
                transactionHash: '0xa1b2c3d4e5f6789012345678901234567890123456789012345678901234567890',
                status: 'completed',
                apy: 0.105,
                shares: '32258064'
            }
        ];
        let filteredTransactions = recentTransactions;
        if (type) {
            filteredTransactions = recentTransactions.filter(tx => tx.type === type);
        }
        const limitNum = parseInt(limit, 10);
        if (limitNum > 0) {
            filteredTransactions = filteredTransactions.slice(0, limitNum);
        }
        res.json({
            success: true,
            data: {
                userAddress,
                transactions: filteredTransactions,
                totalCount: filteredTransactions.length,
                filters: {
                    type: type || 'all',
                    limit: limitNum
                },
                timestamp: Date.now()
            }
        });
    }
    catch (error) {
        logger_1.default.error(`Failed to get transactions for ${req.params.userAddress}:`, error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch transactions'
        });
    }
});
router.get('/contracts', (req, res) => {
    res.json({
        success: true,
        data: {
            contracts: {
                testUSDT: {
                    name: 'Test USDT',
                    address: contractAbis_1.CONTRACT_ADDRESSES.TEST_USDT,
                    type: 'ERC20',
                    decimals: 6,
                    symbol: 'USDT',
                    description: 'Test USDT token with faucet functionality',
                    features: ['Mintable', 'Pausable', 'EIP-2612 Permits', 'Faucet'],
                    chainId: 1001,
                    network: 'Kaia Testnet (Kairos)',
                    blockExplorer: `https://kairos.kaiascan.io/account/${contractAbis_1.CONTRACT_ADDRESSES.TEST_USDT}`
                },
                standardizedYield: {
                    name: 'StandardizedYield Vault',
                    address: contractAbis_1.CONTRACT_ADDRESSES.STANDARDIZED_YIELD_VAULT,
                    type: 'ERC4626',
                    decimals: 18,
                    symbol: 'SY-USDT',
                    description: 'Multi-strategy diversified yield vault with risk management',
                    features: ['Multi-strategy', 'Risk diversification', 'ERC4626 compliant', 'Rebalancing'],
                    underlyingAsset: contractAbis_1.CONTRACT_ADDRESSES.TEST_USDT,
                    strategies: [
                        {
                            id: 'lending-strategy',
                            name: 'DeFi Lending Strategy',
                            address: contractAbis_1.CONTRACT_ADDRESSES.MOCK_LENDING_STRATEGY,
                            category: 'lending',
                            allocation: '40%'
                        },
                        {
                            id: 'staking-strategy',
                            name: 'Validator Staking Strategy',
                            address: contractAbis_1.CONTRACT_ADDRESSES.MOCK_STAKING_STRATEGY,
                            category: 'staking',
                            allocation: '35%'
                        },
                        {
                            id: 'liquidity-strategy',
                            name: 'LP Farming Strategy',
                            address: contractAbis_1.CONTRACT_ADDRESSES.MOCK_LP_STRATEGY,
                            category: 'liquidity',
                            allocation: '25%'
                        }
                    ],
                    chainId: 1001,
                    network: 'Kaia Testnet (Kairos)',
                    blockExplorer: `https://kairos.kaiascan.io/account/${contractAbis_1.CONTRACT_ADDRESSES.STANDARDIZED_YIELD_VAULT}`
                },
                autoCompound: {
                    name: 'AutoCompound Vault',
                    address: contractAbis_1.CONTRACT_ADDRESSES.AUTO_COMPOUND_VAULT,
                    type: 'Custom Vault',
                    decimals: 18,
                    symbol: 'AC-USDT',
                    description: 'Single-strategy auto-compounding vault for maximum yield efficiency',
                    features: ['Auto-compounding', 'Harvest rewards', 'Gas optimized', 'Single strategy focus'],
                    underlyingAsset: contractAbis_1.CONTRACT_ADDRESSES.TEST_USDT,
                    strategy: {
                        name: 'High-Yield Farming Strategy',
                        category: 'farming',
                        compoundingFrequency: '24 hours'
                    },
                    chainId: 1001,
                    network: 'Kaia Testnet (Kairos)',
                    blockExplorer: `https://kairos.kaiascan.io/account/${contractAbis_1.CONTRACT_ADDRESSES.AUTO_COMPOUND_VAULT}`
                }
            },
            networkInfo: {
                name: 'Kaia Testnet (Kairos)',
                chainId: 1001,
                rpcUrl: 'https://public-en-kairos.node.kaia.io',
                blockExplorer: 'https://kairos.kaiascan.io',
                nativeCurrency: {
                    name: 'KAIA',
                    symbol: 'KAIA',
                    decimals: 18
                }
            },
            deploymentInfo: {
                deploymentDate: '2024-08-20',
                deployer: '0xdF05dF91C7B993C0E96dFeE008B10dd0DaD35B12',
                version: '1.0.0',
                upgradeable: false
            },
            gasSettings: {
                feeDelegationEnabled: true,
                gasPayerAddress: process.env.GAS_PAYER_ADDRESS || '0xdF05dF91C7B993C0E96dFeE008B10dd0DaD35B12',
                estimatedGasLimits: {
                    erc20Approve: 100000,
                    vaultDeposit: 500000,
                    vaultWithdraw: 500000,
                    autoCompoundDeposit: 300000,
                    autoCompoundWithdraw: 300000,
                    harvest: 250000
                }
            },
            apiEndpoints: {
                transactionHelpers: {
                    approveRequest: '/api/v1/defi/approve-request',
                    depositRequest: '/api/v1/defi/deposit-request',
                    withdrawRequest: '/api/v1/defi/withdraw-request',
                    executeSignature: '/api/v1/defi/signature/execute'
                },
                vaultOperations: {
                    deposit: '/api/v1/defi/vault/deposit',
                    withdraw: '/api/v1/defi/vault/withdraw',
                    preview: '/api/v1/defi/vault/deposit/preview'
                },
                autoCompoundOperations: {
                    deposit: '/api/v1/defi/autocompound/deposit',
                    withdraw: '/api/v1/defi/autocompound/withdraw',
                    preview: '/api/v1/defi/autocompound/deposit/preview'
                },
                information: {
                    strategies: '/api/v1/defi/strategies',
                    vaults: '/api/v1/defi/vaults',
                    contracts: '/api/v1/defi/contracts'
                }
            }
        },
        metadata: {
            timestamp: new Date().toISOString(),
            requestId: req.correlationId,
        }
    });
});
router.get('/', (req, res) => {
    res.json({
        success: true,
        data: {
            message: 'LineX DeFi API is operational',
            version: '1.0.0',
            endpoints: {
                vault: '/api/v1/defi/vault',
                autocompound: '/api/v1/defi/autocompound',
            },
            timestamp: Date.now()
        }
    });
});
exports.default = router;
//# sourceMappingURL=index.js.map