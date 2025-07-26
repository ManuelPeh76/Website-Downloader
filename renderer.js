let isStarted = 0;
let isInit = 0;

document.getElementById('start').addEventListener('click', async () => {
  const url = document.getElementById('url').value;
  const depth = document.getElementById('depth').value;
  const zip = document.getElementById('zip').checked;
  const clean = document.getElementById('clean').checked;
  const recursive = document.getElementById('recursive').checked;
  const outdir = document.getElementById('outdir').value.trim();
  
  document.getElementById('start').disabled = true;
  document.getElementById('log').textContent = url ? 'Starting download...\n' : "";
  document.getElementById('progressText').innerHTML = "";
  document.getElementById('settings').innerHTML = "";
  document.getElementById('settings').style.display = "block";

  window.api.startDownload({ url, zip, clean, depth, recursive, outdir });

  if (isStarted) return;
  isStarted = 1;
  if (isInit) return;

  window.api.onLog((msg) => {
    if (msg.startsWith("progress:")) {
      document.getElementById('progressText').textContent = msg.slice(9);
      return;
    }
    if (msg.startsWith("settings:")) {
      document.getElementById("settings").innerHTML = msg.slice(9).replace(/\n/g, "<br>");
      return;
    }
    const log = document.getElementById('log');
    log.textContent += msg;
    log.scrollTop = log.scrollHeight;

    if (msg.includes('Log created')) {
      document.getElementById('start').disabled = false;
    } else if (msg.includes("enter a URL")) {
      isStarted = 0;
      document.getElementById('start').disabled = false;
      document.getElementById('settings').style.display = "none";
    }
  });
  
  isInit = 1;

});

document.getElementById('abort').addEventListener('click', () => {
  if (!isStarted) return;
  isStarted = 0;
  document.getElementById('log').textContent += '\nAborted by user.';
  document.getElementById('start').disabled = false;
  document.getElementById('settings').style.display = "none";
  window.api.abortCrawling();
});

document.getElementById('select-folder').addEventListener('click', async () => {
  const folder = await window.api.selectFolder();
  if (folder) document.getElementById('outdir').value = folder;
});
