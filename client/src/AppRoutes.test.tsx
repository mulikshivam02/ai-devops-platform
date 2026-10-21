import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from './services/api';

const api = vi.hoisted(() => ({
  currentUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  getDashboardSummary: vi.fn(),
  listResources: vi.fn(),
  listChanges: vi.fn(),
  getChangeIntelligence: vi.fn(),
  getIntelligenceOverview: vi.fn(),
  listIntelligenceInsights: vi.fn(),
  listEvidence: vi.fn()
}));

vi.mock('./services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./services/api')>()),
  ...api
}));

const { default: App } = await import('./App');
const { setAuthToken } = await import('./services/session');

const user = (role: AuthUser['role']): AuthUser => ({
  id: `u-${role}`,
  email: `${role}@example.com`,
  role,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z'
});

const change = {
  id: 'change-1',
  changeId: 'github:demo:abc',
  resourceId: 'r1',
  summary: 'Update deployment',
  source: 'github',
  changeType: 'deployment',
  status: 'detected',
  timestamp: '2026-09-14T00:00:00.000Z',
  evidenceIds: [],
  metadata: {},
  createdAt: '2026-09-14T00:00:00.000Z',
  updatedAt: '2026-09-14T00:00:00.000Z'
};

const resource = {
  id: 'r1',
  name: 'Demo cluster',
  type: 'kubernetes_cluster',
  status: 'active',
  enabled: true,
  metadata: {},
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z'
};

const summary = {
  changeCounts: { total: 3, analyzed: 2, highCriticalRisk: 1, investigated: 1, unexpectedImpact: 0, insufficientEvidence: 1 },
  riskDistribution: { low: 1, medium: 0, high: 1, critical: 0 },
  recentChanges: [
    {
      id: 'change-1',
      changeId: 'github:demo:abc',
      summary: 'Update deployment',
      source: 'github',
      resourceId: 'r1',
      changeType: 'deployment',
      status: 'detected',
      timestamp: '2026-09-14T00:00:00.000Z',
      predictionStatus: 'available',
      realityStatus: 'observed'
    }
  ],
  recentOutcomes: [],
  integrationStatus: {
    github: 'configured',
    kubernetes: { configured: false, reachable: false, message: 'Not configured' },
    prometheus: { configured: false, reachable: false, message: 'Not configured' },
    loki: { configured: false, reachable: false, message: 'Not configured' }
  },
  aiStatus: { available: false, provider: 'mock', model: 'mock', message: 'Unavailable' }
};

function renderAt(path: string, signedInAs: AuthUser['role'] | null) {
  if (signedInAs) {
    setAuthToken('token');
    api.currentUser.mockResolvedValue(user(signedInAs));
  } else {
    api.currentUser.mockRejectedValue(new Error('unauthorised'));
  }

  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.logout.mockResolvedValue(null);
  api.getDashboardSummary.mockResolvedValue(summary);
  api.listResources.mockResolvedValue([resource]);
  api.listChanges.mockResolvedValue({ data: [change], pagination: { page: 1, limit: 100, total: 1, pages: 1 } });
  api.getChangeIntelligence.mockRejectedValue(new Error('No intelligence has been generated for this Change yet.'));
  api.getIntelligenceOverview.mockResolvedValue({
    status: 'insufficient_evidence',
    riskTrend: { status: 'insufficient_evidence', windowDays: null, sampleSize: 0, averageRiskScore: null, highCriticalRate: null, rollbackRate: null, securityFindingRate: null, evidenceIds: [], limitations: [] },
    predictionAccuracy: { status: 'insufficient_evidence', sampleSize: 0, averageAccuracy: null, underPredictionRate: null, overPredictionRate: null, insufficientEvidenceRate: null, evidenceIds: [], limitations: [] },
    patterns: []
  });
  api.listIntelligenceInsights.mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, pages: 0 } });
  api.listEvidence.mockResolvedValue({ data: [], pagination: { page: 1, limit: 25, total: 0, pages: 0 } });
});

describe('routing (plan 7.1)', () => {
  it('loads only the page being viewed, not every page at once', async () => {
    renderAt('/', 'viewer');

    await screen.findByText('Change health summary');

    // The old app rendered all 15 pages in one document, so signing in fired every page's loads --
    // including the dashboard's four live probes AND the intelligence overview's hundreds of queries.
    expect(api.getDashboardSummary).toHaveBeenCalledTimes(1);
    expect(api.listResources).not.toHaveBeenCalled();
    expect(api.getIntelligenceOverview).not.toHaveBeenCalled();
    expect(api.listEvidence).not.toHaveBeenCalled();
    expect(api.listChanges).not.toHaveBeenCalled();
  });

  it('opens the intelligence view of a specific change from its URL', async () => {
    renderAt('/changes/change-42', 'viewer');

    await waitFor(() => expect(api.getChangeIntelligence).toHaveBeenCalledWith('change-42'));
    // The dashboard did not load as a side effect.
    expect(api.getDashboardSummary).not.toHaveBeenCalled();
  });

  it('navigates between pages from the top bar, loading each page on demand', async () => {
    const actor = userEvent.setup();

    renderAt('/', 'viewer');
    await screen.findByText('Change health summary');
    await actor.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name: 'Resources' }));

    await screen.findByRole('heading', { name: 'Resource Center' });
    expect(api.listResources).toHaveBeenCalledTimes(1);
  });

  it('opens a change from the dashboard at its own address', async () => {
    const actor = userEvent.setup();

    renderAt('/', 'viewer');
    await actor.click(await screen.findByRole('button', { name: /Update deployment/ }));

    await waitFor(() => expect(api.getChangeIntelligence).toHaveBeenCalledWith('change-1'));
  });

  it('shows a not-found page for an unknown address', async () => {
    renderAt('/definitely/not/a/page', 'viewer');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('marks the current page in the navigation', async () => {
    renderAt('/resources', 'viewer');
    await screen.findByRole('heading', { name: 'Resource Center' });

    expect(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name: 'Resources' })).toHaveClass('active');
  });

  it('has a route for every page, so nothing became unreachable', async () => {
    const paths = [
      '/resources', '/evidence', '/changes', '/change-intelligence', '/learning', '/integrations/kubernetes',
      '/integrations/observability', '/dependencies', '/analysis', '/prediction-reality', '/investigations',
      '/security', '/remediation', '/insights'
    ];

    for (const path of paths) {
      const { unmount } = renderAt(path, 'viewer');

      await waitFor(() => expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
      // A page that throws while rendering shows the boundary's fallback, not "not found".
      expect(screen.queryByRole('heading', { name: 'This page could not be loaded.' }), path).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe('authentication flow', () => {
  it('sends an anonymous visitor to sign in, then back to the deep link they asked for', async () => {
    const actor = userEvent.setup();

    api.login.mockImplementation(async () => {
      setAuthToken('token');
      return user('viewer');
    });
    renderAt('/changes/change-42', null);

    await actor.type(await screen.findByLabelText('Email'), 'viewer@example.com');
    await actor.type(screen.getByLabelText('Password'), 'pw');
    await actor.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(api.getChangeIntelligence).toHaveBeenCalledWith('change-42'));
  });

  it('shows the sign-in error and stays on the login page when credentials are wrong', async () => {
    const actor = userEvent.setup();

    api.login.mockRejectedValue(new Error('Invalid email or password.'));
    renderAt('/', null);

    await actor.type(await screen.findByLabelText('Email'), 'a@b.co');
    await actor.type(screen.getByLabelText('Password'), 'bad');
    await actor.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(api.getDashboardSummary).not.toHaveBeenCalled();
  });

  it('returns to sign-in when the session is cleared (expired or revoked) while using the app', async () => {
    renderAt('/resources', 'viewer');
    await screen.findByRole('heading', { name: 'Resource Center' });

    setAuthToken(null); // what the API client does on any 401

    expect(await screen.findByRole('heading', { name: /Sign in to ChangeLens/ })).toBeInTheDocument();
  });

  it('signs out from the top bar', async () => {
    const actor = userEvent.setup();

    renderAt('/', 'viewer');
    await actor.click(await screen.findByRole('button', { name: 'Logout' }));

    expect(api.logout).toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: /Sign in to ChangeLens/ })).toBeInTheDocument();
  });

  it('treats a token the server rejects as signed out', async () => {
    setAuthToken('stale');
    api.currentUser.mockRejectedValue(new Error('Session is no longer valid.'));
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /Sign in to ChangeLens/ })).toBeInTheDocument();
  });

  it('shows the signed-in role in the top bar', async () => {
    renderAt('/', 'operator');

    expect(await screen.findByTitle('operator@example.com')).toHaveTextContent('operator');
  });
});

describe('role-aware controls (plan 7.3)', () => {
  it.each([
    ['viewer', false],
    ['operator', true],
    ['admin', true]
  ] as const)('%s %s see resource editing controls', async (role, visible) => {
    renderAt('/resources', role);

    await screen.findByText('Demo cluster');

    for (const name of ['+ Add resource', 'Edit', 'Delete']) {
      const control = screen.queryByRole('button', { name });

      if (visible) expect(control).toBeInTheDocument();
      else expect(control).not.toBeInTheDocument();
    }
    // Read-only navigation stays available to everyone.
    expect(screen.getByRole('link', { name: 'Graph' })).toBeInTheDocument();
  });

  it.each([
    ['viewer', false],
    ['operator', true]
  ] as const)('%s %s see the Analyze and Evaluate actions on a change', async (role, visible) => {
    renderAt('/changes/change-1', role);

    await screen.findByLabelText('Change');

    for (const name of ['Analyze Change', 'Evaluate Reality']) {
      const control = screen.queryByRole('button', { name });

      if (visible) expect(control).toBeInTheDocument();
      else expect(control).not.toBeInTheDocument();
    }
  });
});
