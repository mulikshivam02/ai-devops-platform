import mongoose from 'mongoose';

export async function connectToDatabase(uri: string): Promise<void> {
  mongoose.connection.on('error', () => console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', code: 'DATABASE_ERROR', message: 'Database connection error' })));
  await mongoose.connect(uri);
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect();
}
