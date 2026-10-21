import { isDatabaseConnected } from '../config/database.js';
import { env } from '../config/env.js';

export interface HealthStatus {
  status: 'ok' | 'not_ready';
  service: 'changelens-api';
  database: 'connected' | 'disconnected';
  timestamp: string;
  version: string;
  environment: string;
  uptime: number;
}

export function getHealthStatus(): HealthStatus {
  return {
    status: isDatabaseConnected() ? 'ok' : 'not_ready',
    service: 'changelens-api',
    database: isDatabaseConnected() ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    version: env.appVersion,
    environment: env.nodeEnvironment,
    uptime: Math.floor(process.uptime())
  };
}

export function getLiveness() {
  return {
    status: 'ok' as const,
    timestamp: new Date().toISOString(),
    version: env.appVersion,
    uptime: Math.floor(process.uptime())
  };
}
export function getReadiness() {
  const ready = isDatabaseConnected();
  return {
    status: ready ? ('ready' as const) : ('not_ready' as const),
    database: ready ? ('connected' as const) : ('disconnected' as const),
    ai: 'optional' as const,
    timestamp: new Date().toISOString()
  };
}
