import { readConfig } from './config.js';
import { createPool, itemsDDL } from './repository.js';
const config = readConfig();
if (config.DB_MODE !== 'mysql') throw new Error('Migration requires DB_MODE=mysql');
const pool = createPool(config);
try {
  await pool.query(itemsDDL);
  console.log('Migration 001: items ready (additive/idempotent).');
} finally {
  await pool.end();
}
