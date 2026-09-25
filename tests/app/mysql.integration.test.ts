import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readConfig } from '../../app/server/config.js';
import { createPool, itemsDDL, MysqlRepository } from '../../app/server/repository.js';
import { places, toPoint } from '../../app/shared/places.js';

describe.skipIf(process.env.MYSQL_TEST !== '1')('real MySQL persistence (explicit opt-in)', () => {
  let config: ReturnType<typeof readConfig>;
  let pool: ReturnType<typeof createPool>;
  let repo: MysqlRepository;
  beforeAll(() => {
    config = readConfig({ ...process.env, NODE_ENV: 'test', DB_MODE: 'mysql' });
    pool = createPool(config);
    repo = new MysqlRepository(pool);
  });
  const ids: string[] = [];
  afterAll(async () => {
    if (!pool) return;
    for (const id of ids) await pool.execute('DELETE FROM items WHERE id = ?', [id]);
    await repo.close();
  });
  it('migrates idempotently, writes literal SQL-like text, survives connection recreation', async () => {
    await pool.query(itemsDDL);
    await pool.query(itemsDDL);
    await repo.health();
    const label = `test-${randomUUID().slice(0, 8)} '; DROP TABLE items; --`;
    const created = await repo.create({
      label,
      origin: toPoint(places[0]),
      destination: toPoint(places[2]),
    });
    ids.push(created.id);
    const second = new MysqlRepository(createPool(config));
    try {
      expect((await second.list(100, 0)).find((item) => item.id === created.id)).toMatchObject({
        label,
        origin: { latitude: places[0].latitude },
      });
      await second.health();
    } finally {
      await second.close();
    }
  });
});
