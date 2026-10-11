import { useEffect, useState } from 'react';
import { createResource, deleteResource, listResources, updateResource } from '../services/api';
import { ResourceForm } from '../components/resources/ResourceForm';
import { ResourceList } from '../components/resources/ResourceList';
import { resourceStatuses, resourceTypes, type Resource, type ResourceFilters, type ResourceInput, type ResourceStatus, type ResourceType } from '../types/resource';

export function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [filters, setFilters] = useState<ResourceFilters>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function loadResources() {
    setLoading(true);
    setError(null);
    try {
      setResources(await listResources(filters));
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load resources.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadResources(); }, [filters]);

  async function handleSubmit(input: ResourceInput) {
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await updateResource(editing.id, input);
        setNotice('Resource updated.');
      } else {
        await createResource(input);
        setNotice('Resource created.');
      }
      setEditing(null);
      setShowForm(false);
      await loadResources();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save resource.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(resource: Resource) {
    if (!window.confirm(`Delete ${resource.name}? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteResource(resource.id);
      setNotice('Resource deleted.');
      await loadResources();
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete resource.');
    }
  }

  function beginCreate() { setEditing(null); setShowForm(true); setNotice(null); }
  function beginEdit(resource: Resource) { setEditing(resource); setShowForm(true); setNotice(null); }

  return <section className="resources-section" id="resources" aria-labelledby="resources-title">
    <div className="resources-heading"><div><p className="eyebrow">Phase 2 · Inventory</p><h2 id="resources-title">Resource Center</h2><p className="section-copy">A normalized inventory of the DevOps resources ChangeLens knows about. Manual records stay explicit until real integrations are introduced.</p></div><button className="button button--primary" type="button" onClick={beginCreate}>+ Add resource</button></div>
    <div className="resource-toolbar"><label>Type<select value={filters.type ?? ''} onChange={(event) => setFilters((current) => ({ ...current, type: (event.target.value || undefined) as ResourceType | undefined }))}><option value="">All types</option>{resourceTypes.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label><label>Status<select value={filters.status ?? ''} onChange={(event) => setFilters((current) => ({ ...current, status: (event.target.value || undefined) as ResourceStatus | undefined }))}><option value="">All statuses</option>{resourceStatuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Environment<input value={filters.environment ?? ''} onChange={(event) => setFilters((current) => ({ ...current, environment: event.target.value || undefined }))} placeholder="Any environment" /></label><label className="toolbar-checkbox"><input type="checkbox" checked={filters.enabled === true} onChange={(event) => setFilters((current) => ({ ...current, enabled: event.target.checked ? true : undefined }))} /> Enabled only</label></div>
    {notice ? <p className="success-message" role="status">{notice}</p> : null}
    {error ? <div className="inline-error" role="alert"><span>{error}</span><button className="text-button" type="button" onClick={() => void loadResources()}>Retry</button></div> : null}
    {showForm ? <ResourceForm resource={editing ?? undefined} busy={busy} onSubmit={handleSubmit} onCancel={() => { setShowForm(false); setEditing(null); }} /> : null}
    {loading ? <p className="empty-state">Loading resources...</p> : resources.length === 0 ? <div className="empty-state"><h3>No resources yet</h3><p>Start the inventory with a manually recorded resource.</p><button className="button button--primary" type="button" onClick={beginCreate}>Create the first resource</button></div> : <ResourceList resources={resources} onEdit={beginEdit} onDelete={(resource) => void handleDelete(resource)} />}
  </section>;
}