import { useEffect, useState } from 'react';
import { getDashboardSummary } from '../services/api';
import type { DashboardSummary } from '../types/dashboard';

const emptyDistribution = { low: 0, medium: 0, high: 0, critical: 0 };

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try { setSummary(await getDashboardSummary()); }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : 'Unable to load dashboard summary.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  return <main className="dashboard-shell" id="dashboard" aria-labelledby="dashboard-title">
    <section className="dashboard-hero"><div><p className="eyebrow">ChangeLens · Operations</p><h1 id="dashboard-title">Change intelligence, in one view.</h1><p className="intro-copy">A bounded operational view from detected changes through prediction, observation, reality, and evidence-backed investigation.</p></div><button className="button button--quiet dashboard-refresh" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh dashboard'}</button></section>
    {loading ? <p className="empty-state">Loading dashboard summary...</p> : error ? <div className="inline-error" role="alert"><span>{error}</span><button className="text-button" type="button" onClick={() => void load()}>Retry</button></div> : summary ? <DashboardContent summary={summary} /> : <p className="empty-state">No dashboard data available.</p>}
  </main>;
}

function DashboardContent({ summary }: { summary: DashboardSummary }) {
  const cards = [['Total changes', summary.changeCounts.total, 'dashboard-number'], ['High / critical risk', summary.changeCounts.highCriticalRisk, 'dashboard-number dashboard-number--alert'], ['Under investigation', summary.changeCounts.underInvestigation, 'dashboard-number'], ['Unexpected impact', summary.changeCounts.unexpectedImpact, 'dashboard-number dashboard-number--alert'], ['Insufficient evidence', summary.changeCounts.insufficientEvidence, 'dashboard-number']];
  return <>
    <section className="dashboard-section" aria-labelledby="health-title"><div className="dashboard-section-heading"><div><p className="eyebrow">Signal health</p><h2 id="health-title">Change health summary</h2></div></div><div className="dashboard-stat-grid">{cards.map(([label, value, className]) => <article className="dashboard-stat" key={String(label)}><span>{label}</span><strong className={String(className)}>{value}</strong></article>)}</div></section>
    <div className="dashboard-columns"><section className="dashboard-section" aria-labelledby="recent-title"><div className="dashboard-section-heading"><div><p className="eyebrow">Live record</p><h2 id="recent-title">Recent changes</h2></div><a className="text-button" href="#changes">Explore all</a></div>{summary.recentChanges.length === 0 ? <p className="empty-state">No changes found.</p> : <div className="dashboard-change-list">{summary.recentChanges.map((change) => <button className="dashboard-change-row" key={change.id} type="button" onClick={() => selectChange(change.id)}><span className="dashboard-change-main"><strong>{change.summary}</strong><small>{change.resourceName ?? change.resourceId} · {change.source} · {change.changeType}</small></span><span className="dashboard-change-meta"><span className={`risk-chip risk-chip--${change.risk?.level ?? 'unknown'}`}>{change.risk ? `${change.risk.level} ${change.risk.score}` : 'unscored'}</span><small>{change.outcome ?? change.realityStatus}</small><time dateTime={change.timestamp}>{new Date(change.timestamp).toLocaleString()}</time></span></button>)}</div>}</section>
      <section className="dashboard-section" aria-labelledby="risk-title"><div className="dashboard-section-heading"><div><p className="eyebrow">Deterministic engine</p><h2 id="risk-title">Risk distribution</h2></div></div><RiskDistribution distribution={summary.riskDistribution} /></section></div>
    <div className="dashboard-columns"><section className="dashboard-section" aria-labelledby="status-title"><div className="dashboard-section-heading"><div><p className="eyebrow">Connectivity</p><h2 id="status-title">Intelligence status</h2></div></div><div className="integration-status-list"><IntegrationStatus label="AI investigation" state={summary.aiStatus.available ? 'Connected' : 'Unavailable'} detail={summary.aiStatus.message} /><IntegrationStatus label="GitHub" state={summary.integrationStatus.github === 'configured' ? 'Configured' : 'Not configured'} detail="Read-only source adapter" /><IntegrationStatus label="Kubernetes" state={integrationState(summary.integrationStatus.kubernetes)} detail={summary.integrationStatus.kubernetes.message} /><IntegrationStatus label="Prometheus" state={integrationState(summary.integrationStatus.prometheus)} detail={summary.integrationStatus.prometheus.message} /><IntegrationStatus label="Loki" state={integrationState(summary.integrationStatus.loki)} detail={summary.integrationStatus.loki.message} /></div></section><section className="dashboard-section" aria-labelledby="outcomes-title"><div className="dashboard-section-heading"><div><p className="eyebrow">Prediction reality</p><h2 id="outcomes-title">Recent outcomes</h2></div></div>{summary.recentOutcomes.length === 0 ? <p className="empty-state">No prediction outcomes available.</p> : <div className="outcome-list">{summary.recentOutcomes.map((item) => <button className="outcome-row" type="button" key={`${item.changeId}-${item.timestamp}`} onClick={() => selectChange(item.changeId)}><span><strong>{formatOutcome(item.outcome)}</strong><small>{item.summary}</small></span><time dateTime={item.timestamp}>{new Date(item.timestamp).toLocaleDateString()}</time></button>)}</div>}</section></div>
  </>;
}

function RiskDistribution({ distribution }: { distribution: DashboardSummary['riskDistribution'] }) { const total = Object.values(distribution).reduce((sum, value) => sum + value, 0) || 1; return <div className="risk-distribution">{(['low', 'medium', 'high', 'critical'] as const).map((level) => <div className="risk-bar-row" key={level}><span>{level}</span><div className="risk-bar-track"><span className={`risk-bar risk-bar--${level}`} style={{ width: `${Math.max(distribution[level] / total * 100, distribution[level] ? 4 : 0)}%` }} /></div><strong>{distribution[level]}</strong></div>)}</div>; }
function IntegrationStatus({ label, state, detail }: { label: string; state: string; detail: string }) { const good = state === 'Connected' || state === 'Configured'; return <div className="integration-status-row"><span className={`status-indicator ${good ? 'status-indicator--good' : ''}`} aria-hidden="true" /><span><strong>{label}</strong><small>{detail}</small></span><b>{state}</b></div>; }
function integrationState(status: { configured: boolean; reachable: boolean }): string { return status.reachable ? 'Connected' : status.configured ? 'Unavailable' : 'Not configured'; }
function formatOutcome(value: string): string { return value.replaceAll('_', ' '); }
function selectChange(changeId: string) { window.dispatchEvent(new CustomEvent('changelens-select-change', { detail: { changeId } })); window.location.hash = 'end-to-end-intelligence'; }
