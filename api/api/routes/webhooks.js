"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = __importDefault(require("../../utils/logger"));
const router = (0, express_1.Router)();
router.use((req, res, next) => {
    logger_1.default.info('📥 Webhook request received', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
    });
    next();
});
router.post('/mock', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    logger_1.default.info('🧪 Mock webhook received', { body: req.body });
    res.status(200).json({
        success: true,
        message: 'Mock webhook processed',
        received: req.body,
        timestamp: new Date().toISOString(),
    });
}));
router.get('/health', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Webhook system healthy',
        timestamp: new Date().toISOString(),
    });
}));
exports.default = router;
//# sourceMappingURL=webhooks.js.map