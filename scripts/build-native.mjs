import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const frontend = resolve(root, 'Frontend');
const urlText = process.env.VITE_API_URL;
if (!urlText) {
  console.error('VITE_API_URL is required for a native build; use your real HTTPS API origin.');
  process.exit(2);
}
let url;
try { url = new URL(urlText); }
catch { console.error('VITE_API_URL is not a valid URL'); process.exit(2); }
if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
    url.pathname !== '/' || url.search || url.hash) {
  console.error('VITE_API_URL must be an HTTPS origin (without /api, path, credentials or query).');
  process.exit(2);
}
const vite = resolve(frontend, 'node_modules', 'vite', 'bin', 'vite.js');
if (!existsSync(vite)) {
  console.error('Frontend dependencies missing. Run: cd Frontend && npm ci');
  process.exit(2);
}
const typecheck = resolve(frontend, 'node_modules', 'vue-tsc', 'bin', 'vue-tsc.js');
if (!existsSync(typecheck)) {
  console.error('Vue typecheck dependency missing. Run npm ci in Frontend.');
  process.exit(2);
}
const env = { ...process.env, VITE_DATA_MODE: 'api', VITE_API_URL: url.origin };
for (const [program, args] of [
  [typecheck, ['--noEmit']],
  [vite, ['build']]
]) {
  const outcome = spawnSync(process.execPath, [program, ...args], { cwd: frontend, env, stdio: 'inherit' });
  if (outcome.error || outcome.status !== 0) {
    if (outcome.error) console.error(outcome.error.message);
    process.exit(outcome.status || 1);
  }
}
console.log('Native web bundle built with API mode at ' + url.origin);
