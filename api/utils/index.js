"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateId = generateId;
exports.generateCorrelationId = generateCorrelationId;
exports.generateToken = generateToken;
exports.formatCurrency = formatCurrency;
exports.isValidEmail = isValidEmail;
exports.isValidEthereumAddress = isValidEthereumAddress;
exports.calculateExpirationTime = calculateExpirationTime;
exports.isExpired = isExpired;
exports.delay = delay;
exports.retryAsync = retryAsync;
const uuid_1 = require("uuid");
const crypto_1 = __importDefault(require("crypto"));
function generateId() {
    return (0, uuid_1.v4)();
}
function generateCorrelationId() {
    return (0, uuid_1.v4)();
}
function generateToken() {
    return crypto_1.default.randomBytes(32).toString('hex');
}
function formatCurrency(amount, currency) {
    const formatters = {
        KRW: new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }),
        USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
        PHP: new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }),
    };
    return formatters[currency]?.format(amount) || `${amount} ${currency}`;
}
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
function isValidEthereumAddress(address) {
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    return addressRegex.test(address);
}
function calculateExpirationTime(minutes) {
    const now = new Date();
    now.setMinutes(now.getMinutes() + minutes);
    return now.toISOString();
}
function isExpired(expirationTime) {
    return new Date() > new Date(expirationTime);
}
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function retryAsync(fn, maxRetries = 3, delayMs = 1000) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const attempt = async () => {
            try {
                const result = await fn();
                resolve(result);
            }
            catch (error) {
                attempts++;
                if (attempts >= maxRetries) {
                    reject(error);
                }
                else {
                    setTimeout(attempt, delayMs * attempts);
                }
            }
        };
        attempt();
    });
}
//# sourceMappingURL=index.js.map