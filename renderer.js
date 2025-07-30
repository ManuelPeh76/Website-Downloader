
/*  Website Downloader

    File: renderer.js
    Copyright © 2025 By Manuel Pelzer
    MIT License
*/

let isStarted = 0;
let isActive = 0;
let isInit = 0;
let canLog = 0;

const settings = document.getElementById("settings");
const progress = document.getElementById('progressText');
const start = document.getElementById('start');
const log = document.getElementById('log');
const abort = document.getElementById('abort');
const pause = document.getElementById('pause');
const selectFolder = document.getElementById('select-folder');

start.addEventListener('click', async () => {
  const url = document.getElementById('url').value;
  const depth = document.getElementById('depth').value;
  const simultaneous = document.getElementById('simultaneous').value;
  const zip = document.getElementById('zip').checked;
  const clean = document.getElementById('clean').checked;
  const recursive = document.getElementById('recursive').checked;
  const outdir = document.getElementById('outdir').value.trim();
  const dwt = document.getElementById('dwt').value;

  start.disabled = true;
  pause.disabled = false;
  abort.disabled = false;
  selectFolder.disabled = true;

  log.innerHTML = url ? 'Starting download...<br>' : "";
  progress.innerHTML = "";
  settings.innerHTML = "";
  settings.parentElement.style.display = "block";
  canLog = 1;

  window.api.startDownload({ url, zip, clean, depth, recursive, outdir, simultaneous, dwt });
  isActive = 1;
  if (isStarted) return;
  isStarted = 1;
  if (isInit) return;

  window.api.onLog(msg => {
    if (!canLog) return;
    msg.startsWith("progress:") ? progress.innerHTML = msg.slice(9) :
    msg.startsWith("settings:") ? settings.innerHTML = msg.slice(9).replace(/\n/g, "<br>") : (
      log.innerHTML += msg.replace(/\n/g, "<br>"),
      log.scrollTop = log.scrollHeight,
      msg.includes('Log created') ? (
        start.disabled = false,
        pause.disabled = true,
        abort.disabled = true,
        selectFolder.disabled = false,
        isActive = 0,
        window.api.saveProgress('save-progress:' + log.innerHTML)
      ) :
      msg.includes("enter a URL") && (
        isStarted = 0,
        isActive = 0,
        start.disabled = false,
        pause.disabled = true,
        abort.disabled = true,
        selectFolder.disabled = false
      )
    );
  });
  isInit = 1;
});

abort.addEventListener('click', () => {
  if (!isStarted) return;
  document.getElementById('paused')?.remove();
  log.innerHTML += '<b>Aborted by user!</b><br>';
  start.disabled = false;
  pause.disabled = true;
  abort.disabled = true;
  selectFolder.disabled = false;
  window.api.abortDownload();
  isStarted = 0;
  isActive = 0;
  canLog = 0;
});

pause.addEventListener('click', () => {
  if (!isStarted) return;
  if (pause.textContent === "Pause") {
    log.innerHTML += ("<span id='paused'>⏸️<b> Downloading paused...</b><br></span>");
    pause.textContent = "Resume";
    return window.api.pauseDownload();
  }
  document.getElementById('paused').remove();
  pause.innerText = "Pause";
  window.api.resumeDownload();
});

selectFolder.addEventListener('click', async () => {
  if (isActive) return;
  const folder = await window.api.selectFolder();
  if (folder) document.getElementById('outdir').value = folder;
});
