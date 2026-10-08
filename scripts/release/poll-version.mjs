import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const values = new Map();
let strict = false;
for (let index = 2; index < process.argv.length; ) {
  const argument = process.argv[index];
  if (argument === '--strict') {
    strict = true;
    index += 1;
    continue;
  }
  values.set(argument, process.argv[index + 1]);
  index += 2;
}
const baseUrl = values.get('--url');
const expected = values.get('--expected');
const output = values.get('--output');
const timeoutSeconds = Number(values.get('--timeout') ?? 180);
if (!baseUrl || !expected || !output || !Number.isFinite(timeoutSeconds)) {
  throw new Error(
    'Usage: poll-version.mjs --url URL --expected SHA --output FILE [--timeout SECONDS] [--strict]',
  );
}

await mkdir(dirname(output), { recursive: true });
await writeFile(output, '');
const deadline = Date.now() + timeoutSeconds * 1000;
let non200 = 0;
let stableExpected = 0;

while (Date.now() < deadline) {
  const row = { timestamp: new Date().toISOString(), status: 0, buildSha: null, error: null };
  let failedObservation = false;
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
      failedObservation = true;
      row.error = `HTTP ${response.status}`;
    }
  } catch (error) {
    non200 += 1;
    stableExpected = 0;
    failedObservation = true;
    row.error = error instanceof Error ? error.name : 'UnknownError';
  }
  await appendFile(output, `${JSON.stringify(row)}\n`);
  if (strict && failedObservation) {
    throw new Error(
      `Strict observation failed after ${non200} non-200/network response(s); raw observations: ${output}`,
    );
  }
  if (stableExpected >= 3) {
    console.log(
      `Observed ${expected} for three consecutive polls after ${non200} transient failed response(s).`,
    );
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
throw new Error(`Timed out waiting for ${expected}; raw observations: ${output}`);
