import { lazy, type ComponentType } from 'react';
import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { Layout } from './components/Layout';
import { NotFound } from './components/NotFound';
import { LoginPage } from './pages/LoginPage';

/**
 * Each page is its own chunk and mounts only while its route is active, so signing in no longer fires
 * every page's data load at once (the old single-document app called /dashboard/summary -- four live
 * probes -- and /intelligence/overview -- hundreds of queries -- on every login).
 */
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((module) => ({ default: module[name] })));
}

const Dashboard = page(() => import('./pages/DashboardPage'), 'DashboardPage');
const Resources = page(() => import('./pages/ResourcesPage'), 'ResourcesPage');
const Evidence = page(() => import('./pages/EvidencePage'), 'EvidencePage');
const ChangeHistory = page(() => import('./pages/ChangeHistoryPage'), 'ChangeHistoryPage');
const ChangeIntelligence = page(
  () => import('./pages/ChangeIntelligenceOrchestrationPage'),
  'ChangeIntelligenceOrchestrationPage'
);
const Learning = page(() => import('./pages/HistoricalIntelligencePage'), 'HistoricalIntelligencePage');
const Kubernetes = page(() => import('./pages/KubernetesIntegrationPage'), 'KubernetesIntegrationPage');
const Observability = page(() => import('./pages/ObservabilityPage'), 'ObservabilityPage');
const DependencyGraph = page(() => import('./pages/DependencyGraphPage'), 'DependencyGraphPage');
const ChangeAnalysis = page(() => import('./pages/ChangeIntelligencePage'), 'ChangeIntelligencePage');
const PredictionReality = page(() => import('./pages/PredictionRealityPage'), 'PredictionRealityPage');
const Investigations = page(() => import('./pages/InvestigationPage'), 'InvestigationPage');
const Security = page(() => import('./pages/SecurityIntelligencePage'), 'SecurityIntelligencePage');
const Remediation = page(() => import('./pages/RemediationPage'), 'RemediationPage');
const Insights = page(() => import('./pages/IntelligencePage'), 'IntelligencePage');

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="resources" element={<Resources />} />
          <Route path="evidence" element={<Evidence />} />
          <Route path="changes" element={<ChangeHistory />} />
          {/* Deep link: a specific change's intelligence view. */}
          <Route path="changes/:changeId" element={<ChangeIntelligence />} />
          <Route path="change-intelligence" element={<ChangeIntelligence />} />
          <Route path="learning" element={<Learning />} />
          <Route path="integrations/kubernetes" element={<Kubernetes />} />
          <Route path="integrations/observability" element={<Observability />} />
          <Route path="dependencies" element={<DependencyGraph />} />
          <Route path="analysis" element={<ChangeAnalysis />} />
          <Route path="prediction-reality" element={<PredictionReality />} />
          <Route path="investigations" element={<Investigations />} />
          <Route path="security" element={<Security />} />
          <Route path="remediation" element={<Remediation />} />
          <Route path="insights" element={<Insights />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
