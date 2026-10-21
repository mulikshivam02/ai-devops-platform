import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { UserModel, toUserDTO, type UserRole } from '../models/User.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';

const scrypt = promisify(scryptCallback);
const TOKEN_TTL_SECONDS = 8 * 60 * 60;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

// A real scrypt output (unrelated password), used so a login attempt against a
// non-existent email still pays the full scrypt cost. Without this, an email that
// doesn't exist returns in ~0ms while a real one takes ~50-100ms, which lets an
// attacker enumerate valid accounts purely by timing. See review 1.11.
const DUMMY_PASSWORD_HASH =
  '00000000000000000000000000000000:' +
  '0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

interface TokenClaims {
  id: string;
  email: string;
  role: UserRole;
  tokenVersion: number;
}

function tokenFor(user: { id: string; email: string; role: UserRole; tokenVersion: number }): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      role: user.role,
      tv: user.tokenVersion,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
    })
  ).toString('base64url');
  const signature = createHmac('sha256', env.jwtSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

/**
 * Verifies signature and expiry only. Does NOT check the database, so a token that
 * passes this can still belong to a deactivated user or one whose role changed --
 * authenticate() in auth.middleware.ts does the live database check on top of this.
 * See review 1.6.
 */
export function verifyToken(token: string): TokenClaims {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) throw new AppError(401, 'Authentication token is invalid.', 'AUTH_INVALID');
  const expected = createHmac('sha256', env.jwtSecret).update(payload).digest('base64url');
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
    throw new AppError(401, 'Authentication token is invalid.', 'AUTH_INVALID');
  let data: { sub?: string; email?: string; role?: UserRole; tv?: number; exp?: number };
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as typeof data;
  } catch {
    throw new AppError(401, 'Authentication token is invalid.', 'AUTH_INVALID');
  }
  if (
    !data.sub ||
    !data.email ||
    !data.role ||
    typeof data.tv !== 'number' ||
    !data.exp ||
    data.exp < Math.floor(Date.now() / 1000)
  )
    throw new AppError(401, 'Authentication token is expired or invalid.', 'AUTH_EXPIRED');
  return { id: data.sub, email: data.email, role: data.role, tokenVersion: data.tv };
}

/**
 * Registration always creates a viewer. There is no "first user becomes admin"
 * bootstrap here -- that path let anyone who reached an empty database before the
 * real owner did become admin. The only way to create an admin account is the
 * INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD startup pair (see ensureInitialAdmin
 * below); role changes after that go through updateUserRole, which requires an
 * existing admin. See review 1.2 and 1.3.
 */
export async function registerUser(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
    throw new AppError(400, 'Email is invalid.', 'AUTH_INVALID_EMAIL');
  if (password.length < 12) throw new AppError(400, 'Password must be at least 12 characters.', 'AUTH_WEAK_PASSWORD');
  if (!env.allowPublicRegistration) throw new AppError(403, 'Registration is disabled.', 'AUTH_REGISTRATION_DISABLED');
  try {
    const user = await UserModel.create({
      email: normalized,
      passwordHash: await hashPassword(password),
      role: 'viewer',
      active: true,
      tokenVersion: 0
    });
    return {
      user: toUserDTO(user),
      token: tokenFor({ id: user._id.toString(), email: user.email, role: user.role, tokenVersion: user.tokenVersion })
    };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)
      throw new AppError(409, 'An account with this email already exists.', 'AUTH_DUPLICATE_EMAIL');
    throw error;
  }
}

export async function loginUser(email: string, password: string) {
  const user = await UserModel.findOne({ email: email.trim().toLowerCase(), active: true });
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !ok) throw new AppError(401, 'Invalid credentials.', 'AUTH_INVALID_CREDENTIALS');
  return {
    user: toUserDTO(user),
    token: tokenFor({ id: user._id.toString(), email: user.email, role: user.role, tokenVersion: user.tokenVersion })
  };
}

/**
 * Revokes every outstanding token for this user by bumping tokenVersion: the next
 * request carrying an old token fails the live check in authenticate(), regardless
 * of how much of its 8-hour TTL is left. Previously logout was a no-op that only
 * told the client to discard its token -- the token itself stayed valid. See review 1.6.
 */
export async function logoutUser(id: string): Promise<void> {
  await UserModel.findByIdAndUpdate(id, { $inc: { tokenVersion: 1 } });
}

export async function getUser(id: string) {
  const user = await UserModel.findById(id);
  if (!user || !user.active) throw new AppError(401, 'User is not available.', 'AUTH_USER_UNAVAILABLE');
  return toUserDTO(user);
}

/**
 * Admin-only role change. Bumps tokenVersion so any session the target user already
 * has open is forced to re-authenticate under the new role, rather than continuing
 * to act under whatever role was true when they logged in.
 */
export async function updateUserRole(targetId: string, role: UserRole) {
  const user = await UserModel.findByIdAndUpdate(targetId, { role, $inc: { tokenVersion: 1 } }, { new: true });
  if (!user) throw new AppError(404, 'User not found.', 'USER_NOT_FOUND');
  return toUserDTO(user);
}

export async function ensureInitialAdmin(): Promise<void> {
  if (!env.initialAdminEmail && !env.initialAdminPassword) return;
  if (!env.initialAdminEmail || !env.initialAdminPassword)
    throw new Error('INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD must be provided together.');
  if ((await UserModel.countDocuments()) > 0) return;
  await UserModel.create({
    email: env.initialAdminEmail.toLowerCase(),
    passwordHash: await hashPassword(env.initialAdminPassword),
    role: 'admin',
    active: true,
    tokenVersion: 0
  });
}
