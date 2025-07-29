const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startDownload: args => ipcRenderer.invoke('start-download', args),
  onLog: callback => ipcRenderer.on('log', (_, msg) => callback(msg)),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  abortDownload: args => ipcRenderer.invoke('abort-download', args),
  pauseDownload: () => ipcRenderer.invoke('pause-download'),
  resumeDownload: () => ipcRenderer.invoke('resume-download')
});
