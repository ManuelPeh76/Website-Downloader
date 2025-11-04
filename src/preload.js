/**
 * @name Website Downloader
 *
 * @author Manuel Pelzer
 * @file preload.js
 * @copyright © 2025 By Manuel Pelzer
 * @license MIT
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startDownload: args => ipcRenderer.invoke('start-download', args),
  onLog: cb => ipcRenderer.on('log', (_, msg) => cb(msg)),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  abortDownload: () => ipcRenderer.invoke('abort-download'),
  pauseDownload: () => ipcRenderer.invoke('pause-download'),
  resumeDownload: () => ipcRenderer.invoke('resume-download'),
  saveProgress: args => ipcRenderer.invoke('save-progress', args),
  minimize: () => ipcRenderer.invoke("minimize"),
  maximize: () => ipcRenderer.invoke("maximize"),
  unmaximize: () => ipcRenderer.invoke("unmaximize"),
  getActiveHandles: () => ipcRenderer.invoke('get-active-handles'),
  quit: () => ipcRenderer.invoke("quit")
});

//const  exposeUIKit  = require('@electron-uikit/core/preload');

//exposeUIKit();
