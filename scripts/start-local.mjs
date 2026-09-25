import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { loadEnvFile } from 'node:process';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (existsSync('.env')) loadEnvFile('.env');
const socket = fileURLToPath(new URL('../.local/mysql-run/mysqld.sock', import.meta.url));
if (process.env.DB_MODE === 'mysql' && !process.env.MYSQL_SOCKET_PATH && existsSync(socket)) {
  process.env.MYSQL_SOCKET_PATH = socket;
  console.log('Local MySQL: authenticated Unix socket; WARP unchanged.');
}
if (!existsSync('dist/server/index.js')) throw new Error('Run npm run build first.');
const child = spawn(process.execPath, ['dist/server/index.js'], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => {
  console.error('Could not start local app.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
