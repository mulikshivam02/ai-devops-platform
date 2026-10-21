import mongoose from 'mongoose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  disconnectFromDatabase: vi.fn(),
  isDatabaseConnected: vi.fn()
}));
const auth = vi.hoisted(() => ({ ensureInitialAdmin: vi.fn() }));

vi.mock('../src/config/database.js', () => database);
vi.mock('../src/services/auth.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/auth.service.js')>()),
  ensureInitialAdmin: auth.ensureInitialAdmin
}));

const { app, startServer } = await import('../src/server.js');

function fakeHttpServer() {
  return {
    close: vi.fn((callback?: () => void) => callback?.()),
    closeIdleConnections: vi.fn()
  };
}

let logged: string[];
let exit: ReturnType<typeof vi.spyOn>;
let once: ReturnType<typeof vi.spyOn>;

const signalHandler = (signal: string) => {
  const call = once.mock.calls.find(([name]) => name === signal);

  return call?.[1] as () => void;
};

beforeEach(() => {
  logged = [];
  vi.spyOn(console, 'error').mockImplementation((line: unknown) => void logged.push(String(line)));
  vi.spyOn(console, 'info').mockImplementation((line: unknown) => void logged.push(String(line)));
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  // Real process.exit never returns; the mock records the call and lets the function finish.
  exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  once = vi.spyOn(process, 'once').mockImplementation((() => process) as never);
  database.connectToDatabase.mockReset().mockResolvedValue(undefined);
  database.disconnectFromDatabase.mockReset().mockResolvedValue(undefined);
  auth.ensureInitialAdmin.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('startup failure (plan 6.6)', () => {
  it('exits with code 1 instead of lingering with exitCode set', async () => {
    database.connectToDatabase.mockRejectedValue(new Error('connection refused'));

    await startServer();

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('logs the real error, not a fixed "unable to connect to MongoDB" message', async () => {
    database.connectToDatabase.mockRejectedValue(new Error('querySrv ENOTFOUND _mongodb._tcp.cluster0.example.net'));

    await startServer();

    const entry = JSON.parse(logged.find((line) => line.includes('STARTUP_FAILED')) ?? '{}');

    expect(entry).toMatchObject({ level: 'error', code: 'STARTUP_FAILED' });
    expect(entry.cause).toContain('ENOTFOUND');
    expect(entry.stack).toContain('querySrv');
  });

  it('reports a failure that is not about the database as what it is', async () => {
    auth.ensureInitialAdmin.mockRejectedValue(new Error('INITIAL_ADMIN_PASSWORD too weak'));

    await startServer();

    const entry = JSON.parse(logged.find((line) => line.includes('STARTUP_FAILED')) ?? '{}');

    expect(entry.cause).toBe('INITIAL_ADMIN_PASSWORD too weak');
    expect(JSON.stringify(entry)).not.toMatch(/unable to connect to mongodb/i);
  });

  it('redacts credentials the driver echoes in its error message', async () => {
    database.connectToDatabase.mockRejectedValue(
      new Error('Invalid connection string: mongodb://admin:hunter2-secret@db.internal:27017/changelens')
    );

    await startServer();

    const text = logged.join('\n');

    expect(text).not.toContain('hunter2-secret');
    expect(text).toContain('db.internal');
  });

  it('closes the database pool before exiting, so nothing keeps the process alive', async () => {
    auth.ensureInitialAdmin.mockRejectedValue(new Error('seed failed'));

    await startServer();

    expect(database.disconnectFromDatabase).toHaveBeenCalledTimes(1);
  });

  it('still exits when closing the pool also fails', async () => {
    database.connectToDatabase.mockRejectedValue(new Error('x'));
    database.disconnectFromDatabase.mockRejectedValue(new Error('pool already closed'));

    await startServer();

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('does not start listening when startup fails', async () => {
    const listen = vi.spyOn(app, 'listen');
    database.connectToDatabase.mockRejectedValue(new Error('x'));

    await startServer();

    expect(listen).not.toHaveBeenCalled();
  });
});

describe('graceful shutdown', () => {
  it('registers signal handlers and listens once startup succeeds', async () => {
    const server = fakeHttpServer();
    const listen = vi.spyOn(app, 'listen').mockReturnValue(server as never);

    await startServer();

    expect(listen).toHaveBeenCalledTimes(1);
    expect(once.mock.calls.map(([name]) => name).sort()).toEqual(['SIGINT', 'SIGTERM']);
    expect(exit).not.toHaveBeenCalled();
  });

  it('closes idle keep-alive connections, closes the server, disconnects, then exits 0', async () => {
    const server = fakeHttpServer();
    vi.spyOn(app, 'listen').mockReturnValue(server as never);

    await startServer();
    signalHandler('SIGTERM')();
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(server.closeIdleConnections).toHaveBeenCalledTimes(1);
    expect(database.disconnectFromDatabase).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('runs shutdown only once when a second signal arrives', async () => {
    const server = fakeHttpServer();
    vi.spyOn(app, 'listen').mockReturnValue(server as never);

    await startServer();
    signalHandler('SIGTERM')();
    signalHandler('SIGINT')();
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());

    expect(server.close).toHaveBeenCalledTimes(1);
  });

  it('forces exit(1) if a stuck connection keeps close() from finishing', async () => {
    vi.useFakeTimers();
    const server = { close: vi.fn(), closeIdleConnections: vi.fn() }; // never calls back
    vi.spyOn(app, 'listen').mockReturnValue(server as never);

    await startServer();
    signalHandler('SIGTERM')();
    await vi.advanceTimersByTimeAsync(9_999);

    expect(exit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2);

    expect(exit).toHaveBeenCalledWith(1);
    expect(logged.some((line) => line.includes('SHUTDOWN_TIMEOUT'))).toBe(true);
  });

  it('exits 1 and logs when disconnecting fails during shutdown', async () => {
    const server = fakeHttpServer();
    vi.spyOn(app, 'listen').mockReturnValue(server as never);
    database.disconnectFromDatabase.mockRejectedValue(new Error('disconnect failed'));

    await startServer();
    signalHandler('SIGTERM')();
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());

    expect(exit).toHaveBeenCalledWith(1);
    expect(logged.some((line) => line.includes('SHUTDOWN_FAILED'))).toBe(true);
  });
});

describe('database error listener (plan 6.6)', () => {
  it('is attached once at load, not once per connect call', async () => {
    vi.resetModules();
    vi.doUnmock('../src/config/database.js');
    const connect = vi.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
    const before = mongoose.connection.listenerCount('error');
    const real = await import('../src/config/database.js');
    const afterLoad = mongoose.connection.listenerCount('error');

    await real.connectToDatabase('mongodb://localhost/a');
    await real.connectToDatabase('mongodb://localhost/b');
    await real.connectToDatabase('mongodb://localhost/c');

    expect(afterLoad).toBe(before + 1);
    expect(mongoose.connection.listenerCount('error')).toBe(afterLoad);
    expect(connect).toHaveBeenCalledTimes(3);
  });

  it('logs each connection error exactly once, with detail and without credentials', async () => {
    vi.resetModules();
    vi.doUnmock('../src/config/database.js');
    // Earlier tests in this file already loaded the module once; start from a clean slate so exactly
    // one listener -- the one under test -- is attached.
    mongoose.connection.removeAllListeners('error');
    await import('../src/config/database.js');
    logged.length = 0;

    mongoose.connection.emit('error', new Error('failed mongodb://user:pw-secret@host:27017/db'));

    const lines = logged.filter((line) => line.includes('DATABASE_ERROR'));

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('pw-secret');
    expect(lines[0]).toContain('host:27017');
  });
});
