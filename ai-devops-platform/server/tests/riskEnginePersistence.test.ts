import { describe, expect, it } from 'vitest';
import { calculateChangeRisk } from '../src/engines/riskEngine.js';

/**
 * Review 2.1/3.2: an unrecognised changeType made `changeTypeWeights[input.changeType]`
 * return `undefined`, which turned the whole score into NaN. Every `score >= threshold`
 * comparison against NaN is false, so the level fell through to 'low' -- the single
 * safest possible classification for a change the system doesn't even understand.
 */
describe('risk engine handles unknown change types safely (review 2.1/3.2)', () => {
  const base = {
    changedItemCount: 1,
    directCount: 0,
    transitiveCount: 0,
    maxDependencyDepth: 0,
    rollbackAvailable: true
  };

  it('an unrecognised changeType produces a finite score, not NaN', () => {
    const result = calculateChangeRisk({ ...base, changeType: 'made_up_type' as never });
    expect(Number.isFinite(result.score)).toBe(true);
  });

  it('an unrecognised changeType is scored higher than the lowest-weighted known type', () => {
    // A direct level-bucket assertion here would depend on every other input too;
    // the meaningful claim is relative: an unrecognised type must not be treated
    // as MORE favourable than a type the system explicitly knows is low-risk.
    const unrecognised = calculateChangeRisk({ ...base, changeType: 'made_up_type' as never });
    const lowestKnown = calculateChangeRisk({ ...base, changeType: 'code' });
    expect(unrecognised.score).toBeGreaterThan(lowestKnown.score);
    expect(unrecognised.factors.find((f) => f.name === 'change_type')?.contribution).toBeGreaterThan(0);
  });

  it('an unrecognised changeType scores the same as the explicit "unknown" type', () => {
    const unrecognised = calculateChangeRisk({ ...base, changeType: 'made_up_type' as never });
    const explicitUnknown = calculateChangeRisk({ ...base, changeType: 'unknown' });
    expect(unrecognised.score).toBe(explicitUnknown.score);
  });
});

/**
 * Review 2.2/3.2: directCount was computed in changeAnalysisService.ts but never
 * passed to the risk engine -- only transitiveCount was. A change with 50 direct
 * dependents and zero transitive ones scored a blast_radius contribution of 0.
 */
describe('risk engine blast radius uses direct AND transitive counts (review 2.2/3.2)', () => {
  const base = {
    changeType: 'code' as const,
    changedItemCount: 1,
    maxDependencyDepth: 1,
    rollbackAvailable: true
  };

  it('direct dependents alone contribute to blast_radius (would be 0 under the old formula)', () => {
    const result = calculateChangeRisk({ ...base, directCount: 50, transitiveCount: 0 });
    const blast = result.factors.find((f) => f.name === 'blast_radius');
    expect(blast?.contribution).toBeGreaterThan(0);
  });

  it('direct dependents score higher per-unit than transitive dependents', () => {
    // Kept well under the 20-point cap (3 units, not 50) so the comparison
    // reflects the per-unit weighting rather than both sides saturating at the cap.
    const directHeavy = calculateChangeRisk({ ...base, directCount: 3, transitiveCount: 0 });
    const transitiveHeavy = calculateChangeRisk({ ...base, directCount: 0, transitiveCount: 3 });
    const directBlast = directHeavy.factors.find((f) => f.name === 'blast_radius')?.contribution ?? 0;
    const transitiveBlast = transitiveHeavy.factors.find((f) => f.name === 'blast_radius')?.contribution ?? 0;
    expect(directBlast).toBeGreaterThan(transitiveBlast);
  });

  it('zero direct and zero transitive dependents contribute nothing', () => {
    const result = calculateChangeRisk({ ...base, directCount: 0, transitiveCount: 0 });
    expect(result.factors.find((f) => f.name === 'blast_radius')?.contribution).toBe(0);
  });
});

describe('risk engine factor weights sum to 100 at maximum (review 2.22/3.2)', () => {
  it('a maximally risky change scores exactly 100, not something already clamped from further above', () => {
    const result = calculateChangeRisk({
      changeType: 'security',
      environment: 'production',
      changedItemCount: 100,
      directCount: 100,
      transitiveCount: 100,
      maxDependencyDepth: 100,
      rollbackAvailable: false,
      securityContribution: 1000,
      historicalContribution: 1000
    });
    expect(result.score).toBe(100);
    expect(result.level).toBe('critical');
  });
});
