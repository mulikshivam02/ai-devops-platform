import { StatusBadge } from '../components/StatusBadge';
import { useHealth } from '../hooks/useHealth';

export function HomePage() {
  const { data, error, loading } = useHealth();
  const apiStatus = loading ? 'pending' : error ? 'unavailable' : 'healthy';
  const databaseStatus = loading ? 'pending' : data?.database === 'connected' ? 'healthy' : 'unavailable';

  return (
    <main className="page-shell">
      <section className="intro-panel">
        <p className="eyebrow">Change intelligence, grounded in evidence</p>
        <h1>See the shape of every change.</h1>
        <p className="intro-copy">
          ChangeLens is the foundation for understanding software and infrastructure changes before they reach production.
        </p>
        <div className="intro-rule" />
        <p className="phase-label">Foundation phase</p>
        <p className="phase-copy">The platform is ready for its first connected resources.</p>
      </section>

      <section className="system-panel" aria-labelledby="system-status-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">System</p>
            <h2 id="system-status-title">Connection status</h2>
          </div>
          <span className="pulse-dot" aria-hidden="true" />
        </div>
        <div className="status-list">
          <div className="status-row">
            <span>ChangeLens API</span>
            <StatusBadge label={apiStatus === 'healthy' ? 'Operational' : apiStatus === 'pending' ? 'Checking' : 'Unavailable'} tone={apiStatus} />
          </div>
          <div className="status-row">
            <span>MongoDB</span>
            <StatusBadge label={databaseStatus === 'healthy' ? 'Connected' : databaseStatus === 'pending' ? 'Checking' : 'Unavailable'} tone={databaseStatus} />
          </div>
        </div>
        {error ? <p className="error-message">{error}</p> : null}
        {data ? <p className="updated-at">Last checked {new Date(data.timestamp).toLocaleTimeString()}</p> : null}
      </section>
    </main>
  );
}
