import { Router } from 'express';
import { login, logout, me, register } from '../controllers/auth.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import rateLimit from 'express-rate-limit';
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
export const authRouter = Router();
authRouter.post('/register', authLimit, register); authRouter.post('/login', authLimit, login); authRouter.post('/logout', authenticate, logout); authRouter.get('/me', authenticate, authorize('viewer', 'operator', 'admin'), me);