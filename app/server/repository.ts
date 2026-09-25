import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import type { RowDataPacket, Pool } from 'mysql2/promise';
import type { Config } from './config.js';
import type { Item, ItemInput } from '../shared/contracts.js';

export interface ItemRepository {
  health(): Promise<void>;
  list(limit: number, offset: number): Promise<Item[]>;
  create(input: ItemInput): Promise<Item>;
  close(): Promise<void>;
}
export class MemoryRepository implements ItemRepository {
  private items: Item[] = [];
  async health() {}
  async list(limit: number, offset: number) {
    return this.items.slice(offset, offset + limit);
  }
  async create(input: ItemInput) {
    const item = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    this.items.unshift(item);
    // Demo only; cap memory even if the protected demo is left running.
    this.items = this.items.slice(0, 500);
    return item;
  }
  async close() {}
}
export function createPool(config: Config): Pool {
  return mysql.createPool({
    host: config.MYSQL_HOST,
    ...(config.MYSQL_SOCKET_PATH ? { socketPath: config.MYSQL_SOCKET_PATH } : {}),
    port: config.MYSQL_PORT,
    user: config.MYSQL_USER,
    password: config.MYSQL_PASSWORD,
    database: config.MYSQL_DATABASE,
    ssl: config.MYSQL_TLS
      ? {
          rejectUnauthorized: true,
          ...(config.MYSQL_CA_FILE ? { ca: readFileSync(config.MYSQL_CA_FILE, 'utf8') } : {}),
        }
      : undefined,
    connectionLimit: 5,
    waitForConnections: true,
    queueLimit: 20,
    connectTimeout: 5000,
    decimalNumbers: true,
    timezone: 'Z',
    multipleStatements: false,
  });
}
export class MysqlRepository implements ItemRepository {
  constructor(private pool: Pool) {}
  async health() {
    await this.pool.query({ sql: 'SELECT id FROM items LIMIT 1', timeout: 5000 });
  }
  async list(limit: number, offset: number): Promise<Item[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      {
        sql: 'SELECT * FROM items ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
        timeout: 5000,
      },
      [String(limit), String(offset)],
    );
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      origin: { label: row.origin_label, latitude: row.origin_lat, longitude: row.origin_lng },
      destination: {
        label: row.destination_label,
        latitude: row.destination_lat,
        longitude: row.destination_lng,
      },
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }
  async create(input: ItemInput): Promise<Item> {
    const item: Item = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    await this.pool.execute(
      {
        sql: 'INSERT INTO items (id, label, origin_label, origin_lat, origin_lng, destination_label, destination_lat, destination_lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        timeout: 5000,
      },
      [
        item.id,
        item.label,
        item.origin.label,
        item.origin.latitude,
        item.origin.longitude,
        item.destination.label,
        item.destination.latitude,
        item.destination.longitude,
        new Date(item.createdAt),
      ],
    );
    return item;
  }
  async close() {
    await this.pool.end();
  }
}
export const itemsDDL = `CREATE TABLE IF NOT EXISTS items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  label VARCHAR(80) NOT NULL,
  origin_label VARCHAR(120) NOT NULL,
  origin_lat DECIMAL(9,6) NOT NULL,
  origin_lng DECIMAL(9,6) NOT NULL,
  destination_label VARCHAR(120) NOT NULL,
  destination_lat DECIMAL(9,6) NOT NULL,
  destination_lng DECIMAL(9,6) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX items_created (created_at, id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`;
