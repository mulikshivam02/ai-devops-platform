import 'dotenv/config';
import { readFileSync } from 'node:fs';

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

const jwtSecret =
  process.env.JWT_SECRET ?? (nodeEnvironment === 'production' ? '' : 'development-only-change-lens-secret');

// Placeholder values that have appeared in this project's own .env.example / docker-compose
// defaults over time. A secret this predictable lets anyone who has read the repo forge
// admin tokens against a deployment that never set a real one. Length alone doesn't catch
// this -- several of these are already 32+ characters. See review 1.7.
const KNOWN_PLACEHOLDER_SECRETS = new Set([
  'development-only-change-lens-secret',
  'replace-with-a-long-development-secret',
  'change-me-to-32-char-random-string-in-production'
]);

if (nodeEnvironment === 'production') {
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters in production.');
  if (KNOWN_PLACEHOLDER_SECRETS.has(jwtSecret))
    throw new Error('JWT_SECRET is a known placeholder value and must be replaced before running in production.');
  // Without this, a production deployment with public registration disabled (the
  // default -- see review 1.2/1.3) and no initial admin configured has no way for
  // anyone to ever log in.
  if (!process.env.INITIAL_ADMIN_EMAIL || !process.env.INITIAL_ADMIN_PASSWORD)
    throw new Error('INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD are required in production.');
}
const jsonBodyLimit = process.env.JSON_BODY_LIMIT ?? '1mb';

const ollamaTimeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS ?? 120000);

if (!Number.isInteger(ollamaTimeoutMs) || ollamaTimeoutMs <= 0) {
  throw new Error('OLLAMA_TIMEOUT_MS must be a positive integer.');
}

const githubApiBaseUrl = process.env.GITHUB_API_BASE_URL ?? 'https://api.github.com';
const githubTimeoutMs = Number(process.env.GITHUB_TIMEOUT_MS ?? 15000);
if (!Number.isInteger(githubTimeoutMs) || githubTimeoutMs <= 0) {
  throw new Error('GITHUB_TIMEOUT_MS must be a positive integer.');
}

function normalizeOptionalApiUrl(value: string | undefined, field: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${field} must be a valid HTTP or HTTPS URL.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error(`${field} must use HTTP or HTTPS.`);
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

const kubernetesApiUrl = normalizeOptionalApiUrl(process.env.KUBERNETES_API_URL, 'KUBERNETES_API_URL');
const kubernetesTimeoutMs = Number(process.env.KUBERNETES_TIMEOUT_MS ?? 10000);
if (!Number.isInteger(kubernetesTimeoutMs) || kubernetesTimeoutMs <= 0 || kubernetesTimeoutMs > 60000) {
  throw new Error('KUBERNETES_TIMEOUT_MS must be an integer between 1 and 60000.');
}

/**
 * Optional CA bundle for the Kubernetes API server (clusters almost always use a private CA, which
 * the default trust store rejects). KUBERNETES_CA_CERT is either the PEM text itself (literal
 * "\n" sequences are accepted, since env files and compose can't hold newlines) or the path to a
 * PEM file, e.g. /var/run/secrets/kubernetes.io/serviceaccount/ca.crt for in-cluster use.
 * Read once at startup so a bad path fails fast instead of on the first import.
 */
function loadKubernetesCaCert(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const pem = trimmed.includes('-----BEGIN') ? trimmed.replace(/\\n/g, '\n') : readCaFile(trimmed);
  if (!pem.includes('-----BEGIN CERTIFICATE-----'))
    throw new Error('KUBERNETES_CA_CERT must contain a PEM-encoded certificate (or the path to one).');
  return pem;
}

function readCaFile(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new Error('KUBERNETES_CA_CERT is not PEM text and the file it names could not be read.');
  }
}

const kubernetesCaCert = loadKubernetesCaCert(process.env.KUBERNETES_CA_CERT);

const prometheusApiUrl = normalizeOptionalApiUrl(process.env.PROMETHEUS_API_URL, 'PROMETHEUS_API_URL');
const prometheusTimeoutMs = Number(process.env.PROMETHEUS_TIMEOUT_MS ?? 10000);
if (!Number.isInteger(prometheusTimeoutMs) || prometheusTimeoutMs <= 0 || prometheusTimeoutMs > 60000) {
  throw new Error('PROMETHEUS_TIMEOUT_MS must be an integer between 1 and 60000.');
}

const lokiApiUrl = normalizeOptionalApiUrl(process.env.LOKI_API_URL, 'LOKI_API_URL');
const lokiTimeoutMs = Number(process.env.LOKI_TIMEOUT_MS ?? 10000);
if (!Number.isInteger(lokiTimeoutMs) || lokiTimeoutMs <= 0 || lokiTimeoutMs > 60000) {
  throw new Error('LOKI_TIMEOUT_MS must be an integer between 1 and 60000.');
}

export const env = {
  nodeEnvironment: nodeEnvironment as NodeEnvironment,
  port,
  mongodbUri,
  clientUrl,
  corsOrigin: clientUrl,
  authDisabled,
  jwtSecret,
  allowPublicRegistration: process.env.ALLOW_PUBLIC_REGISTRATION === 'true' && nodeEnvironment !== 'production',
  initialAdminEmail: process.env.INITIAL_ADMIN_EMAIL,
  initialAdminPassword: process.env.INITIAL_ADMIN_PASSWORD,
  jsonBodyLimit,
  appVersion: process.env.APP_VERSION ?? '0.1.0',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
  ollamaModel: process.env.OLLAMA_MODEL ?? 'llama3.2',
  ollamaTimeoutMs,
  githubApiBaseUrl,
  githubToken: process.env.GITHUB_TOKEN?.trim() || '',
  githubTimeoutMs,
  kubernetesApiUrl,
  kubernetesToken: process.env.KUBERNETES_TOKEN?.trim() || '',
  kubernetesTimeoutMs,
  kubernetesCaCert,
  prometheusApiUrl,
  prometheusToken: process.env.PROMETHEUS_TOKEN?.trim() || '',
  prometheusTimeoutMs,
  lokiApiUrl,
  lokiToken: process.env.LOKI_TOKEN?.trim() || '',
  lokiTimeoutMs
} as const;
