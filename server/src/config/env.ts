import 'dotenv/config';

type NodeEnvironment = 'development' | 'test' | 'production';

const nodeEnvironment = process.env.NODE_ENV ?? 'development';

if (!['development', 'test', 'production'].includes(nodeEnvironment)) {
  throw new Error('NODE_ENV must be development, test, or production.');
}

const port = Number(process.env.PORT ?? 4000);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error('PORT must be a valid TCP port.');
}

const mongodbUri = process.env.MONGODB_URI;

if (!mongodbUri) {
  throw new Error('MONGODB_URI is required.');
}

const clientUrl = process.env.CLIENT_URL ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173';
const authDisabled = process.env.AUTH_DISABLED === 'true';

if (nodeEnvironment === 'production' && (!process.env.CLIENT_URL || authDisabled)) {
  throw new Error('CLIENT_URL is required and AUTH_DISABLED must be false in production.');
}

const jwtSecret = process.env.JWT_SECRET ?? (nodeEnvironment === 'production' ? '' : 'development-only-change-lens-secret');
if (nodeEnvironment === 'production' && jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters in production.');
const jsonBodyLimit = process.env.JSON_BODY_LIMIT ?? '1mb';

const ollamaTimeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS ?? 120000);

if (!Number.isInteger(ollamaTimeoutMs) || ollamaTimeoutMs <= 0) {
  throw new Error('OLLAMA_TIMEOUT_MS must be a positive integer.');
}

export const env = {
  nodeEnvironment: nodeEnvironment as NodeEnvironment,
  port,
  mongodbUri,
  clientUrl,
  corsOrigin: clientUrl,
  authDisabled: authDisabled || nodeEnvironment === 'test',
  jwtSecret,
  allowPublicRegistration: process.env.ALLOW_PUBLIC_REGISTRATION === 'true' && nodeEnvironment !== 'production',
  initialAdminEmail: process.env.INITIAL_ADMIN_EMAIL,
  initialAdminPassword: process.env.INITIAL_ADMIN_PASSWORD,
  jsonBodyLimit,
  appVersion: process.env.APP_VERSION ?? '0.1.0',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
  ollamaModel: process.env.OLLAMA_MODEL ?? 'llama3.2',
  ollamaTimeoutMs
} as const;
