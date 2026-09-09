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

export const env = {
  nodeEnvironment: nodeEnvironment as NodeEnvironment,
  port,
  mongodbUri,
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173'
} as const;
