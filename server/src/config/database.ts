import mongoose from 'mongoose';

export async function connectToDatabase(uri: string): Promise<void> {
  await mongoose.connect(uri);
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect();
}
