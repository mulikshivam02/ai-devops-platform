import { useEffect, useState } from 'react';
import { analyzeChange, getChangeAnalysis, listChanges } from '../services/api';
import type { Change } from '../types/change';
import type { ChangeAnalysis } from '../types/changeAnalysis';

export function ChangeIntelligencePage() {
  const [changes, setChanges] = useState<Change[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [analysis, setAnalysis] = useState<ChangeAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void listChanges({ limit: 100 }).then((result) => {
      setChanges(result.data);
      if (result.data[0]) setSelectedId(result.data[0].id);
    }).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Unable to load changes.')).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setAnalysis(null);
    void getChangeAnalysis(selectedId).then(setAnalysis).catch(() => undefined);
  }, [selectedId]);

  async function handleAnalyze() {
    if (!selectedId) return;
    setAnalyzing(true);
    setError(null);
    try {
      setAnalysis(await analyzeChange(selectedId));
      setNotice('Change analysis completed.');
    } catch (analysisError: unknown) {
      setError(analysisError instanceof Error ? analysisError.message : 'Unable to analyze change.');
    } finally {
      setAnalyzing(false);
    }
  }

  const selected = changes.find((change) => change.id === selectedId);
  return <section className="analysis-section" id="change-intelligence" aria-labelledby="change-intelligence-title">
    <div className="analysis-heading"><div><p className="eyebrow">Phase 5 · Deterministic analysis</p><h2 id="change-intelligence-title">Change Intelligence</h2><p className="section-copy">Analyze recorded changes using explicit data and dependency relationships. No AI or live integrations are involved.</p></div></div>
    {loading ? <p className="empty-state">Loading changes...</p> : changes.length === 0 ? <p className="empty-state">No changes are available to analyze.</p> : <><div className="analysis-toolbar"><label>Change<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{changes.map((change) => <option key={change.id} value={change.id}>{change.summary}</option>)}</select></label><button className="button button--primary" type="button" disabled={analyzing} onClick={() => void handleAnalyze()}>{analyzing ? 'Analyzing...' : analysis ? 'Re-analyze change' : 'Analyze change'}</button></div>{notice ? <p className="success-message" role="status">{notice}</p> : null}{error ? <div className="inline-error" role="alert"><span>{error}</span><button className="text-button" type="button" onClick={() => void handleAnalyze()}>Retry</button></div> : null}{selected ? <div className="change-context"><strong>{selected.summary}</strong><span>{selected.changeType} · {selected.source} · Resource {selected.resourceId}</span></div> : null}{analysis ? <AnalysisDetail analysis={analysis} /> : <p className="empty-state">Analyze the selected change to view deterministic impact and risk.</p>}</>}
  </section>;
}

function AnalysisDetail({ analysis }: { analysis: ChangeAnalysis }) {
  return <div className="analysis-detail"><div className="analysis-summary"><div><span className="analysis-score">{analysis.risk.score}</span><span className={`resource-status resource-status--${analysis.risk.level}`}>{analysis.risk.level}</span><small>Deterministic risk score</small></div><div><strong>{analysis.blastRadius.totalCount}</strong><small>Total affected resources</small></div><div><strong>{analysis.blastRadius.maxDependencyDepth}</strong><small>Maximum dependency depth</small></div><div><strong>{analysis.rollback.available ? 'Available' : 'Unavailable'}</strong><small>Rollback</small></div></div><div className="analysis-grid"><article><h3>Changed items</h3>{analysis.changedItems.map((item, index) => <div className="analysis-item" key={`${item.path}-${index}`}><strong>{item.path}</strong><span>{item.operation} · {item.itemType}</span></div>)}</article><article><h3>Affected resources</h3><p>Direct: {analysis.directlyAffectedResourceIds.join(', ')}</p><p>Transitive: {analysis.transitivelyAffectedResourceIds.join(', ') || 'None'}</p></article><article><h3>Risk factors</h3>{analysis.risk.factors.map((factor) => <div className="risk-factor" key={factor.name}><strong>{factor.name} <span>{factor.contribution > 0 ? '+' : ''}{factor.contribution}</span></strong><small>{factor.reason}</small></div>)}</article><article><h3>Impact and rollback</h3><p><strong>Categories:</strong> {analysis.impact.categories.join(', ') || 'None derived'}</p><p>{analysis.impact.summary}</p><p><strong>{analysis.rollback.available ? 'Rollback available' : 'Rollback unavailable'}:</strong> {analysis.rollback.description}</p><p><strong>Evidence:</strong> {analysis.evidenceIds.join(', ') || 'None referenced'}</p></article></div><p className="analysis-timestamp">Analyzed {new Date(analysis.analyzedAt).toLocaleString()} · Version {analysis.analysisVersion}</p></div>;
}