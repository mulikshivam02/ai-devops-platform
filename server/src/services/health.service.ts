import { isDatabaseConnected } from '../config/database.js';

export interface HealthStatus {
  status: 'ok';
  service: 'changelens-api';
  database: 'connected' | 'disconnected';
  timestamp: string;
}

export function getHealthStatus(): HealthStatus {
  return {
    status: 'ok',
    service: 'changelens-api',
    database: isDatabaseConnected() ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  };
}
