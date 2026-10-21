import { Can } from '../auth/RequireAuth';
import { useEffect, useState } from 'react';
import { getLokiHealth, getPrometheusHealth, importObservability, listResources, queryLoki, queryPrometheus } from '../services/api';
import type { Resource } from '../types/resource';
import type { LokiHealth, LokiLogObservation, ObservabilityImportResult, PrometheusHealth, PrometheusMetricObservation } from '../types/observability';

export function ObservabilityPage() {
  const [prometheusHealth, setPrometheusHealth] = useState<PrometheusHealth | null>(null);
  const [lokiHealth, setLokiHealth] = useState<LokiHealth | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourceId, setResourceId] = useState('');
  const [prometheusQuery, setPrometheusQuery] = useState('up');
  const [lokiQuery, setLokiQuery] = useState('{app="api"}');
  const [lokiStart, setLokiStart] = useState('');
  const [lokiEnd, setLokiEnd] = useState('');
  const [lokiLimit, setLokiLimit] = useState('25');
  const [metrics, setMetrics] = useState<PrometheusMetricObservation[]>([]);
  const [logs, setLogs] = useState<LokiLogObservation[]>([]);
  const [result, setResult] = useState<ObservabilityImportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([getPrometheusHealth(), getLokiHealth(), listResources()])
      .then(([nextPrometheus, nextLoki, nextResources]) => { setPrometheusHealth(nextPrometheus); setLokiHealth(nextLoki); setResources(nextResources); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load observability context.'))
      .finally(() => setLoading(false));
  }, []);

  async function preview() {
    setBusy(true); setError(null); setResult(null);
    try {
      const [nextMetrics, nextLogs] = await Promise.all([
        prometheusQuery.trim() ? queryPrometheus(prometheusQuery) : Promise.resolve([]),
        lokiQuery.trim() ? queryLoki(lokiQuery, Number(lokiLimit), lokiStart || undefined, lokiEnd || undefined) : Promise.resolve([])
      ]);
      setMetrics(nextMetrics); setLogs(nextLogs);
    } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : 'Unable to preview observability data.'); }
    finally { setBusy(false); }
  }

  async function importEvidence() {
    if (!resourceId) { setError('Select an existing ChangeLens resource before importing.'); return; }
    if (!prometheusQuery.trim() && !lokiQuery.trim()) { setError('Enter at least one PromQL or LogQL query.'); return; }
    setBusy(true); setError(null);
    try {
      setResult(await importObservability({ resourceId, ...(prometheusQuery.trim() ? { prometheus: { query: prometheusQuery } } : {}), ...(lokiQuery.trim() ? { loki: { query: lokiQuery, ...(lokiStart ? { start: lokiStart } : {}), ...(lokiEnd ? { end: lokiEnd } : {}), limit: Number(lokiLimit) } } : {}) }));
    } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : 'Unable to import observability evidence.'); }
    finally { setBusy(false); }
  }

  return <section className="history-section observability-section" id="observability" aria-labelledby="observability-title">
    <div className="history-heading"><p className="eyebrow">Phase 14 · Evidence collection</p><h2 id="observability-title">Observability signals</h2><p className="section-copy">Read-only Prometheus metrics and Loki logs become bounded Evidence attached to an existing ChangeLens resource. Metric or log changes do not create causal Change records.</p></div>
    {loading ? <p className="empty-state">Loading observability integrations...</p> : <>
      <div className="observability-status" role="status"><Status label="Prometheus" health={prometheusHealth} /><Status label="Loki" health={lokiHealth} /></div>
      <div className="history-toolbar observability-toolbar"><label>ChangeLens resource<select value={resourceId} onChange={(event) => setResourceId(event.target.value)}><option value="">Select existing resource</option>{resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label><button className="button button--quiet" type="button" disabled={busy} onClick={() => void preview()}>Preview signals</button><Can minimum="operator"><button className="button button--primary" type="button" disabled={busy || !resourceId} onClick={() => void importEvidence()}>Import Evidence</button></Can></div>
      <div className="observability-inputs"><label>PromQL<input value={prometheusQuery} maxLength={1000} onChange={(event) => setPrometheusQuery(event.target.value)} /></label><label>LogQL<input value={lokiQuery} maxLength={1000} onChange={(event) => setLokiQuery(event.target.value)} /></label><label>Log limit<input type="number" min="1" max="50" value={lokiLimit} onChange={(event) => setLokiLimit(event.target.value)} /></label><label>Start <input type="datetime-local" value={lokiStart} onChange={(event) => setLokiStart(event.target.value)} /></label><label>End <input type="datetime-local" value={lokiEnd} onChange={(event) => setLokiEnd(event.target.value)} /></label></div>
      {error ? <div className="inline-error" role="alert"><span>{error}</span></div> : null}
      <div className="observability-results"><article><h3>Metric preview</h3>{metrics.length === 0 ? <p className="empty-state">No metric observations loaded.</p> : metrics.map((item, index) => <div className="observability-record" key={`${item.timestamp}-${index}`}><strong>{item.value}</strong><span>{Object.entries(item.metric).map(([key, value]) => `${key}=${value}`).join(', ') || 'unlabelled metric'}</span></div>)}</article><article><h3>Log preview</h3>{logs.length === 0 ? <p className="empty-state">No log observations loaded.</p> : logs.map((item, index) => <div className="observability-record" key={`${item.timestamp}-${index}`}><strong>{new Date(item.timestamp).toLocaleTimeString()}</strong><span>{item.message}</span></div>)}</article></div>
      {result ? <div className="success-message observability-result" role="status">Imported {result.prometheus?.imported ?? 0} metric and {result.loki?.imported ?? 0} log observation(s); skipped {result.prometheus?.alreadyPresent ?? 0} metric and {result.loki?.alreadyPresent ?? 0} log duplicate(s).{result.prometheus?.truncated ? ' Prometheus returned more series than one import keeps; narrow the query to see the rest.' : ''}{result.loki && result.loki.observed >= result.loki.requested ? ' Loki returned the full line limit, so older lines in the range may not be imported.' : ''}</div> : null}
      {result?.errors ? <div className="error-message observability-result" role="alert">{Object.entries(result.errors).map(([source, failure]) => `${source} import failed (${failure.code}): ${failure.message}`).join(' ')}</div> : null}
    </>}
  </section>;
}

function Status({ label, health }: { label: string; health: PrometheusHealth | LokiHealth | null }) {
  const state = health?.reachable ? 'healthy' : health?.configured ? 'unavailable' : 'pending';
  return <span><strong>{label}</strong><span className={`status-badge status-badge--${state}`}>{health?.reachable ? 'Connected' : health?.configured ? 'Unavailable' : 'Not configured'}</span></span>;
}
