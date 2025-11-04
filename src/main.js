/**
 * @name Website Downloader
 *
 * @author Manuel Pelzer
 * @file main.js
 * @copyright © 2025 By Manuel Pelzer
 * @license MIT
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const ntsuspend = require('ntsuspend');

const isWin = process.platform === 'win32';
const options = {
  width: 900,
  height: 1000,
  //frame: false,
  webPreferences: {
    preload: path.join(__dirname, './preload.js'),
    contextIsolation: true,
    nodeIntegration: false
  }
};

let proc, pid, mainWindow;

app.whenReady().then(() => {

  mainWindow = new BrowserWindow(options);
  mainWindow.loadFile(path.join(__dirname, './gui.html'));

  ipcMain.handle('start-download', (event, { url, zip, clean, depth, recursive, folder, concurrency, dwt, useIndex, log, sitemap, debug }) => {
    return new Promise(resolve => {
      const args = [path.join(__dirname, './download.js'), url, "--electron"];
      if (zip) args.push('--zip');
      if (clean) args.push('--clean');
      if (recursive) args.push('--recursive');
      if (depth) args.push(`--depth=${depth}`);
      if (folder) args.push(`--folder=${folder}`);
      if (concurrency) args.push(`--concurrency=${concurrency}`);
      if (dwt) args.push(`--dyn_wait_time=${dwt}`);
      if (useIndex) args.push('--use-index');
      if (log) args.push("--log");
      if (sitemap) args.push("--sitemap");
      if (debug) args.push("--debug");
      proc = spawn('node', args);
      pid = proc.pid;
      proc.stdout.on('data', data => event.sender.send('log', data.toString()));
      proc.stderr.on('data', data => event.sender.send('log', data.toString()));
      proc.on('close', resolve);
    });
  });

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('abort-download', () => proc && !proc.killed && proc.stdin.write('abort'));
  ipcMain.handle('pause-download', () => proc && pid && !proc.killed && (isWin ? ntsuspend.suspend(pid) : proc.kill('SIGSTOP')));
  ipcMain.handle('resume-download', () => proc && pid && !proc.killed && (isWin ? ntsuspend.resume(pid) : proc.kill('SIGCONT')));
  ipcMain.handle('save-progress', (_, log) => proc && !proc.killed && proc.stdin.write("save-progress:" + log));
  ipcMain.handle('get-active-handles', () => proc && !proc.killed && proc.stdin.write("get-active-handles"));
  ipcMain.handle("minimize", ()  => mainWindow && !mainWindow.isDestroyed() && mainWindow.minimize());
  ipcMain.handle("maximize", () => mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() ? (mainWindow.unmaximize(), false) : ( mainWindow.maximize(), true) : false);
  ipcMain.handle("unmaximize", () => mainWindow && !mainWindow.isDestroyed() && mainWindow.unmaximize());
  ipcMain.handle("quit", app.quit);

});
