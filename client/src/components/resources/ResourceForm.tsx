import { useState, type FormEvent } from 'react';
import { resourceStatuses, resourceTypes, type Resource, type ResourceInput, type ResourceStatus, type ResourceType } from '../../types/resource';

interface ResourceFormProps {
  resource?: Resource;
  busy: boolean;
  onSubmit: (input: ResourceInput) => Promise<void>;
  onCancel: () => void;
}

const labels: Record<ResourceType, string> = {
  github_repository: 'GitHub repository',
  kubernetes_cluster: 'Kubernetes cluster',
  terraform_project: 'Terraform project',
  docker_environment: 'Docker environment',
  prometheus: 'Prometheus',
  loki: 'Loki'
};

export function ResourceForm({ resource, busy, onSubmit, onCancel }: ResourceFormProps) {
  const [name, setName] = useState(resource?.name ?? '');
  const [type, setType] = useState<ResourceType>(resource?.type ?? 'github_repository');
  const [provider, setProvider] = useState(resource?.provider ?? '');
  const [environment, setEnvironment] = useState(resource?.environment ?? '');
  const [status, setStatus] = useState<ResourceStatus>(resource?.status ?? 'unknown');
  const [description, setDescription] = useState(resource?.description ?? '');
  const [enabled, setEnabled] = useState(resource?.enabled ?? true);
  const [validationError, setValidationError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setValidationError('Name is required.');
      return;
    }
    setValidationError(null);
    await onSubmit({ name: name.trim(), type, provider: provider.trim() || undefined, environment: environment.trim() || undefined, status, description: description.trim() || undefined, enabled });
  }

  return (
    <form className="resource-form" onSubmit={(event) => void handleSubmit(event)}>
      <div className="form-heading"><div><p className="eyebrow">{resource ? 'Edit inventory' : 'New inventory'}</p><h3>{resource ? 'Update resource' : 'Add a resource'}</h3></div></div>
      <label>Name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required /></label>
      <label>Type<select value={type} onChange={(event) => setType(event.target.value as ResourceType)}>{resourceTypes.map((value) => <option key={value} value={value}>{labels[value]}</option>)}</select></label>
      <div className="form-grid">
        <label>Provider<input value={provider} onChange={(event) => setProvider(event.target.value)} maxLength={80} placeholder="e.g. local" /></label>
        <label>Environment<input value={environment} onChange={(event) => setEnvironment(event.target.value)} maxLength={80} placeholder="e.g. development" /></label>
      </div>
      <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as ResourceStatus)}>{resourceStatuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={3} /></label>
      <label className="checkbox-label"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Resource enabled</label>
      {validationError ? <p className="form-error">{validationError}</p> : null}
      <div className="form-actions"><button className="button button--quiet" type="button" onClick={onCancel}>Cancel</button><button className="button button--primary" type="submit" disabled={busy}>{busy ? 'Saving...' : resource ? 'Save changes' : 'Create resource'}</button></div>
    </form>
  );
}