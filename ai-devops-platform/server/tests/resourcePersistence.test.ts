import { Types } from 'mongoose';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ResourceModel } from '../src/models/Resource.js';

/**
 * Review 2.4/2.5/3.9. A resource delete used to be a hard `findByIdAndDelete`,
 * orphaning every Change, Evidence, Dependency, SecurityFinding and Remediation
 * that still referenced it by ObjectId. It's now a soft delete: the document
 * stays, hidden from normal listings but still resolvable by direct id.
 *
 * Also fixes the unique index on (name, type, environment): previously a missing
 * environment indexed as null, so two unrelated resources that both happened not
 * to set one could collide; and a soft-deleted resource's name/type/environment
 * stayed permanently unavailable for reuse.
 */
describe('resource unique index (review 2.5)', () => {
  it('is scoped to non-deleted resources with an environment set', () => {
    const definitions = ResourceModel.schema.indexes();
    const nameTypeEnv = definitions.find(([spec]) => 'name' in spec && 'type' in spec && 'environment' in spec);
    expect(nameTypeEnv).toBeDefined();
    const [, options] = nameTypeEnv!;
    expect(options.unique).toBe(true);
    expect(options.partialFilterExpression).toEqual({ deletedAt: null, environment: { $exists: true } });
  });
});

describe('resource soft delete (review 2.4/3.9)', () => {
  const resourceId = new Types.ObjectId().toString();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('deleteResource sets deletedAt instead of removing the document', async () => {
    const updateSpy = vi.spyOn(ResourceModel, 'findOneAndUpdate').mockResolvedValue({ _id: resourceId });
    const deleteSpy = vi.spyOn(ResourceModel, 'findByIdAndDelete');

    const { deleteResource } = await import('../src/services/resourceService.js');
    await deleteResource(resourceId);

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(updateSpy).toHaveBeenCalledWith(
      { _id: resourceId, deletedAt: null },
      expect.objectContaining({ deletedAt: expect.any(Date), enabled: false })
    );
  });

  it('deleting an already-deleted resource is a 404, not a silent success', async () => {
    // The {_id, deletedAt: null} filter matches nothing for an already-deleted
    // resource, so findOneAndUpdate correctly returns null here.
    vi.spyOn(ResourceModel, 'findOneAndUpdate').mockResolvedValue(null);

    const { deleteResource } = await import('../src/services/resourceService.js');
    await expect(deleteResource(resourceId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('getResources excludes soft-deleted resources by default', async () => {
    const findSpy = vi.spyOn(ResourceModel, 'find').mockReturnValue({
      sort: vi.fn().mockResolvedValue([])
    });

    const { getResources } = await import('../src/services/resourceService.js');
    await getResources({});

    expect(findSpy).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: null }));
  });

  it('getResourceById can still resolve a soft-deleted resource (history/audit views need this)', async () => {
    vi.spyOn(ResourceModel, 'findById').mockResolvedValue({
      _id: resourceId,
      name: 'r',
      type: 'github_repository',
      status: 'inactive',
      metadata: {},
      enabled: false,
      deletedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const { getResourceById } = await import('../src/services/resourceService.js');
    const result = await getResourceById(resourceId);
    expect(result.deletedAt).toBeDefined();
  });
});
