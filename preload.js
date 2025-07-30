
/*  Website Downloader

    File: preload.js
    Copyright © 2025 By Manuel Pelzer
    MIT License
*/

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startDownload: args => ipcRenderer.invoke('start-download', args),
  onLog: callback => ipcRenderer.on('log', (_, msg) => callback(msg)),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  abortDownload: args => ipcRenderer.invoke('abort-download', args),
  pauseDownload: () => ipcRenderer.invoke('pause-download'),
  resumeDownload: () => ipcRenderer.invoke('resume-download'),
  saveProgress: args => ipcRenderer.invoke('save-progress', args)
});
