import type { Resource, ResourceType } from '../../types/resource';

interface ResourceListProps {
  resources: Resource[];
  onEdit: (resource: Resource) => void;
  onDelete: (resource: Resource) => void;
}

const typeLabels: Record<ResourceType, string> = {
  github_repository: 'GitHub repository',
  kubernetes_cluster: 'Kubernetes cluster',
  terraform_project: 'Terraform project',
  docker_environment: 'Docker environment',
  prometheus: 'Prometheus',
  loki: 'Loki'
};

export function ResourceList({ resources, onEdit, onDelete }: ResourceListProps) {
  return <div className="resource-list">{resources.map((resource) => <article className="resource-card" key={resource.id}>
    <div className="resource-card__top"><div><p className="resource-type">{typeLabels[resource.type]}</p><h3>{resource.name}</h3></div><span className={`resource-status resource-status--${resource.status}`}>{resource.status}</span></div>
    <div className="resource-details"><span>{resource.provider || 'Provider not set'}</span><span>{resource.environment || 'Environment not set'}</span><span>{resource.enabled ? 'Enabled' : 'Disabled'}</span></div>
    {resource.description ? <p className="resource-description">{resource.description}</p> : null}
    <div className="resource-card__footer"><span>Added {new Date(resource.createdAt).toLocaleDateString()}</span><div><button className="text-button" type="button" onClick={() => onEdit(resource)}>Edit</button><button className="text-button text-button--danger" type="button" onClick={() => onDelete(resource)}>Delete</button></div></div>
  </article>)}</div>;
}