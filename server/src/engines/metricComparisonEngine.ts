import type { MetricDirection } from '../types/predictionReality.js';

export const METRIC_NOISE_THRESHOLD = 0.0001;
export function compareMetric(baseline: number, observed: number): { delta: number; direction: MetricDirection } { const delta = observed - baseline; return { delta, direction: Math.abs(delta) <= METRIC_NOISE_THRESHOLD ? 'unchanged' : delta > 0 ? 'increase' : 'decrease' }; }
export function accuracyLevel(score: number | null): 'poor' | 'low' | 'moderate' | 'good' | 'excellent' | 'insufficient_evidence' { if (score === null) return 'insufficient_evidence'; return score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 50 ? 'moderate' : score >= 25 ? 'low' : 'poor'; }