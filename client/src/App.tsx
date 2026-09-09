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
import './styles.css';

export default function App() {
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/" aria-label="ChangeLens home">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span>ChangeLens</span>
        </a>
        <nav className="topbar-nav"><a href="#resources">Resources</a><a href="#evidence">Evidence</a><a href="#history">History</a><a href="#dependency-graph">Graph</a><a href="#change-intelligence">Intelligence</a><a href="#security">Security</a><a href="#intelligence-dashboard">Memory</a><a href="#remediation">Remediation</a><a href="#prediction-reality">Reality</a><a href="#investigation">RCA</a><span className="topbar-label">Platform foundation</span></nav>
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
