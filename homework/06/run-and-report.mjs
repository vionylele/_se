// scripts/run-and-report.mjs  ->  npm run test:report
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

fs.mkdirSync('out', { recursive: true });
const run = (cmd, env = {}) =>
  spawnSync(cmd, { shell: true, stdio: 'inherit', env: { ...process.env, ...env } }).status;

run('npx vitest run --config vitest.config.ts tests/unit --reporter=json --outputFile=out/unit.json');
run('npx vitest run --config vitest.config.ts tests/system --reporter=json --outputFile=out/system.json');
run('npx playwright test --reporter=json', { PLAYWRIGHT_JSON_OUTPUT_NAME: 'out/e2e.json' });
run('node scripts/build-results.mjs');