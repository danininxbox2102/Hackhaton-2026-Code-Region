import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (file) => readFileSync(resolve(repo, file), 'utf8');
test('both shells share the same Vite output without copying source code', () => {
  const mobile = JSON.parse(read('Mobile/capacitor.config.json'));
  const desktop = JSON.parse(read('Desktop/package.json'));
  assert.equal(mobile.webDir, '../Frontend/dist');
  assert.ok(desktop.build.extraResources.some(x => x.from === '../Frontend/dist' && x.to === 'web'));
  assert.equal(mobile.appName, 'СТАРТЕР');
});
test('native build script enforces API mode and HTTPS', () => {
  const source = read('scripts/build-native.mjs');
  assert.match(source, /VITE_DATA_MODE: 'api'/);
  assert.match(source, /url.protocol !== 'https:'|url.protocol !== "https:"/);
});
test('desktop defaults to sandboxed context-isolated renderer', () => {
  const src = read('Desktop/src/main.cjs');
  assert.match(src, /contextIsolation: true/);
  assert.match(src, /nodeIntegration: false/);
  assert.match(src, /sandbox: true/);
  assert.match(src, /setWindowOpenHandler/);
});
