// Generates local-only credentials. Never prints or overwrites existing secrets.
import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../.env', import.meta.url));
mkdirSync(fileURLToPath(new URL('../.local/mysql-run', import.meta.url)), { recursive: true });
if (existsSync(target)) {
  console.log('.env already exists; left unchanged. Check required settings against .env.example.');
} else {
  const secret = () => randomBytes(32).toString('hex');
  const content = [
    '# Local development only. Generated secrets; do not commit or share.',
    'NODE_ENV=development',
    'HOST=127.0.0.1',
    'PORT=8080',
    'BUILD_SHA=local-dev',
    'ROUTES_MODE=demo',
    'DB_MODE=mysql',
    'DIAGNOSTICS_ENABLED=false',
    'MYSQL_HOST=127.0.0.1',
    'MYSQL_PORT=3306',
    'MYSQL_DATABASE=hanoitrip',
    'MYSQL_USER=hanoitrip',
    `MYSQL_PASSWORD=${secret()}`,
    `MYSQL_ROOT_PASSWORD=${secret()}`,
    'MYSQL_TLS=false',
    'GOOGLE_ROUTES_API_KEY=',
    'GOOGLE_MAPS_BROWSER_KEY=',
    '',
  ].join('\n');
  writeFileSync(target, content, { mode: 0o600, flag: 'wx' });
  console.log('Created private .env for local MySQL. Secrets were not printed.');
}
