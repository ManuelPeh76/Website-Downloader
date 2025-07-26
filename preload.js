const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startDownload: (args) => ipcRenderer.invoke('start-download', args),
  onLog: (callback) => ipcRenderer.on('log', (_, msg) => callback(msg)),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  onProgressUpdate: (callback) => ipcRenderer.on('progress', (event, data) => callback(data)),
  abortCrawling: () => ipcRenderer.invoke('abort-crawling')
});
