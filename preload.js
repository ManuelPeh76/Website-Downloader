const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startDownload: (args) => ipcRenderer.invoke('start-download', args),
  onLog: (callback) => ipcRenderer.on('log', (_, msg) => callback(msg)),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  abortCrawling: () => ipcRenderer.invoke('abort-crawling'),
  pause: () => ipcRenderer.invoke('pause'),
  resume: () => ipcRenderer.invoke('resume')
});
