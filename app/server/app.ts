import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import Fastify, { LogController } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import staticPlugin from '@fastify/static';
import { z, ZodError } from 'zod';
import { itemSchema, tripSchema } from '../shared/contracts.js';
import type { Config } from './config.js';
import type { ItemRepository } from './repository.js';
import type { RoutesProvider } from './routes-provider.js';
import { AppError } from './errors.js';

interface Dependencies {
  repository: ItemRepository;
  routes: RoutesProvider;
  logger?: boolean;
  logStream?: NodeJS.WritableStream;
  load?: (seconds: number) => Promise<unknown>;
  staticDir?: string;
}
export async function createApp(config: Config, deps: Dependencies) {
  const app = Fastify({
    logger:
      deps.logger === false
        ? false
        : {
            level: 'info',
            base: { buildSha: config.BUILD_SHA },
            ...(deps.logStream ? { stream: deps.logStream } : {}),
          },
    logController: new LogController({ disableRequestLogging: true }),
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    bodyLimit: 16384,
    requestTimeout: 15000,
    connectionTimeout: 10000,
    trustProxy: false,
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://maps.googleapis.com', 'https://maps.gstatic.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://tiles.openfreemap.org',
          'https://*.googleapis.com',
          'https://*.gstatic.com',
          'https://*.google.com',
          'https://*.googleusercontent.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        connectSrc: [
          "'self'",
          'https://tiles.openfreemap.org',
          'https://*.googleapis.com',
          'https://*.gstatic.com',
          'https://*.google.com',
        ],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.NODE_ENV === 'production' ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(rateLimit, { global: false });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    reply.header('cache-control', 'no-store');
  });
  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        requestId: request.id,
        buildSha: config.BUILD_SHA,
        method: request.method,
        path: request.routeOptions.url ?? 'unknown',
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime * 100) / 100,
      },
      'request_complete',
    );
  });
  app.setErrorHandler((error, request, reply) => {
    const typed = error as Error & { statusCode?: number };
    const status =
      error instanceof ZodError
        ? 400
        : typed.statusCode && typed.statusCode >= 400 && typed.statusCode < 600
          ? typed.statusCode
          : 500;
    const code =
      error instanceof AppError
        ? error.code
        : status === 400
          ? 'INVALID_INPUT'
          : status === 429
            ? 'RATE_LIMITED'
            : status === 413
              ? 'BODY_TOO_LARGE'
              : 'INTERNAL_ERROR';
    const message =
      error instanceof AppError
        ? error.message
        : status === 400
          ? 'Thông tin chưa hợp lệ. Kiểm tra lại điểm đi, điểm đến và thời gian.'
          : status === 429
            ? 'Bạn thao tác quá nhanh. Hãy thử lại sau một phút.'
            : status === 413
              ? 'Nội dung gửi lên quá lớn.'
              : 'Có lỗi xử lý. Hãy thử lại sau.';
    if (status >= 500)
      request.log.error(
        {
          requestId: request.id,
          buildSha: config.BUILD_SHA,
          errorCode: code,
          exceptionType: error instanceof AppError ? 'AppError' : 'Error',
          statusCode: status,
        },
        'request_failed',
      );
    reply.status(status).send({ error: { code, message, requestId: request.id } });
  });
  const db = async <T>(operation: () => Promise<T>): Promise<T> => {
    try {
      return await operation();
    } catch {
      throw new AppError(
        503,
        'DATABASE_UNAVAILABLE',
        'Chưa thể truy cập hành trình đã lưu. Hãy thử lại sau.',
      );
    }
  };
  app.get('/health', async () => {
    await db(() => deps.repository.health());
    return { status: 'ok', database: config.DB_MODE };
  });
  app.get('/version', async () => ({
    buildSha: config.BUILD_SHA,
    version: '0.1.0',
    environment: config.NODE_ENV,
  }));
  app.get('/config', async () => ({
    routesMode: config.ROUTES_MODE,
    mapsBrowserKey: config.GOOGLE_MAPS_BROWSER_KEY,
    storage: config.DB_MODE,
  }));
  app.get('/items', async (request) => {
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(30),
        offset: z.coerce.number().int().min(0).max(10000).default(0),
      })
      .strict()
      .parse(request.query);
    return db(() => deps.repository.list(query.limit, query.offset));
  });
  app.post(
    '/items',
    { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = itemSchema.parse(request.body);
      const item = await db(() => deps.repository.create(input));
      return reply.code(201).send(item);
    },
  );
  app.post(
    '/routes',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const input = tripSchema.parse(request.body);
      if (input.departureTime) {
        const delta = Date.parse(input.departureTime) - Date.now();
        if (delta < -60000 || delta > 7 * 86400000)
          throw new AppError(400, 'INVALID_TIME', 'Chọn thời gian từ hiện tại đến 7 ngày tới.');
      }
      return deps.routes(input);
    },
  );
  let loadRunning = false;
  const workers = new Set<Worker>();
  app.get(
    '/load',
    { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } },
    async (request) => {
      if (!config.DIAGNOSTICS_ENABLED)
        throw new AppError(404, 'NOT_FOUND', 'Chức năng kiểm thử đang tắt.');
      const { seconds } = z
        .object({ seconds: z.coerce.number().int().min(1).max(5) })
        .strict()
        .parse(request.query);
      if (loadRunning) throw new AppError(429, 'LOAD_BUSY', 'Một lượt kiểm thử đang chạy.');
      loadRunning = true;
      try {
        if (deps.load) await deps.load(seconds);
        else
          await new Promise((res, rej) => {
            const worker = new Worker(new URL('./load-worker.js', import.meta.url), {
              workerData: seconds,
            });
            workers.add(worker);
            const timeout = setTimeout(
              () => {
                void worker.terminate();
                rej(new AppError(503, 'LOAD_TIMEOUT', 'Kiểm thử đã dừng an toàn.'));
              },
              (seconds + 2) * 1000,
            );
            worker.once('message', res);
            worker.once('error', rej);
            worker.once('exit', (code) => {
              clearTimeout(timeout);
              workers.delete(worker);
              if (code !== 0) rej(new Error('Worker stopped'));
            });
          });
        return { seconds, status: 'completed' };
      } finally {
        loadRunning = false;
      }
    },
  );
  app.get('/boom', { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async () => {
    if (!config.DIAGNOSTICS_ENABLED)
      throw new AppError(404, 'NOT_FOUND', 'Chức năng kiểm thử đang tắt.');
    throw new Error('Intentional sandbox exception');
  });
  const staticDir = deps.staticDir ?? resolve('dist/client');
  if (existsSync(staticDir)) await app.register(staticPlugin, { root: staticDir, maxAge: 0 });
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({
      error: { code: 'NOT_FOUND', message: 'Không tìm thấy đường dẫn.', requestId: _request.id },
    }),
  );
  app.addHook('onClose', async () => {
    await Promise.all([...workers].map((worker) => worker.terminate()));
    await deps.repository.close();
  });
  return app;
}
