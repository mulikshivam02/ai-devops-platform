import { useEffect, useState } from 'react';
import { deleteDependency, getResourceGraph, listResources } from '../services/api';
import type { DependencyGraph, GraphEdge } from '../types/dependency';
import type { Resource } from '../types/resource';

export function DependencyGraphPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourceId, setResourceId] = useState('');
  const [depth, setDepth] = useState(2);
  const [direction, setDirection] = useState<'dependencies' | 'dependents'>('dependencies');
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    void listResources().then((items) => {
      setResources(items);
      if (items[0]) setResourceId(items[0].id);
    }).catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load resources.');
      setLoading(false);
    });
  }, [reloadToken]);

  useEffect(() => {
    if (!resourceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    void getResourceGraph(resourceId, depth, direction).then(setGraph).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Unable to load dependency graph.')).finally(() => setLoading(false));
  }, [resourceId, depth, direction]);

  async function handleDelete(edge: GraphEdge) {
    if (!window.confirm('Delete this dependency relationship?')) return;
    try {
      await deleteDependency(edge.id);
      setNotice('Dependency deleted.');
      setGraph(null);
      const refreshed = await getResourceGraph(resourceId, depth, direction);
      setGraph(refreshed);
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete dependency.');
    }
  }

  const names = new Map((graph?.nodes ?? []).map((node) => [node.id, node.name]));
  return <section className="graph-section" id="dependency-graph" aria-labelledby="dependency-graph-title">
    <div className="graph-heading"><div><p className="eyebrow">Phase 4 · Deterministic graph</p><h2 id="dependency-graph-title">Dependency Graph</h2><p className="section-copy">Relationships are explicit edges: source → target. Dependencies follow outgoing edges; dependents follow incoming edges.</p></div></div>
    <div className="graph-toolbar"><label>Resource<select value={resourceId} onChange={(event) => setResourceId(event.target.value)}><option value="">Select a resource</option>{resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label><label>Direction<select value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)}><option value="dependencies">Dependencies</option><option value="dependents">Dependents</option></select></label><label>Depth<input type="number" min="1" max="10" value={depth} onChange={(event) => setDepth(Math.min(10, Math.max(1, Number(event.target.value) || 1)))} /></label></div>
    {notice ? <p className="success-message" role="status">{notice}</p> : null}
    {error ? <div className="inline-error" role="alert"><span>{error}</span><button className="text-button" type="button" onClick={() => setReloadToken((current) => current + 1)}>Retry</button></div> : null}
    {loading ? <p className="empty-state">Loading graph...</p> : !resourceId ? <p className="empty-state">Create a resource to explore its graph.</p> : !graph || graph.nodes.length <= 1 ? <p className="empty-state">No relationships found for this resource.</p> : <div className="graph-content"><div className="graph-nodes"><h3>Nodes</h3>{graph.nodes.map((node) => <div className={`graph-node ${node.id === graph.rootResourceId ? 'graph-node--root' : ''}`} key={node.id}><strong>{node.name}</strong><small>{node.type}{node.id === graph.rootResourceId ? ' · selected' : ''}</small></div>)}</div><div className="graph-edges"><h3>Relationships</h3>{graph.edges.map((edge) => <div className="graph-edge" key={edge.id}><span>{names.get(edge.source) ?? edge.source}</span><strong>→ {edge.relationshipType} →</strong><span>{names.get(edge.target) ?? edge.target}</span><button className="text-button text-button--danger" type="button" onClick={() => void handleDelete(edge)}>Delete</button></div>)}</div></div>}
  </section>;
}