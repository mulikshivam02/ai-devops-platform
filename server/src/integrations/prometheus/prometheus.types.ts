export interface PrometheusApiResponse<T> {
  status?: string;
  errorType?: string;
  error?: string;
  data?: T;
}

export interface PrometheusQueryData {
  resultType?: string;
  result?: Array<{
    metric?: Record<string, string>;
    value?: [number | string, string];
  }>;
}

export interface PrometheusBuildInfo {
  version?: string;
  revision?: string;
  branch?: string;
  goVersion?: string;
}

export interface PrometheusMetricObservation {
  provider: 'prometheus';
  query: string;
  metric: Record<string, string>;
  timestamp: number;
  value: string;
  observedAt: string;
}

export interface PrometheusHealth {
  configured: boolean;
  reachable: boolean;
  version?: string;
  message: string;
}

export interface PrometheusImportResult {
  /**
   * Prometheus instant queries have no client-side limit, so there is no "requested" count.
   * `observed` is the number of usable series; `truncated`/`skipped` explain any difference
   * from what the API returned.
   */
  observed: number;
  /** The API returned more series than the per-import cap, so the rest were not imported. */
  truncated: boolean;
  /** Series dropped because they were malformed (no scalar value, or an oversized value). */
  skipped: number;
  imported: number;
  alreadyPresent: number;
  evidenceIds: string[];
}
