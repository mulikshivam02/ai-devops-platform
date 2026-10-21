import mongoose from 'mongoose';
import { describeError, logEvent } from '../utils/lookup.js';
import { redactSecrets } from '../utils/sensitive-data.js';

// Registered once, at module load. It used to be attached inside connectToDatabase, so every call
// added another listener (and a duplicate log line per error).
mongoose.connection.on('error', (error: unknown) => {
  const details = describeError(error);

  // Redacted: driver messages can echo the connection string, credentials included.
  logEvent('error', 'DATABASE_ERROR', {
    message: 'Database connection error',
    name: details.name,
    cause: redactSecrets(details.message, 500)
  });
});

export async function connectToDatabase(uri: string): Promise<void> {
  await mongoose.connect(uri);
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect();
}
