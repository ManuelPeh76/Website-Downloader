let isStarted = 0;
let isInit = 0;

const settings = document.getElementById("settings");
const progress = document.getElementById('progressText');
const start = document.getElementById('start');
const log = document.getElementById('log');
const abort = document.getElementById('abort');
const pause = document.getElementById('pause');
const selectFolder = document.getElementById('select-folder');

pause.disabled = true;

start.addEventListener('click', async () => {
  const url = document.getElementById('url').value;
  const depth = document.getElementById('depth').value;
  const simultaneous = document.getElementById('simultaneous').value;
  const zip = document.getElementById('zip').checked;
  const clean = document.getElementById('clean').checked;
  const recursive = document.getElementById('recursive').checked;
  const outdir = document.getElementById('outdir').value.trim();
  
  start.disabled = true;
  pause.disabled = false;
  log.textContent = url ? 'Starting download...\n' : "";
  progress.innerHTML = "";
  settings.innerHTML = "";
  settings.style.display = "block";

  window.api.startDownload({ url, zip, clean, depth, recursive, outdir, simultaneous });

  if (isStarted) return;
  isStarted = 1;
  if (isInit) return;

  window.api.onLog(msg => {
    msg.startsWith("progress:") ? progress.innerHTML = msg.slice(9) :
    msg.startsWith("settings:") ? settings.innerHTML = msg.slice(9).replace(/\n/g, "<br>") : (
      log.textContent += msg,
      log.scrollTop = log.scrollHeight,
      msg.includes('Log created') ? (
        start.disabled = false,
        pause.disabled = true
      ) :
      msg.includes("enter a URL") && (
        isStarted = 0,
        start.disabled = false,
        pause.disabled = true,
        settings.style.display = "none"
      )
    );
  });
  isInit = 1;
});

abort.addEventListener('click', () => {
  if (!isStarted) return;
  isStarted = 0;
  log.textContent += '\nAborted by user.\n';
  start.disabled = false;
  pause.disabled = true;
  settings.style.display = "none";
  window.api.abortDownload();
});

pause.addEventListener('click', () => {
  if (!isStarted) return;
  if (pause.textContent === "Pause") {
    log.textContent += ("\n...Pause...");
    pause.textContent = "Resume";
    return window.api.pauseDownload();
  }
  log.textContent += ("\n...Resuming...");
  pause.innerText = "Pause";
  window.api.resumeDownload();
});

selectFolder.addEventListener('click', async () => {
  const folder = await window.api.selectFolder();
  if (folder) document.getElementById('outdir').value = folder;
});
