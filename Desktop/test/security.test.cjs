'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  safeExternalUrl, resolveBundledAsset, allowInternalNavigation, contentSecurityPolicy
} = require('../src/security.cjs');

test('external links accept only HTTPS, no OS handlers or credentials', () => {
  assert.equal(safeExternalUrl('https://trudvsem.ru/job/1'), 'https://trudvsem.ru/job/1');
  for (const x of ['http://example.org', 'file:///etc/passwd', 'javascript:alert(1)',
    'data:text/html,test', 'mailto:a@example.org', 'https://user:pass@example.org']) {
    assert.equal(safeExternalUrl(x), null, x);
  }
});
test('bundled assets cannot leave their root directory', () => {
  const root = path.resolve('/tmp/starter-web');
  assert.equal(resolveBundledAsset(root, 'starter://app/'), path.join(root, 'index.html'));
  assert.equal(resolveBundledAsset(root, 'starter://app/assets/main.js'), path.join(root, 'assets', 'main.js'));
  for (const x of ['starter://evil/index.html', 'file:///etc/passwd',
    'starter://app/%255c..%255csecret', 'starter://app/%2Fetc/passwd']) {
    assert.equal(resolveBundledAsset(root, x), null, x);
  }
});
test('navigation is limited to packaged scheme and Vite origin', () => {
  assert.equal(allowInternalNavigation('starter://app/#/account', null), true);
  assert.equal(allowInternalNavigation('https://example.org', null), false);
  assert.equal(allowInternalNavigation('http://127.0.0.1:5173/#/saved',
    'http://127.0.0.1:5173/'), true);
  assert.equal(allowInternalNavigation('https://example.org', 'http://127.0.0.1:5173/'), false);
});
test('packaged CSP hashes inline theme scripts without unsafe-inline JS', () => {
  const p = contentSecurityPolicy('<script>console.log("theme")</script><script src="/assets/main.js"></script>');
  assert.match(p, /script-src 'self' 'sha256-/);
  assert.doesNotMatch(p, /script-src[^;]*unsafe-inline/);
  assert.match(p, /connect-src 'self' https:/);
});
