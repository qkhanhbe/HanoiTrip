import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const values = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  values.set(process.argv[index], process.argv[index + 1]);
}
const baseUrl = values.get('--url');
const expected = values.get('--expected');
const output = values.get('--output');
const timeoutSeconds = Number(values.get('--timeout') ?? 180);
if (!baseUrl || !expected || !output || !Number.isFinite(timeoutSeconds)) {
  throw new Error('Usage: poll-version.mjs --url URL --expected SHA --output FILE [--timeout SECONDS]');
}

await mkdir(dirname(output), { recursive: true });
await writeFile(output, '');
const deadline = Date.now() + timeoutSeconds * 1000;
let non200 = 0;
let stableExpected = 0;

while (Date.now() < deadline) {
  const row = { timestamp: new Date().toISOString(), status: 0, buildSha: null, error: null };
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/version`, {
      headers: { 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(5000),
    });
    row.status = response.status;
    if (response.ok) {
      const body = await response.json();
      row.buildSha = typeof body.buildSha === 'string' ? body.buildSha : null;
      stableExpected = row.buildSha === expected ? stableExpected + 1 : 0;
    } else {
      non200 += 1;
      stableExpected = 0;
    }
  } catch (error) {
    non200 += 1;
    stableExpected = 0;
    row.error = error instanceof Error ? error.name : 'UnknownError';
  }
  await appendFile(output, `${JSON.stringify(row)}\n`);
  if (stableExpected >= 3) {
    if (non200) throw new Error(`Observed ${non200} non-200/network responses before ${expected}`);
    console.log(`Observed ${expected} for three consecutive polls with no failed response.`);
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
throw new Error(`Timed out waiting for ${expected}; raw observations: ${output}`);
