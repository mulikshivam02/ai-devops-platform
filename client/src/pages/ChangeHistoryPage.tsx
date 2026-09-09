import { useEffect, useState } from 'react';
import { listChanges, type Pagination, updateChangeStatus } from '../services/api';
import { changeStatuses, changeTypes, type Change, type ChangeFilters, type ChangeStatus, type ChangeType } from '../types/change';

const initialPagination: Pagination = { page: 1, limit: 25, total: 0, pages: 0 };

export function ChangeHistoryPage() {
  const [items, setItems] = useState<Change[]>([]);
  const [filters, setFilters] = useState<ChangeFilters>({ page: 1, limit: 25 });
  const [pagination, setPagination] = useState(initialPagination);
  const [selected, setSelected] = useState<Change | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadChanges() {
    setLoading(true);
    setError(null);
    try {
      const result = await listChanges(filters);
      setItems(result.data);
      setPagination(result.pagination);
      setSelected((current) => current ? result.data.find((item) => item.id === current.id) ?? current : null);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load change history.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadChanges(); }, [filters]);

  function setFilter<K extends keyof ChangeFilters>(key: K, value: ChangeFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  }

  async function handleStatus(change: Change, status: ChangeStatus) {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateChangeStatus(change.id, status);
      setSelected(updated);
      setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update change status.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="history-section" id="history" aria-labelledby="history-title">
    <div className="history-heading"><div><p className="eyebrow">Phase 3 · History</p><h2 id="history-title">Change History</h2><p className="section-copy">A chronological record of supplied changes. Classification is descriptive; no risk or impact is calculated here.</p></div></div>
    <div className="history-toolbar"><label>Change type<select value={filters.changeType ?? ''} onChange={(event) => setFilter('changeType', (event.target.value || undefined) as ChangeType | undefined)}><option value="">All types</option>{changeTypes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Status<select value={filters.status ?? ''} onChange={(event) => setFilter('status', (event.target.value || undefined) as ChangeStatus | undefined)}><option value="">All statuses</option>{changeStatuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Resource ID<input value={filters.resourceId ?? ''} onChange={(event) => setFilter('resourceId', event.target.value || undefined)} placeholder="Optional resource" /></label><label>Author<input value={filters.author ?? ''} onChange={(event) => setFilter('author', event.target.value || undefined)} placeholder="Optional author" /></label></div>
    {error ? <div className="inline-error" role="alert"><span>{error}</span><button className="text-button" type="button" onClick={() => void loadChanges()}>Retry</button></div> : null}
    {loading ? <p className="empty-state">Loading change history...</p> : items.length === 0 ? <p className="empty-state">No changes match the current filters.</p> : <div className="record-layout"><div className="record-list">{items.map((item) => <button className={`record-row ${selected?.id === item.id ? 'record-row--selected' : ''}`} key={item.id} type="button" onClick={() => setSelected(item)}><span><strong>{item.summary}</strong><small>{item.changeType} · {item.source} · {new Date(item.timestamp).toLocaleString()}</small></span><span className={`resource-status resource-status--${item.status}`}>{item.status}</span></button>)}</div>{selected ? <ChangeDetail change={selected} saving={saving} onStatusChange={(status) => void handleStatus(selected, status)} /> : <div className="detail-placeholder">Select a change to inspect its history record.</div>}</div>}
    {!loading && pagination.pages > 1 ? <div className="pagination-controls"><button className="button button--quiet" type="button" disabled={pagination.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: pagination.page - 1 }))}>Previous</button><span>Page {pagination.page} of {pagination.pages} · {pagination.total} records</span><button className="button button--quiet" type="button" disabled={pagination.page >= pagination.pages} onClick={() => setFilters((current) => ({ ...current, page: pagination.page + 1 }))}>Next</button></div> : null}
  </section>;
}

function ChangeDetail({ change, saving, onStatusChange }: { change: Change; saving: boolean; onStatusChange: (status: ChangeStatus) => void }) {
  return <article className="record-detail"><div className="detail-heading"><div><p className="resource-type">{change.changeType} · {change.source}</p><h3>{change.summary}</h3></div><label className="detail-status">Status<select value={change.status} disabled={saving} onChange={(event) => onStatusChange(event.target.value as ChangeStatus)}>{changeStatuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div><dl className="detail-meta"><div><dt>Change ID</dt><dd>{change.changeId}</dd></div><div><dt>Author</dt><dd>{change.author ?? 'Unknown'}</dd></div><div><dt>Timestamp</dt><dd>{new Date(change.timestamp).toLocaleString()}</dd></div><div><dt>Resource</dt><dd>{change.resourceId}</dd></div><div><dt>Evidence</dt><dd>{change.evidenceIds.length} linked record(s)</dd></div></dl>{change.before ? <><h4>Before</h4><pre>{JSON.stringify(change.before, null, 2)}</pre></> : null}{change.after ? <><h4>After</h4><pre>{JSON.stringify(change.after, null, 2)}</pre></> : null}</article>;
}