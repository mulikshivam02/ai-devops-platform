export interface LokiApiResponse<T> {
  status?: string;
  data?: T;
  errorType?: string;
  error?: string;
}

export interface LokiQueryData {
  resultType?: string;
  result?: Array<{ stream?: Record<string, string>; values?: Array<[string, string]> }>;
}

export interface LokiBuildInfo {
  version?: string;
}

export interface LokiLogObservation {
  provider: 'loki';
  query: string;
  timestamp: string;
  /** Original Loki nanosecond timestamp, kept verbatim so two lines in the same millisecond stay distinct. */
  timestampNs: string;
  labels: Record<string, string>;
  message: string;
  observedAt: string;
}

export interface LokiHealth {
  configured: boolean;
  reachable: boolean;
  version?: string;
  message: string;
}

export interface LokiQueryRange {
  start: Date;
  end: Date;
}

export interface LokiImportResult {
  /** The line limit that was asked of Loki (not the number of lines that came back). */
  requested: number;
  /** Lines Loki actually returned. `observed === requested` means more may exist. */
  observed: number;
  imported: number;
  alreadyPresent: number;
  evidenceIds: string[];
}
