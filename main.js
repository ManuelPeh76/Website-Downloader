
/*  Website Downloader

    File: main.js
    Copyright © 2025 By Manuel Pelzer
    MIT License
*/

const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const ntsuspend = require('ntsuspend');

const options = {
  width: 900,
  height: 1024,
  autoHideMenuBar: false,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false
  }
};

const args = process.argv;
console.log(args);

if (args.includes('--noMenu') || args.includes('-nm')) Menu.setApplicationMenu(null);
else if (args.includes('--hideMenu') || args.includes('-hm')) options.autoHideMenuBar = true;

const isWin = process.platform === 'win32';
let proc, pid;

function createWindow() {
  const win = new BrowserWindow(options);
  win.loadFile('gui.html');
}

app.whenReady().then(() => {
  ipcMain.handle('start-download', async (event, { url, zip, clean, depth, recursive, outdir, simultaneous, dwt }) => {
    return new Promise((resolve, reject) => {

      const args = ['download.js', url];

      if (zip) args.push('--zip');
      if (clean) args.push('--clean');
      if (recursive) args.push('--recursive');
      if (depth) args.push(`--depth=${depth}`);
      if (outdir) args.push(`--outdir=${outdir}`);
      if (simultaneous) args.push(`--simultaneous=${simultaneous}`);
      if (dwt) args.push(`--dyn_wait_time=${dwt}`);

      proc = spawn('node', args);
      pid = proc.pid;

      proc.stdout.on('data', data => {
        event.sender.send('log', data.toString());
      });

      proc.stderr.on('data', data => {
        event.sender.send('log', data.toString());
      });

      proc.on('close', (code) => {
        resolve(code);
      });
    });
  });

  ipcMain.handle('abort-download', args => {
    if (proc && !proc.killed) {
      proc.stdin.write('abort');
      return true;
    }
    return false;
  });

  ipcMain.handle('pause-download', async () => {
    if (proc && pid) {
      isWin ? ntsuspend.suspend(pid) : proc.kill('SIGSTOP');
      return true;
    }
    return false;
  });

  ipcMain.handle('resume-download', async () => {
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

  ipcMain.handle('save-progress', async (_, log) => {
    if (proc && !proc.killed) {
      proc.stdin.write("save-progress:" + log);
      return true;
    }
    return false;
  });

  createWindow();
});
