import { Can } from '../auth/RequireAuth';
import { useEffect, useState } from 'react';
import { getKubernetesHealth, importKubernetesWorkloads, listKubernetesNamespaces, listKubernetesWorkloads, listResources } from '../services/api';
import type { Resource } from '../types/resource';
import type { KubernetesHealth, KubernetesImportResult, KubernetesNamespace, KubernetesWorkload, KubernetesWorkloadKind } from '../types/kubernetes';

const kinds: KubernetesWorkloadKind[] = ['Deployment', 'StatefulSet', 'DaemonSet'];

export function KubernetesIntegrationPage() {
  const [health, setHealth] = useState<KubernetesHealth | null>(null);
  const [namespaces, setNamespaces] = useState<KubernetesNamespace[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [namespace, setNamespace] = useState('');
  const [kind, setKind] = useState<KubernetesWorkloadKind | ''>('Deployment');
  const [resourceId, setResourceId] = useState('');
  const [workloads, setWorkloads] = useState<KubernetesWorkload[]>([]);
  const [result, setResult] = useState<KubernetesImportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([getKubernetesHealth(), listResources({ type: 'kubernetes_cluster' })])
      .then(async ([nextHealth, nextResources]) => {
        setHealth(nextHealth);
        setResources(nextResources);
        if (nextHealth.configured) setNamespaces(await listKubernetesNamespaces());
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load Kubernetes integration context.'))
      .finally(() => setLoading(false));
  }, []);

  async function preview() {
    setBusy(true); setError(null); setResult(null);
    try {
      setWorkloads(await listKubernetesWorkloads({ namespace: namespace || undefined, kind: kind || undefined, limit: 50 }));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to preview Kubernetes workloads.');
    } finally { setBusy(false); }
  }

  async function importState() {
    if (!resourceId) { setError('Select an existing Kubernetes resource before importing.'); return; }
    setBusy(true); setError(null);
    try {
      setResult(await importKubernetesWorkloads({ resourceId, namespace: namespace || undefined, kind: kind || undefined }));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to import Kubernetes state.');
    } finally { setBusy(false); }
  }

  return <section className="history-section kubernetes-section" id="integrations" aria-labelledby="kubernetes-title">
    <div className="history-heading"><p className="eyebrow">Phase 13 · Read-only integration</p><h2 id="kubernetes-title">Kubernetes connection</h2><p className="section-copy">Preview bounded workload state and import observations into the existing Evidence and Change pipeline. ChangeLens never mutates the cluster.</p></div>
    {loading ? <p className="empty-state">Loading Kubernetes integration...</p> : <>
      <div className="kubernetes-status" role="status"><span className={`status-badge status-badge--${health?.reachable ? 'healthy' : health?.configured ? 'unavailable' : 'pending'}`}>{health?.reachable ? 'Connected' : health?.configured ? 'Unavailable' : 'Not configured'}</span><span>{health?.message ?? 'Kubernetes status unavailable.'}</span>{health?.version ? <small>{health.version}</small> : null}</div>
      <div className="history-toolbar kubernetes-toolbar">
        <label>Namespace<select value={namespace} onChange={(event) => setNamespace(event.target.value)}><option value="">All namespaces</option>{namespaces.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
        <label>Workload kind<select value={kind} onChange={(event) => setKind(event.target.value as KubernetesWorkloadKind | '')}><option value="">All supported kinds</option>{kinds.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>ChangeLens resource<select value={resourceId} onChange={(event) => setResourceId(event.target.value)}><option value="">Select existing resource</option>{resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label>
        <button className="button button--quiet" type="button" disabled={busy || !health?.configured} onClick={() => void preview()}>Preview workloads</button>
        <Can minimum="operator"><button className="button button--primary" type="button" disabled={busy || !health?.configured || !resourceId} onClick={() => void importState()}>Import state</button></Can>
      </div>
      {error ? <div className="inline-error" role="alert"><span>{error}</span></div> : null}
      {workloads.length === 0 ? <p className="empty-state">No workload preview loaded.</p> : <div className="kubernetes-workload-list">{workloads.map((workload) => <article className="resource-card" key={`${workload.kind}:${workload.namespace}:${workload.name}`}><div className="resource-card__top"><div><p className="resource-type">{workload.kind}</p><h3>{workload.namespace}/{workload.name}</h3></div><span className="resource-status resource-status--active">Observed</span></div><div className="resource-details"><span>Desired {workload.replicas.desired ?? 'n/a'}</span><span>Ready {workload.replicas.ready ?? 'n/a'}</span><span>Available {workload.replicas.available ?? 'n/a'}</span></div><p className="resource-description">Images: {workload.images.join(', ') || 'none reported'}</p></article>)}</div>}
      {result ? <div className="success-message kubernetes-result" role="status">Imported {result.evidenceCreated} new observation(s), created {result.changesCreated} change(s), and skipped {result.evidenceAlreadyPresent} unchanged observation(s).{result.truncatedKinds.length > 0 ? ` More ${result.truncatedKinds.join(', ')} workloads exist than one import reads; narrow by namespace or kind.` : ''}</div> : null}
    </>}
  </section>;
}
