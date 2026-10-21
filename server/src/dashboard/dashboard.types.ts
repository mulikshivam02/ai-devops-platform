export interface DashboardSummary {
  /**
   * Every figure is a count over ALL stored records, not over the recent-items window shown below.
   * Analyses and comparisons are counted once per change (the latest), because both are versioned.
   */
  changeCounts: {
    /** All changes. */
    total: number;
    /** Changes with at least one analysis. `riskDistribution` sums to this, not to `total`. */
    analyzed: number;
    /** Changes whose latest analysis is high or critical. */
    highCriticalRisk: number;
    /** Changes with at least one completed AI investigation. (Was `underInvestigation`, which it never meant.) */
    investigated: number;
    /** Changes whose latest comparison outcome is `unexpected_impact`. */
    unexpectedImpact: number;
    /** Changes whose latest comparison outcome is `insufficient_evidence`. */
    insufficientEvidence: number;
  };
  riskDistribution: Record<'low' | 'medium' | 'high' | 'critical', number>;
  recentChanges: Array<{
    id: string;
    changeId: string;
    summary: string;
    source: string;
    resourceId: string;
    resourceName?: string;
    changeType: string;
    status: string;
    timestamp: string;
    risk?: { score: number; level: string };
    predictionStatus: 'available' | 'unavailable';
    realityStatus: string;
    outcome?: string;
  }>;
  recentOutcomes: Array<{ changeId: string; summary: string; outcome: string; timestamp: string }>;
  integrationStatus: {
    github: 'configured' | 'not_configured';
    kubernetes: { configured: boolean; reachable: boolean; message: string };
    prometheus: { configured: boolean; reachable: boolean; message: string };
    loki: { configured: boolean; reachable: boolean; message: string };
  };
  aiStatus: { available: boolean; provider: string; model: string; message: string };
}
