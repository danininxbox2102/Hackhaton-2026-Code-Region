'use strict';
const path = require('node:path');
const crypto = require('node:crypto');

function safeExternalUrl(value) {
  try {
    if (typeof value !== 'string' || value.length > 4096) return null;
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch { return null; }
}

function resolveBundledAsset(root, requestedUrl) {
  try {
    const url = new URL(requestedUrl);
    if (url.protocol !== 'starter:' || url.hostname !== 'app' || url.username || url.password) return null;
    // Encoded slash/backslash and nested escapes must not bypass the path gate.
    if (/%2f|%5c/i.test(url.pathname)) return null;
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\0') || pathname.includes('\\') || pathname.startsWith('//')) return null;
    const parts = pathname.split('/');
    if (parts.some(part => part === '..' || part === '.' || part.includes('%'))) return null;
    const candidate = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = path.relative(root, candidate);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return candidate;
  } catch { return null; }
}

function allowInternalNavigation(value, developmentUrl) {
  try {
    const url = new URL(value);
    if (url.protocol === 'starter:' && url.hostname === 'app' &&
        !url.username && !url.password) return true;
    if (developmentUrl && url.origin === new URL(developmentUrl).origin) return true;
    return false;
  } catch { return false; }
}

function contentSecurityPolicy(indexHtml) {
  const scriptHashes = [];
  const re = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of indexHtml.matchAll(re)) {
    if (!match[1].trim()) continue;
    scriptHashes.push("'sha256-" + crypto.createHash('sha256').update(match[1]).digest('base64') + "'");
  }
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    "script-src 'self' " + scriptHashes.join(' '),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https:"
  ].join('; ');
}
module.exports = { safeExternalUrl, resolveBundledAsset, allowInternalNavigation, contentSecurityPolicy };
