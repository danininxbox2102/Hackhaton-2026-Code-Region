'use strict';
const { app, BrowserWindow, ipcMain, net, protocol, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const {
  safeExternalUrl, resolveBundledAsset, allowInternalNavigation, contentSecurityPolicy
} = require('./security.cjs');

const SCHEME = 'starter';
const APP_URL = 'starter://app/';
const DEV_URL = 'http://127.0.0.1:5173/';
protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
}]);
const development = !app.isPackaged;
const baseUrl = development ? DEV_URL : APP_URL;

async function external(url) {
  const safe = safeExternalUrl(url);
  if (!safe) return false;
  try { await shell.openExternal(safe); return true; }
  catch { return false; }
}

function registerBundledProtocol() {
  const root = path.resolve(process.resourcesPath, 'web');
  const htmlPath = path.join(root, 'index.html');
  if (!fs.existsSync(htmlPath)) throw new Error('Frontend build missing: run npm run build:web');
  const policy = contentSecurityPolicy(fs.readFileSync(htmlPath, 'utf8'));
  protocol.handle(SCHEME, async request => {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method Not Allowed', { status: 405 });
    const file = resolveBundledAsset(root, request.url);
    if (!file) return new Response('Forbidden', { status: 403 });
    try {
      if (!fs.statSync(file).isFile()) return new Response('Not Found', { status: 404 });
    } catch { return new Response('Not Found', { status: 404 }); }
    const response = await net.fetch(pathToFileURL(file).toString());
    if (path.basename(file) !== 'index.html') return response;
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', policy);
    return new Response(response.body, { status: response.status, headers });
  });
}

function createWindow() {
  const window = new BrowserWindow({
    title: 'СТАРТЕР',
    width: 1320, height: 860,
    minWidth: 780, minHeight: 600,
    backgroundColor: '#121211',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false
    }
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    void external(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!allowInternalNavigation(url, development ? baseUrl : null)) {
      event.preventDefault();
      void external(url);
    }
  });
  window.once('ready-to-show', () => window.show());
  void window.loadURL(baseUrl);
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  ipcMain.handle('starter:open-external', async (event, url) => {
    if (!allowInternalNavigation(event.senderFrame?.url, development ? baseUrl : null)) return false;
    return external(url);
  });
  if (!development) registerBundledProtocol();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch(error => {
  console.error('Unable to start Starter desktop:', error.message);
  app.quit();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
