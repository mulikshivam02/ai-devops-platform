import cors from 'cors';
import express from 'express';
import { pathToFileURL } from 'node:url';
import { connectToDatabase } from './config/database.js';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.middleware.js';
import { notFoundHandler } from './middleware/not-found.middleware.js';
import { healthRouter } from './routes/health.routes.js';
import { resourceRouter } from './routes/resourceRoutes.js';
import { changeRouter, resourceChangeRouter } from './routes/changeRoutes.js';
import { evidenceRouter, resourceEvidenceRouter } from './routes/evidenceRoutes.js';
import { dependencyRouter, resourceDependencyRouter } from './routes/dependencyRoutes.js';
import { changeAnalysisRouter, changeRouterAnalysis } from './routes/changeAnalysisRoutes.js';

export const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());
app.use('/api/health', healthRouter);
app.use('/api/evidence', evidenceRouter);
app.use('/api/changes', changeRouter);
app.use('/api/dependencies', dependencyRouter);
app.use('/api/change-analyses', changeAnalysisRouter);
app.use('/api/resources/:resourceId/evidence', resourceEvidenceRouter);
app.use('/api/resources/:resourceId/changes', resourceChangeRouter);
app.use('/api/resources/:resourceId', resourceDependencyRouter);
app.use('/api/changes/:changeId', changeRouterAnalysis);
app.use('/api/resources', resourceRouter);
app.use(notFoundHandler);
app.use(errorHandler);

async function startServer(): Promise<void> {
  try {
    await connectToDatabase(env.mongodbUri);
    app.listen(env.port, () => {
      console.log(`ChangeLens API listening on http://localhost:${env.port}`);
    });
  } catch (error) {
    console.error('Unable to connect to MongoDB. HTTP server was not started.', error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void startServer();
}
