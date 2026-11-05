import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));

const envFile = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
if (!/^TEST_PATIENT_EMAIL=.+/m.test(envFile) || !/^TEST_PATIENT_PASSWORD=.+/m.test(envFile)) {
  console.warn('\n[!] TEST_PATIENT_EMAIL / TEST_PATIENT_PASSWORD missing in .env -> S9-S13 will be skipped.\n');
}

fs.rmSync('out', { recursive: true, force: true });
fs.mkdirSync('out', { recursive: true });

const run = (cmd, env = {}) =>
  spawnSync(cmd, { shell: true, stdio: 'inherit', env: { ...process.env, ...env } }).status;

run('npx vitest run --config vitest.config.ts tests/unit --reporter=json --outputFile=out/unit.json');
run('npx vitest run --config vitest.config.ts tests/system --reporter=json --outputFile=out/system.json');
run('npx playwright test --reporter=json', { PLAYWRIGHT_JSON_OUTPUT_NAME: 'out/e2e.json' });
run('node scripts/build-results.mjs');
console.log('\nDone. Commit and push homework/06/results.json');
