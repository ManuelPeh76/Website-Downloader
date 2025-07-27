const isWin = process.platform === 'win32';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { dialog } = require('electron');
const ntsuspend = require('ntsuspend');

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile('gui.html');
}

let proc, pid;

app.whenReady().then(() => {
  ipcMain.handle('start-download', async (event, { url, zip, clean, depth, recursive, outdir }) => {
    return new Promise((resolve, reject) => {
      
      const args = ['downloader.js', url];
      
      if (zip) args.push('--zip');
      if (clean) args.push('--clean');
      if (recursive) args.push('--recursive');
      if (depth) args.push(`--depth=${depth}`);
      if (outdir) args.push(`--outdir=${outdir}`);
      
      proc = spawn('node', args);
      pid = proc.pid;

      proc.stdout.on('data', data => {
        event.sender.send('log', data.toString());
      });

      proc.stderr.on('data', (data) => {
        event.sender.send('log', data.toString());
      });

      proc.on('close', (code) => {
        resolve(code);
      });
    });
  });

  ipcMain.handle('abort-crawling', async () => {
    if (proc && !proc.killed) {
      proc.kill('SIGINT');
      return true;
    }
    return false;
  });

  ipcMain.handle('pause', async () => {
    if (proc && pid) {
      isWin ? ntsuspend.suspend(pid) : proc.kill('SIGSTOP');
      return true;
    }
    return false;
  });

  ipcMain.handle('resume', async () => {
    if (proc && pid) {
      isWin ? ntsuspend.resume(pid) : proc.kill('SIGCONT');
      return true;
    }
    return false;
  });

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  createWindow();
});
