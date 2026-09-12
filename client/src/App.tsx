import { HomePage } from './pages/HomePage';
import { ResourcesPage } from './pages/ResourcesPage';
import { EvidencePage } from './pages/EvidencePage';
import { ChangeHistoryPage } from './pages/ChangeHistoryPage';
import { DependencyGraphPage } from './pages/DependencyGraphPage';
import { ChangeIntelligencePage } from './pages/ChangeIntelligencePage';
import { PredictionRealityPage } from './pages/PredictionRealityPage';
import { InvestigationPage } from './pages/InvestigationPage';
import { SecurityIntelligencePage } from './pages/SecurityIntelligencePage';
import { RemediationPage } from './pages/RemediationPage';
import { IntelligencePage } from './pages/IntelligencePage';
import { LoginPage } from './pages/LoginPage';
import { authSessionChanged, currentUser, logout } from './services/api';
import './styles.css';
import { useEffect, useState } from 'react';

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    if (!localStorage.getItem('changelens_token')) {
      setAuthenticated(false);
      return;
    }

    let active = true;
    void currentUser()
      .then(() => { if (active) setAuthenticated(true); })
      .catch(() => { if (active) setAuthenticated(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const handleSessionChange = () => {
      if (!localStorage.getItem('changelens_token')) setAuthenticated(false);
    };
    window.addEventListener(authSessionChanged, handleSessionChange);
    return () => window.removeEventListener(authSessionChanged, handleSessionChange);
  }, []);

  if (authenticated === null) return <main className="auth-loading" aria-live="polite">Checking session...</main>;
  if (!authenticated) return <LoginPage onAuthenticated={() => setAuthenticated(true)} />;

  async function handleLogout() {
    await logout().catch(() => undefined);
    setAuthenticated(false);
  }

  return (
    <>
      <header className="topbar">
        <a className="brand" href="/" aria-label="ChangeLens home">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span>ChangeLens</span>
        </a>
        <nav className="topbar-nav"><a href="#resources">Resources</a><a href="#evidence">Evidence</a><a href="#history">History</a><a href="#dependency-graph">Graph</a><a href="#change-intelligence">Intelligence</a><a href="#security">Security</a><a href="#intelligence-dashboard">Memory</a><a href="#remediation">Remediation</a><a href="#prediction-reality">Reality</a><a href="#investigation">RCA</a><span className="topbar-label">Platform foundation</span><button className="text-button topbar-logout" type="button" onClick={() => void handleLogout()}>Logout</button></nav>
      </header>
      <HomePage />
      <ResourcesPage />
      <EvidencePage />
      <ChangeHistoryPage />
      <DependencyGraphPage />
      <ChangeIntelligencePage />
      <PredictionRealityPage />
      <InvestigationPage />
      <SecurityIntelligencePage />
      <RemediationPage />
      <IntelligencePage />
    </>
  );
}
