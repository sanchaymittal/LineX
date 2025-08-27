"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TESTUSDT_ABI = exports.CONTRACT_CONSTANTS = void 0;
const contractAbis_1 = require("../constants/contractAbis");
exports.CONTRACT_CONSTANTS = {
    ADDRESS: contractAbis_1.CONTRACT_ADDRESSES.TEST_USDT,
    DECIMALS: 6,
    FAUCET_AMOUNT_USDT: 100,
    FAUCET_COOLDOWN_HOURS: 0,
    INITIAL_SUPPLY_USDT: 1000000,
};
exports.TESTUSDT_ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() pure returns (uint8)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address account) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function getFormattedBalance(address account) view returns (uint256)',
    'function getFormattedTotalSupply() view returns (uint256)',
    'function FAUCET_AMOUNT() view returns (uint256)',
    'function FAUCET_COOLDOWN() view returns (uint256)',
    'function lastFaucetClaim(address user) view returns (uint256)',
    'function canUseFaucet(address user) view returns (bool canClaim, uint256 timeLeft)',
    'function faucet()',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function transferFrom(address from, address to, uint256 amount) returns (bool)',
    'function approve(address spender, uint256 value) returns (bool)',
    'function mint(address to, uint256 amount)',
    'function emergencyMint(address to, uint256 usdtAmount)',
    'function burn(uint256 amount)',
    'function burnFrom(address from, uint256 amount)',
    'function pause()',
    'function unpause()',
    'function paused() view returns (bool)',
    'function owner() view returns (address)',
    'function transferOwnership(address newOwner)',
    'function renounceOwnership()',
    'event Transfer(address indexed from, address indexed to, uint256 value)',
    'event Approval(address indexed owner, address indexed spender, uint256 value)',
    'event FaucetClaimed(address indexed user, uint256 amount)',
    'event Minted(address indexed to, uint256 amount)',
    'event EmergencyMint(address indexed to, uint256 amount)',
    'event Paused(address account)',
    'event Unpaused(address account)',
    'event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)',
];
//# sourceMappingURL=contracts.js.map