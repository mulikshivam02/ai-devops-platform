import { Router } from 'express';
import { login, logout, me, register, updateRole } from '../controllers/auth.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import rateLimit from 'express-rate-limit';
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
export const authRouter = Router();
authRouter.post('/register', authLimit, register);
authRouter.post('/login', authLimit, login);
authRouter.post('/logout', authenticate, logout);
authRouter.get('/me', authenticate, authorize('viewer'), me);
// Role changes require an existing admin -- registration can no longer grant one.
// See review 1.3.
authRouter.patch('/users/:id/role', authenticate, authorize('admin'), updateRole);
