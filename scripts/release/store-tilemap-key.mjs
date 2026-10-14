// Store the ignored local tile key using file input; never pass its value in argv/logs.
import { loadEnvFile } from 'node:process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const vault = process.argv[2];
if (!/^[A-Za-z0-9-]{3,24}$/.test(vault ?? '')) throw new Error('A Key Vault name is required.');
loadEnvFile('.env');
const key = process.env.VIETMAP_TILEMAP_API_KEY;
if (!key || key.length < 8 || /\s/.test(key)) throw new Error('Local Tilemap key is missing.');
const dir = await mkdtemp(join(tmpdir(), 'hanoitrip-tilemap-'));
try {
  const file = join(dir, 'key');
  await writeFile(file, key, { mode: 0o600 });
  const result = spawnSync(
    'az',
    ['keyvault', 'secret', 'set', '--vault-name', vault, '--name', 'vietmap-tilemap-api-key',
      '--file', file, '--encoding', 'utf-8', '--content-type', 'VIETMAP Tilemap key', '--output', 'none'],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  if (result.status !== 0) throw new Error('Could not store Tilemap key. Check Key Vault access.');
  console.log('Stored Tilemap key in Key Vault; no key value printed.');
} finally {
  await rm(dir, { recursive: true, force: true });
}
