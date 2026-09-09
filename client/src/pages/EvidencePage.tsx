import { useEffect, useState } from 'react';
import { deleteEvidence, listEvidence, type Pagination } from '../services/api';
import { evidenceSources, evidenceTypes, type Evidence, type EvidenceFilters, type EvidenceSource, type EvidenceType } from '../types/evidence';

const initialPagination: Pagination = { page: 1, limit: 25, total: 0, pages: 0 };

export function EvidencePage() {
  const [items, setItems] = useState<Evidence[]>([]);
  const [filters, setFilters] = useState<EvidenceFilters>({ page: 1, limit: 25 });
  const [pagination, setPagination] = useState(initialPagination);
  const [selected, setSelected] = useState<Evidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadEvidence() {
    setLoading(true);
    setError(null);
    try {
      const result = await listEvidence(filters);
      setItems(result.data);
      setPagination(result.pagination);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load evidence.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadEvidence(); }, [filters]);

  async function handleDelete(item: Evidence) {
    if (!window.confirm('Delete this evidence record? This cannot be undone.')) return;
    try {
      await deleteEvidence(item.id);
      setSelected(null);
      setNotice('Evidence deleted.');
      await loadEvidence();
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete evidence.');
    }
  }

  function setFilter<K extends keyof EvidenceFilters>(key: K, value: EvidenceFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  }

  return <section className="history-section" id="evidence" aria-labelledby="evidence-title">
    <div className="history-heading"><div><p className="eyebrow">Phase 3 · Evidence</p><h2 id="evidence-title">Evidence Engine</h2><p className="section-copy">Recorded observations stay traceable to their source, timestamp, and optional resource.</p></div></div>
    <div className="history-toolbar"><label>Type<select value={filters.evidenceType ?? ''} onChange={(event) => setFilter('evidenceType', (event.target.value || undefined) as EvidenceType | undefined)}><option value="">All types</option>{evidenceTypes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Source<select value={filters.source ?? ''} onChange={(event) => setFilter('source', (event.target.value || undefined) as EvidenceSource | undefined)}><option value="">All sources</option>{evidenceSources.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Resource ID<input value={filters.resourceId ?? ''} onChange={(event) => setFilter('resourceId', event.target.value || undefined)} placeholder="Optional resource" /></label><label>Correlation ID<input value={filters.correlationId ?? ''} onChange={(event) => setFilter('correlationId', event.target.value || undefined)} placeholder="Optional correlation" /></label></div>
    {notice ? <p className="success-message" role="status">{notice}</p> : null}
    {error ? <div className="inline-error" role="alert"><span>{error}</span><button className="text-button" type="button" onClick={() => void loadEvidence()}>Retry</button></div> : null}
    {loading ? <p className="empty-state">Loading evidence...</p> : items.length === 0 ? <p className="empty-state">No evidence matches the current filters.</p> : <div className="record-layout"><div className="record-list">{items.map((item) => <button className={`record-row ${selected?.id === item.id ? 'record-row--selected' : ''}`} key={item.id} type="button" onClick={() => setSelected(item)}><span><strong>{item.evidenceType}</strong><small>{item.source} · {new Date(item.timestamp).toLocaleString()}</small></span><small>{item.resourceId ? `Resource ${item.resourceId}` : 'Unattached'}</small></button>)}</div>{selected ? <EvidenceDetail item={selected} onDelete={() => void handleDelete(selected)} /> : <div className="detail-placeholder">Select evidence to inspect its structured payload.</div>}</div>}
    {!loading && pagination.pages > 1 ? <PaginationControls pagination={pagination} onPageChange={(page) => setFilters((current) => ({ ...current, page }))} /> : null}
  </section>;
}

function EvidenceDetail({ item, onDelete }: { item: Evidence; onDelete: () => void }) {
  return <article className="record-detail"><div className="detail-heading"><div><p className="resource-type">{item.source}</p><h3>{item.evidenceType}</h3></div><button className="text-button text-button--danger" type="button" onClick={onDelete}>Delete</button></div><dl className="detail-meta"><div><dt>Observed</dt><dd>{new Date(item.timestamp).toLocaleString()}</dd></div><div><dt>Collected</dt><dd>{new Date(item.collectedAt).toLocaleString()}</dd></div><div><dt>Resource</dt><dd>{item.resourceId ?? 'None'}</dd></div><div><dt>Correlation</dt><dd>{item.correlationId ?? 'None'}</dd></div></dl><h4>Payload</h4><pre>{JSON.stringify(item.payload, null, 2)}</pre><h4>Metadata</h4><pre>{JSON.stringify(item.metadata, null, 2)}</pre></article>;
}

function PaginationControls({ pagination, onPageChange }: { pagination: Pagination; onPageChange: (page: number) => void }) {
  return <div className="pagination-controls"><button className="button button--quiet" type="button" disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)}>Previous</button><span>Page {pagination.page} of {pagination.pages} · {pagination.total} records</span><button className="button button--quiet" type="button" disabled={pagination.page >= pagination.pages} onClick={() => onPageChange(pagination.page + 1)}>Next</button></div>;
}