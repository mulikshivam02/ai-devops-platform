import { DashboardPage } from './pages/DashboardPage';
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
import { KubernetesIntegrationPage } from './pages/KubernetesIntegrationPage';
import { ObservabilityPage } from './pages/ObservabilityPage';
import { ChangeIntelligenceOrchestrationPage } from './pages/ChangeIntelligenceOrchestrationPage';
import { HistoricalIntelligencePage } from './pages/HistoricalIntelligencePage';
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
        <nav className="topbar-nav"><a href="#dashboard">Dashboard</a><a href="#changes">Changes</a><a href="#resources">Resources</a><a href="#evidence">Evidence</a><a href="#end-to-end-intelligence">Intelligence</a><a href="#historical-intelligence">Learning</a><a href="#integrations">Integrations</a><span className="topbar-label">ChangeLens</span><button className="text-button topbar-logout" type="button" onClick={() => void handleLogout()}>Logout</button></nav>
      </header>
      <DashboardPage />
      <ResourcesPage />
      <EvidencePage />
      <ChangeHistoryPage />
      <KubernetesIntegrationPage />
      <ObservabilityPage />
      <ChangeIntelligenceOrchestrationPage />
      <HistoricalIntelligencePage />
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
