import { afterEach, describe, expect, it, vi } from 'vitest';
import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../../app/server/app.js';
import { readConfig } from '../../app/server/config.js';
import { MemoryRepository } from '../../app/server/repository.js';
import { demoProvider } from '../../app/server/routes-provider.js';
import { places, toPoint } from '../../app/shared/places.js';
const input = { origin: toPoint(places[0]), destination: toPoint(places[2]) };
let app: FastifyInstance;
async function setup(
  options: Parameters<typeof createApp>[1] = {
    repository: new MemoryRepository(),
    routes: demoProvider,
  },
  env = {},
) {
  app = await createApp(
    readConfig({ NODE_ENV: 'test', BUILD_SHA: 'test-sha', DIAGNOSTICS_ENABLED: 'true', ...env }),
    { logger: false, ...options },
  );
  return app;
}
afterEach(async () => {
  await app?.close();
});
describe('HTTP contracts', () => {
  it('returns readiness, immutable SHA and no server credentials', async () => {
    await setup();
    expect((await app.inject('/health')).json()).toEqual({ status: 'ok', database: 'memory' });
    expect((await app.inject('/version')).json().buildSha).toBe('test-sha');
    expect(Object.keys((await app.inject('/config')).json()).sort()).toEqual([
      'mapsBrowserKey',
      'routesMode',
      'storage',
    ]);
  });
  it('lists an empty collection and creates distinct server IDs', async () => {
    await setup();
    expect((await app.inject('/items')).json()).toEqual([]);
    const first = await app.inject({
      method: 'POST',
      url: '/items',
      payload: { ...input, label: 'Đi chơi' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/items',
      payload: { ...input, label: 'Lần sau' },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().id).not.toBe(second.json().id);
    expect((await app.inject('/items?limit=1')).json()).toHaveLength(1);
    expect((await app.inject('/items?offset=1')).json()[0].label).toBe('Đi chơi');
  });
  it.each(['/items?limit=0', '/items?offset=-1', '/items?limit=101', '/items?extra=1'])(
    'rejects invalid pagination %s',
    async (url) => {
      await setup();
      expect((await app.inject(url)).statusCode).toBe(400);
    },
  );
  it('rejects client IDs, invalid points, identical endpoints and oversized bodies', async () => {
    await setup();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/items',
          payload: { ...input, label: 'test', id: 'client' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/routes',
          payload: { ...input, origin: { ...input.origin, latitude: 90 } },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/routes',
          payload: { ...input, destination: input.origin },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/items',
          payload: { ...input, label: 'x'.repeat(17000) },
        })
      ).statusCode,
    ).toBe(413);
  });
  it('returns explicit demo alternatives and rejects past departure', async () => {
    await setup();
    const response = await app.inject({ method: 'POST', url: '/routes', payload: input });
    expect(response.statusCode).toBe(200);
    expect(response.json().source).toBe('demo');
    expect(response.json().routes).toHaveLength(3);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/routes',
          payload: { ...input, departureTime: '2020-01-01T00:00:00Z' },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('fails readiness and reads/writes when DB is unavailable, without leaking driver error', async () => {
    const repository = new MemoryRepository();
    for (const method of ['health', 'list', 'create'] as const)
      vi.spyOn(repository, method).mockRejectedValue(new Error('private-password'));
    await setup({ repository, routes: demoProvider });
    for (const response of [
      await app.inject('/health'),
      await app.inject('/items'),
      await app.inject({ method: 'POST', url: '/items', payload: { ...input, label: 'x' } }),
    ]) {
      expect(response.statusCode).toBe(503);
      expect(response.body).not.toContain('private-password');
    }
  });
  it('throws a deliberate exception with safe correlated JSON logs', async () => {
    let output = '';
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    await setup({
      repository: new MemoryRepository(),
      routes: demoProvider,
      logger: true,
      logStream: stream,
    });
    const response = await app.inject({
      url: '/boom',
      headers: { 'x-request-id': 'untrusted-id' },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json().error.requestId).toBe(response.headers['x-request-id']);
    expect(response.json().error.requestId).not.toBe('untrusted-id');
    expect(response.body).not.toContain('stack');
    const logs = output
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(
      logs.some((log) => log.level === 50 && log.requestId === response.headers['x-request-id']),
    ).toBe(true);
    expect(logs.find((log) => log.msg === 'request_complete')).toMatchObject({
      buildSha: 'test-sha',
      statusCode: 500,
      durationMs: expect.any(Number),
    });
  });
  it('defaults diagnostics off, leaves unknown endpoints 404', async () => {
    await setup(undefined, { DIAGNOSTICS_ENABLED: 'false' });
    for (const url of ['/boom', '/load?seconds=1', '/missing'])
      expect((await app.inject(url)).statusCode).toBe(404);
  });
  it.each(['0', '6', '-1', '1.5', 'abc'])('bounds CPU work for seconds=%s', async (seconds) => {
    await setup();
    expect((await app.inject(`/load?seconds=${seconds}`)).statusCode).toBe(400);
  });
  it('executes the requested valid load and keeps the web thread free', async () => {
    let release!: () => void;
    const load = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await setup({ repository: new MemoryRepository(), routes: demoProvider, load });
    const first = app.inject('/load?seconds=1');
    const running = first.then((result) => result);
    await vi.waitFor(() => expect(load).toHaveBeenCalledWith(1));
    expect((await app.inject('/health')).statusCode).toBe(200);
    expect((await app.inject('/load?seconds=1')).statusCode).toBe(429);
    release();
    expect((await running).statusCode).toBe(200);
  });
  it('enforces request rate limits', async () => {
    await setup();
    for (let i = 0; i < 20; i++)
      expect(
        (await app.inject({ method: 'POST', url: '/routes', payload: input })).statusCode,
      ).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/routes', payload: input })).statusCode).toBe(
      429,
    );
  });
});
describe('configuration safeguards', () => {
  it('requires separate live keys and verified production DB TLS', () => {
    expect(() => readConfig({ ROUTES_MODE: 'google' })).toThrow('separate');
    expect(() => readConfig({ NODE_ENV: 'production' })).toThrow('verified TLS');
    expect(() => readConfig({ DB_MODE: 'mysql' })).toThrow('password');
    expect(() => readConfig({ PORT: '0' })).toThrow('PORT');
  });
});
