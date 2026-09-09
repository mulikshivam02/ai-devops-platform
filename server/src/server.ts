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
import { comparisonRouter, observationRouter, predictionRealityRouter, predictionRouter } from './routes/predictionRealityRoutes.js';
import { aiHealthRouter, investigationByIdRouter, investigationRouter } from './routes/investigationRoutes.js';
import { securityRouter, changeSecurityRouter, resourceSecurityRouter } from './routes/securityRoutes.js';
import { remediationRouter } from './remediation/remediation.routes.js';
import { intelligenceRouter } from './intelligence/intelligence.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { authenticate, authorizeRequest } from './middleware/auth.middleware.js';
import { requestContext } from './middleware/request-context.middleware.js';
import { ensureInitialAdmin } from './services/auth.service.js';

export const app = express();

app.use(requestContext);
app.use(helmet());
app.use(cors({ origin: env.clientUrl, credentials: false }));
app.use(express.json({ limit: env.jsonBodyLimit }));
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }), authenticate, authorizeRequest);
app.use('/api/evidence', evidenceRouter);
app.use('/api/changes', changeRouter);
app.use('/api/dependencies', dependencyRouter);
app.use('/api/change-analyses', changeAnalysisRouter);
app.use('/api/predictions', predictionRouter);
app.use('/api/observations', observationRouter);
app.use('/api/comparisons', comparisonRouter);
app.use('/api/ai/health', aiHealthRouter);
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

async function startServer(): Promise<void> {
  let httpServer: ReturnType<typeof app.listen> | undefined;
  const shutdown = async (signal: string) => { console.info(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', signal, message: 'Graceful shutdown started' })); await new Promise<void>((resolve) => httpServer?.close(() => resolve())); await disconnectFromDatabase(); process.exit(0); };
  try {
    await connectToDatabase(env.mongodbUri);
    await ensureInitialAdmin();
    httpServer = app.listen(env.port, () => {
      console.log(`ChangeLens API listening on http://localhost:${env.port}`);
    });
    process.once('SIGINT', () => void shutdown('SIGINT')); process.once('SIGTERM', () => void shutdown('SIGTERM'));
  } catch (error) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', code: 'STARTUP_DATABASE_ERROR', message: 'Unable to connect to MongoDB. HTTP server was not started.' }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void startServer();
}
