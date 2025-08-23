
/*  Website Downloader

    File: main.js
    Copyright © 2025 By Manuel Pelzer
    MIT License
*/

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const ntsuspend = require('ntsuspend');

const options = {
  width: 900,
  height: 1000,
  frame: false,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false
  }
};

const isWin = process.platform === 'win32';
let proc, pid;

function createWindow() {
  const win = new BrowserWindow(options);
  win.loadFile('gui.html');
}

app.whenReady().then(() => {
  ipcMain.handle('start-download', async (event, { url, zip, clean, depth, recursive, outdir, simultaneous, dwt, useIndex }) => {
    return new Promise(resolve => {

      const args = ['download.js', url];

      if (zip) args.push('--zip');
      if (clean) args.push('--clean');
      if (recursive) args.push('--recursive');
      if (depth) args.push(`--depth=${depth}`);
      if (outdir) args.push(`--outdir=${outdir}`);
      if (simultaneous) args.push(`--simultaneous=${simultaneous}`);
      if (dwt) args.push(`--dyn_wait_time=${dwt}`);
      if (useIndex) args.push('--use-index');

      proc = spawn('node', args);
      pid = proc.pid;
      proc.stdout.on('data', data => event.sender.send('log', data.toString()));
      proc.stderr.on('data', data => event.sender.send('log', data.toString()));
      proc.on('close', resolve);
    });
  });

  ipcMain.handle('abort-download', () => {
    proc && !proc.killed && proc.stdin.write('abort');
  });

  ipcMain.handle('pause-download', async () => {
    proc && pid && !proc.killed && (isWin ? ntsuspend.suspend(pid) : proc.kill('SIGSTOP'));
  });

  ipcMain.handle('resume-download', async () => {
    proc && pid && !proc.killed && (isWin ? ntsuspend.resume(pid) : proc.kill('SIGCONT'));
  });

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('save-progress', async (_, log) => {
    proc && !proc.killed && proc.stdin.write("save-progress:" + log);
  });

  createWindow();
});
