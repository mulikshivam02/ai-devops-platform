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

const ollamaTimeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS ?? 60000);

if (!Number.isInteger(ollamaTimeoutMs) || ollamaTimeoutMs <= 0) {
  throw new Error('OLLAMA_TIMEOUT_MS must be a positive integer.');
}

export const env = {
  nodeEnvironment: nodeEnvironment as NodeEnvironment,
  port,
  mongodbUri,
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
  ollamaModel: process.env.OLLAMA_MODEL ?? 'llama3.2',
  ollamaTimeoutMs
} as const;
