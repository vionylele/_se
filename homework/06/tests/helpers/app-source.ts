import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_DIR = path.resolve(here, '../../../03/Clinic_System');
export const APP_JS_PATH = path.join(APP_DIR, 'app.js');
export const SCHEMA_PATH = path.join(APP_DIR, 'schema.sql');

export const readAppJs = () => fs.readFileSync(APP_JS_PATH, 'utf8');
export const readSchema = () => fs.readFileSync(SCHEMA_PATH, 'utf8');

/** Pull a `const NAME = '...'` string constant out of app.js (single source of truth). */
export function readConst(name: string): string {
  const m = readAppJs().match(new RegExp(`const ${name}\\s*=\\s*'([^']+)'`));
  if (!m) throw new Error(`Constant ${name} not found in app.js`);
  return m[1];
}
