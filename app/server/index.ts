import { readConfig } from './config.js';
import { createApp } from './app.js';
import { createPool, itemsDDL, MemoryRepository, MysqlRepository } from './repository.js';
import { demoProvider, googleProvider } from './routes-provider.js';
import { vietmapProviders } from './vietmap-provider.js';
const config = readConfig();
const vietmap =
  config.ROAD_PROVIDER === 'vietmap' ? vietmapProviders(config.VIETMAP_API_KEY) : undefined;
const mysqlPool = config.DB_MODE === 'mysql' ? createPool(config) : undefined;
if (mysqlPool && config.DB_MIGRATE_ON_START) {
  await mysqlPool.query(itemsDDL);
  process.stdout.write(
    `${JSON.stringify({ level: 'info', event: 'database_migration', migration: '001_items', status: 'ready' })}\n`,
  );
}
const app = await createApp(config, {
  repository: mysqlPool ? new MysqlRepository(mysqlPool) : new MemoryRepository(),
  routes:
    config.ROUTES_MODE === 'google' ? googleProvider(config.GOOGLE_ROUTES_API_KEY) : demoProvider,
  places: vietmap?.places,
  roadRoutes: vietmap?.roadRoutes,
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch {
  app.log.fatal({ code: 'STARTUP_FAILED' }, 'Server could not start');
  await app.close();
  process.exit(1);
}
