import { readConfig } from './config.js';
import { createApp } from './app.js';
import { createPool, MemoryRepository, MysqlRepository } from './repository.js';
import { demoProvider, googleProvider } from './routes-provider.js';
const config = readConfig();
const app = await createApp(config, {
  repository:
    config.DB_MODE === 'mysql' ? new MysqlRepository(createPool(config)) : new MemoryRepository(),
  routes:
    config.ROUTES_MODE === 'google' ? googleProvider(config.GOOGLE_ROUTES_API_KEY) : demoProvider,
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
