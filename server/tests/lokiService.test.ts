import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Review 4.7 / 4.8: Loki window vs. observation window, nanosecond timestamps, redaction order.
 * The HTTP client, Resource and Evidence models are mocked; everything in loki.service.ts is real.
 */
const lokiClient = vi.hoisted(() => ({ queryLoki: vi.fn(), getLokiBuildInfo: vi.fn(), isLokiConfigured: vi.fn() }));
const resourceModel = vi.hoisted(() => ({ exists: vi.fn() }));
const evidenceModel = vi.hoisted(() => ({ findOne: vi.fn() }));
const createEvidence = vi.hoisted(() => vi.fn());

vi.mock('../src/integrations/loki/loki.client.js', () => lokiClient);
vi.mock('../src/models/Resource.js', () => ({ ResourceModel: resourceModel }));
vi.mock('../src/models/Evidence.js', () => ({ EvidenceModel: evidenceModel }));
vi.mock('../src/services/evidenceService.js', () => ({ createEvidence }));

const loki = await import('../src/integrations/loki/loki.service.js');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const END = new Date('2026-09-14T12:00:00.000Z');

function nsAt(date: Date, extra = 0): string {
  return `${BigInt(date.getTime()) * 1_000_000n + BigInt(extra)}`;
}
function streamOf(lines: Array<[string, string]>) {
  return { resultType: 'streams', result: [{ stream: { app: 'api' }, values: lines }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  resourceModel.exists.mockResolvedValue(true);
});

describe('timestampFromLoki', () => {
  it('converts nanoseconds without the rounding that Number() introduces', () => {
    // 1726272000999999999 ns is 1726272000.999999999 s. As a double it rounds UP to ...1000000000,
    // which would put the line a whole millisecond (and, here, a second boundary) into the future.
    expect(Number('1726272000999999999') / 1e6).not.toBe(1726272000999.999);
    expect(loki.timestampFromLoki('1726272000999999999')).toBe('2024-09-14T00:00:00.999Z');
  });

  it('infers the unit from the digit count', () => {
    expect(loki.timestampFromLoki('1726272000')).toBe('2024-09-14T00:00:00.000Z'); // seconds
    expect(loki.timestampFromLoki('1726272000123')).toBe('2024-09-14T00:00:00.123Z'); // ms
    expect(loki.timestampFromLoki('1726272000123456')).toBe('2024-09-14T00:00:00.123Z'); // us
    expect(loki.timestampFromLoki('1726272000123456789')).toBe('2024-09-14T00:00:00.123Z'); // ns
  });

  it('rejects garbage instead of inventing a date', () => {
    for (const bad of ['', 'abc', '-5', '1.5e18', '17262720001234567890123', '99999999999999999999'])
      expect(loki.timestampFromLoki(bad), bad).toBeUndefined();
  });
});

describe('normalizeResults redaction', () => {
  it('redacts a secret straddling the 1000-character message limit', () => {
    const message = `${'m'.repeat(985)} token=ABCDEFGHIJKLMNOP`;
    const [observation] = loki.normalizeResults('{app="api"}', streamOf([['1726272000000000000', message]]));
    expect(observation?.message).not.toContain('ABCDE');
    expect(observation?.message.length).toBeLessThanOrEqual(1000);
  });

  it('keeps the original nanosecond timestamp', () => {
    const [observation] = loki.normalizeResults('{}', streamOf([['1726272000123456789', 'hello']]));
    expect(observation?.timestampNs).toBe('1726272000123456789');
  });
});

describe('range validation', () => {
  it('accepts a 7-day range (the observation-window size) and rejects anything longer', () => {
    const end = new Date(Date.now() - 1000);
    expect(() =>
      loki.validateLokiRange(new Date(end.getTime() - 7 * DAY).toISOString(), end.toISOString())
    ).not.toThrow();
    expect(() =>
      loki.validateLokiRange(new Date(end.getTime() - 7 * DAY - 1).toISOString(), end.toISOString())
    ).toThrow(/7 days/);
  });
});

describe('chunked queries', () => {
  it('uses a single request when the range fits in one chunk', async () => {
    lokiClient.queryLoki.mockResolvedValue(streamOf([[nsAt(new Date(END.getTime() - HOUR)), 'a']]));
    await loki.queryLokiLogs('{app="api"}', new Date(END.getTime() - 6 * HOUR).toISOString(), END.toISOString(), 10);
    expect(lokiClient.queryLoki).toHaveBeenCalledTimes(1);
  });

  it('stops after the newest chunk when it already holds enough lines (7 days = 1 call, not 7 or 168)', async () => {
    const lines: Array<[string, string]> = Array.from({ length: 5 }, (_, i): [string, string] => [
      nsAt(new Date(END.getTime() - i * 1000)),
      `line ${i}`
    ]);
    lokiClient.queryLoki.mockResolvedValue(streamOf(lines));
    const result = await loki.queryLokiLogs(
      '{app="api"}',
      new Date(END.getTime() - 7 * DAY).toISOString(),
      END.toISOString(),
      5
    );
    expect(result).toHaveLength(5);
    expect(lokiClient.queryLoki).toHaveBeenCalledTimes(1);
  });

  it('walks backward chunk by chunk with contiguous windows, asking only for what is still missing', async () => {
    lokiClient.queryLoki
      .mockResolvedValueOnce(streamOf([[nsAt(new Date(END.getTime() - 2 * HOUR)), 'newest']]))
      .mockResolvedValueOnce(streamOf([[nsAt(new Date(END.getTime() - DAY - 2 * HOUR)), 'middle']]))
      .mockResolvedValueOnce(streamOf([[nsAt(new Date(END.getTime() - 2 * DAY - 2 * HOUR)), 'oldest']]));
    const start = new Date(END.getTime() - 3 * DAY);
    const result = await loki.queryLokiLogs('{app="api"}', start.toISOString(), END.toISOString(), 3);

    expect(result.map((r) => r.message)).toEqual(['newest', 'middle', 'oldest']);
    const calls = lokiClient.queryLoki.mock.calls as Array<[string, { start: Date; end: Date }, number]>;
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c[2])).toEqual([3, 2, 1]); // remaining budget shrinks
    expect(calls[0]![1].end.getTime()).toBe(END.getTime());
    for (let i = 1; i < calls.length; i += 1) expect(calls[i]![1].end.getTime()).toBe(calls[i - 1]![1].start.getTime());
    expect(calls[2]![1].start.getTime()).toBe(start.getTime());
  });

  it('never makes more than 7 upstream requests for a 7-day range, and never exceeds the limit', async () => {
    lokiClient.queryLoki.mockResolvedValue(streamOf([]));
    const end = new Date(Date.now() - 1000);
    await loki.queryLokiLogs('{app="api"}', new Date(end.getTime() - 7 * DAY).toISOString(), end.toISOString(), 50);
    expect(lokiClient.queryLoki.mock.calls.length).toBeLessThanOrEqual(7);
    expect(lokiClient.queryLoki.mock.calls.length).toBe(7);
  });

  it('de-duplicates a line returned by two neighbouring chunks', async () => {
    const boundary = nsAt(new Date(END.getTime() - DAY));
    lokiClient.queryLoki
      .mockResolvedValueOnce(streamOf([[boundary, 'on the boundary']]))
      .mockResolvedValueOnce(streamOf([[boundary, 'on the boundary']]));
    const result = await loki.queryLokiLogs(
      '{app="api"}',
      new Date(END.getTime() - 2 * DAY).toISOString(),
      END.toISOString(),
      10
    );
    expect(result).toHaveLength(1);
  });

  it('returns lines newest-first and trims to the limit', async () => {
    lokiClient.queryLoki.mockResolvedValue({
      result: [
        { stream: { s: '1' }, values: [[nsAt(new Date(END.getTime() - 5000)), 'old-a']] },
        { stream: { s: '2' }, values: [[nsAt(new Date(END.getTime() - 1000)), 'new-b']] }
      ]
    });
    const result = await loki.queryLokiLogs(
      '{a="b"}',
      new Date(END.getTime() - HOUR).toISOString(),
      END.toISOString(),
      1
    );
    expect(result.map((r) => r.message)).toEqual(['new-b']);
  });
});

describe('importLokiLogs', () => {
  it('reports the real requested limit and the observed count (not observed twice)', async () => {
    lokiClient.queryLoki.mockResolvedValue(streamOf([[nsAt(new Date(END.getTime() - 1000)), 'a']]));
    evidenceModel.findOne.mockReturnValue({ lean: async () => null });
    createEvidence.mockResolvedValue({ id: 'e1' });
    const result = await loki.importLokiLogs(
      '507f1f77bcf86cd799439011',
      '{app="api"}',
      new Date(END.getTime() - HOUR).toISOString(),
      END.toISOString(),
      20
    );
    expect(result).toMatchObject({ requested: 20, observed: 1, imported: 1, alreadyPresent: 0 });
  });

  it('keeps two otherwise-identical lines that differ only in nanoseconds', async () => {
    const base = new Date(END.getTime() - 1000);
    lokiClient.queryLoki.mockResolvedValue(
      streamOf([
        [nsAt(base, 100), 'same message'],
        [nsAt(base, 200), 'same message']
      ])
    );
    const seen = new Set<string>();
    evidenceModel.findOne.mockImplementation((filter: { correlationId: string }) => ({
      lean: async () => (seen.has(filter.correlationId) ? { _id: 'dup' } : null)
    }));
    createEvidence.mockImplementation(async (input: { correlationId: string }) => {
      seen.add(input.correlationId);
      return { id: `e${seen.size}` };
    });
    const result = await loki.importLokiLogs(
      '507f1f77bcf86cd799439011',
      '{app="api"}',
      new Date(END.getTime() - HOUR).toISOString(),
      END.toISOString()
    );
    expect(result.imported).toBe(2);
    expect(result.alreadyPresent).toBe(0);
  });

  it('is scoped by resourceId when checking for existing evidence', async () => {
    lokiClient.queryLoki.mockResolvedValue(streamOf([[nsAt(new Date(END.getTime() - 1000)), 'a']]));
    evidenceModel.findOne.mockReturnValue({ lean: async () => null });
    createEvidence.mockResolvedValue({ id: 'e1' });
    await loki.importLokiLogs(
      '507f1f77bcf86cd799439011',
      '{a="b"}',
      new Date(END.getTime() - HOUR).toISOString(),
      END.toISOString()
    );
    expect(evidenceModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: '507f1f77bcf86cd799439011' })
    );
  });
});
