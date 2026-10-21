import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pathToFileURL } from 'node:url';
import { connectToDatabase, disconnectFromDatabase } from './config/database.js';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.middleware.js';
import { notFoundHandler } from './middleware/not-found.middleware.js';
import { healthRouter } from './routes/health.routes.js';
import { resourceRouter } from './routes/resourceRoutes.js';
import { changeRouter, resourceChangeRouter } from './routes/changeRoutes.js';
import { evidenceRouter, resourceEvidenceRouter } from './routes/evidenceRoutes.js';
import { dependencyRouter, resourceDependencyRouter } from './routes/dependencyRoutes.js';
import { changeAnalysisRouter, changeRouterAnalysis } from './routes/changeAnalysisRoutes.js';
import {
  comparisonRouter,
  observationRouter,
  predictionRealityRouter,
  predictionRouter
} from './routes/predictionRealityRoutes.js';
import { aiHealthRouter, investigationByIdRouter, investigationRouter } from './routes/investigationRoutes.js';
import { securityRouter, changeSecurityRouter, resourceSecurityRouter } from './routes/securityRoutes.js';
import { remediationRouter } from './remediation/remediation.routes.js';
import { intelligenceRouter } from './intelligence/intelligence.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { githubIntegrationRouter } from './routes/githubIntegrationRoutes.js';
import { kubernetesIntegrationRouter } from './routes/kubernetesIntegrationRoutes.js';
import { dashboardRouter } from './dashboard/dashboard.routes.js';
import { prometheusIntegrationRouter } from './routes/prometheusIntegrationRoutes.js';
import { lokiIntegrationRouter } from './routes/lokiIntegrationRoutes.js';
import { observabilityIntegrationRouter } from './routes/observabilityIntegrationRoutes.js';
import { authenticate, authorizeRequest } from './middleware/auth.middleware.js';
import { requestContext } from './middleware/request-context.middleware.js';
import { ensureInitialAdmin } from './services/auth.service.js';
import { describeError } from './utils/lookup.js';
import { redactSecrets } from './utils/sensitive-data.js';

export const app = express();

app.set('trust proxy', env.trustProxyHops);

app.use(requestContext);
app.use(helmet());
app.use(cors({ origin: env.clientUrl, credentials: false }));
app.use(express.json({ limit: env.jsonBodyLimit }));
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use(
  '/api',
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }),
  authenticate,
  authorizeRequest
);
app.use('/api/evidence', evidenceRouter);
app.use('/api/changes', changeRouter);
app.use('/api/dependencies', dependencyRouter);
app.use('/api/change-analyses', changeAnalysisRouter);
app.use('/api/predictions', predictionRouter);
app.use('/api/observations', observationRouter);
app.use('/api/comparisons', comparisonRouter);
app.use('/api/ai/health', aiHealthRouter);
app.use('/api/integrations/github', githubIntegrationRouter);
app.use('/api/integrations/kubernetes', kubernetesIntegrationRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/integrations/prometheus', prometheusIntegrationRouter);
app.use('/api/integrations/loki', lokiIntegrationRouter);
app.use('/api/integrations/observability', observabilityIntegrationRouter);
app.use('/api/security', securityRouter);
app.use('/api/remediations', remediationRouter);
app.use('/api/intelligence', intelligenceRouter);
app.use('/api/investigations', investigationByIdRouter);
app.use('/api/resources/:resourceId/evidence', resourceEvidenceRouter);
app.use('/api/resources/:resourceId', resourceSecurityRouter);
app.use('/api/resources/:resourceId/changes', resourceChangeRouter);
app.use('/api/resources/:resourceId', resourceDependencyRouter);
app.use('/api/changes/:changeId', changeRouterAnalysis);
app.use('/api/changes/:changeId', changeSecurityRouter);
app.use('/api/changes/:changeId', predictionRealityRouter);
app.use('/api/changes/:changeId', investigationRouter);
app.use('/api/resources', resourceRouter);
app.use(notFoundHandler);
app.use(errorHandler);

const SHUTDOWN_TIMEOUT_MS = 10_000;

function logLifecycle(level: 'info' | 'error', fields: Record<string, unknown>): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, ...fields });

  if (level === 'error') console.error(line);
  else console.info(line);
}

export async function startServer(): Promise<void> {
  let httpServer: ReturnType<typeof app.listen> | undefined;
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logLifecycle('info', { signal, message: 'Graceful shutdown started' });
    // server.close() waits for every open connection, and keep-alive connections can stay open for
    // a long time. Drop idle ones now, and give up waiting after a bound so a stuck request cannot
    // keep the process alive past the orchestrator's kill timeout.
    const forceExit = setTimeout(() => {
      logLifecycle('error', { code: 'SHUTDOWN_TIMEOUT', message: 'Forcing exit after shutdown timeout' });
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();
    try {
      await new Promise<void>((resolve) => {
        if (!httpServer) return resolve();
        httpServer.close(() => resolve());
        httpServer.closeIdleConnections();
      });
      await disconnectFromDatabase();
      clearTimeout(forceExit);
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExit);
      logLifecycle('error', { code: 'SHUTDOWN_FAILED', ...describeError(error) });
      process.exit(1);
    }
  };
  try {
    await connectToDatabase(env.mongodbUri);
    await ensureInitialAdmin();
    httpServer = app.listen(env.port, () => {
      console.log(`ChangeLens API listening on http://localhost:${env.port}`);
    });
    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
  } catch (error) {
    // Log what actually went wrong. The old handler printed a fixed "unable to connect to MongoDB"
    // even when the failure was the admin seed or the port, and set exitCode without exiting, so
    // the process lingered (a connected mongoose pool keeps the event loop alive) looking healthy.
    const details = describeError(error);
    logLifecycle('error', {
      code: 'STARTUP_FAILED',
      message: 'ChangeLens API failed to start. HTTP server was not started.',
      name: details.name,
      cause: redactSecrets(details.message, 500),
      ...(details.stack ? { stack: redactSecrets(details.stack, 4000) } : {})
    });
    await disconnectFromDatabase().catch(() => undefined);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void startServer();
}
