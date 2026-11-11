'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('starterNative', Object.freeze({
  platform: 'electron',
  openExternal: (url) => ipcRenderer.invoke('starter:open-external', url)
}));
