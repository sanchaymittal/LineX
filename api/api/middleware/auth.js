"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuthMiddleware = exports.authMiddleware = void 0;
exports.generateJWT = generateJWT;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = __importDefault(require("../../config"));
const logger_1 = __importDefault(require("../../utils/logger"));
const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                success: false,
                data: null,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Authorization header missing or invalid',
                },
            });
            return;
        }
        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = jsonwebtoken_1.default.verify(token, config_1.default.jwt.secret);
        }
        catch (error) {
            res.status(401).json({
                success: false,
                data: null,
                error: {
                    code: 'INVALID_TOKEN',
                    message: 'Invalid or expired token',
                },
            });
            return;
        }
        req.user = {
            walletAddress: decoded.walletAddress,
            sessionToken: decoded.sessionToken,
        };
        next();
    }
    catch (error) {
        logger_1.default.error('Auth middleware error:', error);
        res.status(500).json({
            success: false,
            data: null,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Authentication failed',
            },
        });
    }
};
exports.authMiddleware = authMiddleware;
const optionalAuthMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        next();
        return;
    }
    try {
        await (0, exports.authMiddleware)(req, res, next);
    }
    catch (error) {
        next();
    }
};
exports.optionalAuthMiddleware = optionalAuthMiddleware;
function generateJWT(walletAddress, sessionToken) {
    const payload = { walletAddress, sessionToken };
    return jsonwebtoken_1.default.sign(payload, config_1.default.jwt.secret, { expiresIn: '12h' });
}
//# sourceMappingURL=auth.js.map