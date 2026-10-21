import { Can } from '../auth/RequireAuth';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { analyzeChangeIntelligence, evaluateChangeReality, getChangeIntelligence, listChanges } from '../services/api';
import type { Change } from '../types/change';
import type { ChangeIntelligenceResult } from '../types/changeIntelligence';

export function ChangeIntelligenceOrchestrationPage() {
  const [changes, setChanges] = useState<Change[]>([]);
  // The change in the URL (/changes/:changeId) is the selection, so every change is deep-linkable. With
  // no id in the URL (/change-intelligence) the newest change is shown, without rewriting the address.
  const { changeId: routeChangeId } = useParams();
  const navigate = useNavigate();
  const [defaultId, setDefaultId] = useState('');
  const selectedId = routeChangeId ?? defaultId;
  const [intelligence, setIntelligence] = useState<ChangeIntelligenceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listChanges({ limit: 100 }).then((result) => { setChanges(result.data); if (result.data[0]) setDefaultId(result.data[0].id); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load changes.')).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setIntelligence(null); setError(null);
    void getChangeIntelligence(selectedId).then(setIntelligence).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No intelligence has been generated for this Change yet.'));
  }, [selectedId]);

  async function run(action: 'analyze' | 'evaluate') {
    if (!selectedId) return;
    setBusy(true); setError(null);
    try { setIntelligence(await (action === 'analyze' ? analyzeChangeIntelligence(selectedId) : evaluateChangeReality(selectedId))); }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : 'Unable to run intelligence workflow.'); }
    finally { setBusy(false); }
  }

  return <section className="analysis-section orchestration-section" id="end-to-end-intelligence" aria-labelledby="orchestration-title">
    <div className="analysis-heading"><p className="eyebrow">Phase 15 · End-to-end lifecycle</p><h2 id="orchestration-title">Change Intelligence</h2><p className="section-copy">Deterministic analysis connects Change, Evidence, dependencies, risk, prediction, reality, comparison, historical learning, and optional AI reasoning.</p></div>
    {loading ? <p className="empty-state">Loading changes...</p> : <>
      <div className="analysis-toolbar"><label>Change<select value={selectedId} onChange={(event) => { if (event.target.value) navigate(`/changes/${event.target.value}`); }}><option value="">Select a Change</option>{selectedId && !changes.some((change) => change.id === selectedId) ? <option value={selectedId}>Change {selectedId}</option> : null}{changes.map((change) => <option key={change.id} value={change.id}>{change.summary}</option>)}</select></label><Can minimum="operator"><button className="button button--primary" type="button" disabled={busy || !selectedId} onClick={() => void run('analyze')}>Analyze Change</button></Can><Can minimum="operator"><button className="button button--quiet" type="button" disabled={busy || !selectedId} onClick={() => void run('evaluate')}>Evaluate Reality</button></Can><Can minimum="operator"><button className="button button--quiet" type="button" disabled={busy || !selectedId} onClick={() => void run('analyze')}>Refresh Intelligence</button></Can><a className="button button--quiet" href="#evidence">View Evidence</a></div>
      {error ? <div className="inline-error" role="alert"><span>{error}</span></div> : null}
      {!intelligence ? <p className="empty-state">Run analysis to build the consolidated intelligence view.</p> : <IntelligenceView result={intelligence} />}
    </>}
  </section>;
}

function IntelligenceView({ result }: { result: ChangeIntelligenceResult }) {
  const evidenceSources = Object.entries(result.evidenceSummary.bySource).map(([source, count]) => `${source}: ${count}`).join(' · ');
  return <div className="orchestration-detail"><article className="orchestration-card orchestration-card--wide orchestration-header"><p className="eyebrow">Change intelligence detail</p><h3>{result.change.summary}</h3><p>{result.change.changeId} · {result.change.source} · {result.change.changeType} · {result.resource.name} · {result.change.status}</p><div className="orchestration-facts"><span>{new Date(result.change.timestamp).toLocaleString()}</span><span>{result.evidenceSummary.total} evidence record(s)</span><span>{evidenceSources || 'No evidence'}</span></div></article><section className="orchestration-section-block" aria-labelledby="impact-detail-title"><h3 id="impact-detail-title">Impact and risk</h3><div className="orchestration-grid"><article className="orchestration-card"><p className="eyebrow">Risk</p><h3>{result.risk ? `${result.risk.level} · ${result.risk.score}/100` : 'Not analyzed'}</h3><p>Deterministic risk from change characteristics, dependencies, rollback, and security findings.</p></article><article className="orchestration-card"><p className="eyebrow">Blast radius</p><h3>{result.dependencyImpact?.blastRadius.totalCount ?? 0} resource(s)</h3><p>{result.dependencyImpact?.blastRadius.transitiveCount ?? 0} indirect resource(s). Dependency impact is potential, not causal.</p></article></div></section><section className="orchestration-section-block" aria-labelledby="prediction-detail-title"><h3 id="prediction-detail-title">PREDICTED</h3><div className="orchestration-grid"><article className="orchestration-card orchestration-card--wide"><h3>{result.prediction?.predictedImpact.summary ?? 'No prediction snapshot.'}</h3><p>{result.prediction ? `Version ${result.prediction.predictionVersion} · generated ${new Date(result.prediction.predictedAt).toLocaleString()}` : 'Analyze this Change to generate a prediction.'}</p></article></div></section><section className="orchestration-section-block" aria-labelledby="observed-detail-title"><h3 id="observed-detail-title">OBSERVED</h3><div className="orchestration-grid"><article className="orchestration-card"><h3>{result.reality?.status ?? 'Not evaluated'}</h3><p>{result.reality?.observedImpact.summary ?? 'No reality observation.'}</p></article><article className="orchestration-card"><h3>{result.predictionVsReality?.outcome?.replaceAll('_', ' ') ?? 'Not compared'}</h3><p>{result.predictionVsReality?.summary ?? 'No comparison available.'}</p></article></div></section><section className="orchestration-section-block" aria-labelledby="ai-detail-title"><h3 id="ai-detail-title">AI INVESTIGATION</h3><div className="orchestration-card orchestration-card--wide"><h3>{result.aiInvestigation.status}</h3><p>{typeof result.aiInvestigation.data?.summary === 'string' ? result.aiInvestigation.data.summary : 'AI investigation unavailable. Deterministic evidence and analysis are still available.'}</p><p className="detail-note">AI output is inference support, not operational fact.</p></div></section><section className="orchestration-section-block" aria-labelledby="timeline-title"><h3 id="timeline-title">Timeline</h3><ol className="intelligence-timeline"><li><strong>Change detected</strong><time>{new Date(result.change.timestamp).toLocaleString()}</time></li><li><strong>Evidence collected</strong><time>{result.evidenceSummary.total ? 'Available' : 'Unavailable'}</time></li><li><strong>Impact analyzed</strong><time>{result.analysis ? new Date(result.analysis.analyzedAt).toLocaleString() : 'Unavailable'}</time></li><li><strong>Prediction generated</strong><time>{result.prediction ? new Date(result.prediction.predictedAt).toLocaleString() : 'Unavailable'}</time></li><li><strong>Reality evaluated</strong><time>{result.reality ? new Date(result.reality.createdAt).toLocaleString() : 'Unavailable'}</time></li><li><strong>Compared with reality</strong><time>{result.predictionVsReality ? new Date(result.predictionVsReality.comparedAt).toLocaleString() : 'Unavailable'}</time></li></ol></section><section className="orchestration-section-block" aria-labelledby="learning-title"><h3 id="learning-title">Historical learning and recommendation</h3><div className="orchestration-card orchestration-card--wide"><h3>{result.historicalOutcome ? `${result.historicalOutcome.outcome.replaceAll('_', ' ')} · ${result.historicalOutcome.accuracy.overall === null ? 'N/A' : `${result.historicalOutcome.accuracy.overall}%`} accuracy` : result.historicalLearning.status}</h3><p>{result.historicalLearning.similarChanges.length} similar change(s), {result.historicalLearning.patterns.length} pattern(s). Evidence quality: {result.historicalOutcome?.evidenceQuality ?? 'insufficient'}.</p>{(result.historicalLearning.lookupErrors?.length ?? 0) > 0 && <p className="detail-note" role="alert">Some history lookups failed ({result.historicalLearning.lookupErrors?.join(', ')}). Missing sections are unknown, not empty.</p>}<p className="detail-note">RECOMMENDATION · Review supporting evidence and follow the existing approval-controlled remediation workflow. No action is executed here.</p></div></section></div>;
}
