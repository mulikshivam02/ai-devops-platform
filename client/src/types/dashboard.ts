export interface DashboardSummary {
  changeCounts: { total: number; analyzed: number; highCriticalRisk: number; investigated: number; unexpectedImpact: number; insufficientEvidence: number };
  riskDistribution: { low: number; medium: number; high: number; critical: number };
  recentChanges: Array<{ id: string; changeId: string; summary: string; source: string; resourceId: string; resourceName?: string; changeType: string; status: string; timestamp: string; risk?: { score: number; level: string }; predictionStatus: 'available' | 'unavailable'; realityStatus: string; outcome?: string }>;
  recentOutcomes: Array<{ changeId: string; summary: string; outcome: string; timestamp: string }>;
  integrationStatus: { github: 'configured' | 'not_configured'; kubernetes: { configured: boolean; reachable: boolean; message: string }; prometheus: { configured: boolean; reachable: boolean; message: string }; loki: { configured: boolean; reachable: boolean; message: string } };
  aiStatus: { available: boolean; provider: string; model: string; message: string };
}
