export interface PrometheusHealth { configured: boolean; reachable: boolean; version?: string; message: string; }
export interface LokiHealth { configured: boolean; reachable: boolean; version?: string; message: string; }
export interface PrometheusMetricObservation { provider: 'prometheus'; query: string; metric: Record<string, string>; timestamp: number; value: string; observedAt: string; }
export interface LokiLogObservation { provider: 'loki'; query: string; timestamp: string; timestampNs?: string; labels: Record<string, string>; message: string; observedAt: string; }
export interface ObservabilityImportResult {
  /** Prometheus instant queries have no limit to "request": `observed` series, `truncated` past the per-import cap, `skipped` malformed. */
  prometheus?: { observed: number; truncated: boolean; skipped: number; imported: number; alreadyPresent: number; evidenceIds: string[] };
  /** `requested` is the line limit asked of Loki; `observed === requested` means more lines may exist. */
  loki?: { requested: number; observed: number; imported: number; alreadyPresent: number; evidenceIds: string[] };
  /** Present only when a source failed while another succeeded; the successful import still happened. */
  errors?: Partial<Record<'prometheus' | 'loki', { code: string; message: string }>>;
}
