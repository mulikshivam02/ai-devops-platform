export interface HealthStatus {
  status: 'ok';
  service: string;
  database: 'connected' | 'disconnected';
  timestamp: string;
}
