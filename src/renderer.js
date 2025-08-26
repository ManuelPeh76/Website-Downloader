
/*  Website Downloader

    File: renderer.js
    Copyright © 2025 By Manuel Pelzer
    MIT License
*/

let isStarted = 0;
let startTime, tempTime;
let isActive = 0;
let isInit = 0;
let canLog = 0;
let doScroll = true;
let interval, isMaximized;

const progress = document.getElementById('progress-text');
const start = document.getElementById('start');
const log = document.getElementById('log');
const abort = document.getElementById('abort');
const pause = document.getElementById('pause');
const inputs = [...document.getElementsByClassName("input")];
const outdir = document.getElementById("outdir");
const github = document.getElementById("github");
const themeToggler = [...document.querySelectorAll(".theme-toggle")];
const progressTime = document.getElementById("progress-time");
const minimizer = document.querySelector(".minimizer");
const maximizer = document.querySelector(".maximizer");
const closer = document.querySelector(".closer");
const body = document.querySelector(".body");
const previous = {};
const root = document.documentElement;
const storedTheme = localStorage.theme;
const obj = localStorage.downloader_obj ? JSON.parse(localStorage.downloader_obj) : {};
const logProgress = msg => progress.innerHTML = msg;
const logMessage = msg => {
  if (msg.startsWith("***")) msg = `<br><font size="3"><b>${msg}</b></font>`;
  log.innerHTML += msg.replace(/\n/g, "<br>");
  if (log.scrollHeight - log.scrollTop < 400)  log.scrollTop = log.scrollHeight;
};

const printTime = () => {
  const now =  Date.now() - startTime;
  const hours = String(parseInt(now / (1000 * 60 * 60), 10)).padStart(2, "0");
  const mins = String(parseInt(now / (1000 * 60), 10)).padStart(2, "0");
  const secs = String(parseInt((now / 1000) % 60, 10)).padStart(2, "0");
  progressTime.innerHTML = `${hours}:${mins}:${secs}`;
};

const title = {
  url: "The web address of the site you want to download.\nMust start with 'http://' or 'https://'",
  depth: "The depth of links to consider.\nMin: 0, Default: Infinity",
  recursive: "If enabled, links on downloaded HTML pages will be searched and any files found there will also be downloaded.\nDefault: Enabled",
  zip: "If enabled, a ZIP archive containing the entire website will be created after downloads are complete.\nDefault: Disabled",
  clean: "If enabled, the folder where the files are saved will be emptied before downloading.\nDefault: Disabled",
  "use-index": "If no file extension is found at the end of a path, the filename is assumed as 'index.html'.\nDefault: Enabled",
  simultaneous: "Determines how many downloads run simultaneously.\nMin: 1, Max: 25, Default: 8",
  dwt: "The time (in ms) to wait after calling an HTML file to see if any content is dynamically loaded.\nMin: 500, Max: 30000, Default: 3000",
  outdir: "Select a folder in which to save the downloaded web pages. Each downloaded page will have a separate folder derived from the page's URL. For example, for the URL 'https://example.com', a folder named 'example.com' would be created.",
  github: "View source on GitHub",
  light: "Set Light Mode",
  dark: "Set Dark Mode"
};

Object.entries(title).forEach(([id, content]) => document.getElementById(`${id}-label`).setAttribute("data-tooltip", content));

if (obj.url) document.getElementById("url").value = obj.url;
if (obj.depth) document.getElementById("depth").value = obj.depth;
if (obj.dwt) document.getElementById("dwt").value = obj.dwt;
if (obj.simultaneous) document.getElementById("simultaneous").value = obj.simultaneous;
if (obj.recursive) document.getElementById("recursive").checked = obj.recursive;
if (obj.zip) document.getElementById("zip").checked = obj.zip;
if (obj.clean) document.getElementById("clean").checked = obj.clean;
if (obj.outdir) document.getElementById("outdir").value = obj.outdir;
if (obj["use-index"]) document.getElementById("use-index").checked = obj["use-index"];

// Theme Toggle Logic
if (storedTheme) setTheme(storedTheme);
else {
  const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(prefersDark ? "dark" : "light");
}

//
// Event Listeners
//

//Store values in the local storage if they change
inputs.forEach(el => {
  el.addEventListener("change", function() {
    const name = this.id;
    const value = this.type === "checkbox" ? this.checked : this.value;
    obj[name] = value;
    localStorage.downloader_obj = JSON.stringify(obj);
  });
});

// Toggle Theme
themeToggler.forEach(el => el.addEventListener("click", function() { setTheme(this.id); }));

github.addEventListener("click", () => open("https://github.com/ManuelPeh76/Website-Downloader"));

// Prepare to start downloading
start.addEventListener('click', async () => {
  const url = document.getElementById('url').value;
  const depth = document.getElementById('depth').value;
  const simultaneous = document.getElementById('simultaneous').value;
  const zip = document.getElementById('zip').checked;
  const clean = document.getElementById('clean').checked;
  const useIndex = document.getElementById('use-index').checked;
  const recursive = document.getElementById('recursive').checked;
  const outdir = document.getElementById('outdir').value.trim();
  const dwt = document.getElementById('dwt').value;

  if(!url.startsWith('http')) return logMessage('<br>❌ Please enter a valid URL!');

  log.innerHTML = "";
  progress.innerHTML = "";

  setButtons();
  startTime = Date.now();
  progressTime.innerHTML = '00:00:00';
  interval = setInterval(printTime, 1000);
  logMessage('*** STARTING DOWNLOAD ***<br>');
  canLog = 1;
  api.startDownload({ url, zip, clean, depth, recursive, outdir, simultaneous, dwt, useIndex });
  isActive = 1;
  if (isStarted) return;
  isStarted = 1;
  if (isInit) return;

  // Redirection of console.log
  api.onLog(msg => {
    if (!canLog) return;
    // If console.log() is called multiple times within a short period of time,
    // all strings are automatically chained into a single string and sent at once.
    // Therefore, it is necessary to separate them again to display them correctly.
    // This is the purpose of the following line of code.
    msg = msg.replace(/🌐/g, "!!🌐").replace(/📊/g, "!!📊").replace(/❌/g, "!!❌").replace(/\*\*\* /g, "!!*** ").split("!!").filter(e => e);
    // Now iterate through all messages and display them.
    for (m of msg) m.startsWith("📊") ? logProgress(m) : logMessage(m);
    // If '🕧' (Finished icon) is found, reset the GUI and save the content of the Log DIV element.
    if (msg.join("").includes('🕧')) {
      isActive = 0;
      canLog = 0;
      resetButtons();
      clearInterval(interval);
      api.saveProgress(log.innerHTML.replace(/<br>/g, "\n").replace(/<.*?>/g, ""));
    }
  });
  isInit = 1;
});

// Handle user initiated abort of download
abort.addEventListener('click', async () => {
  if (!isStarted) return;
  clearInterval(interval);
  document.getElementById('paused')?.remove();
  log.innerHTML += '<font size="3"><b>*** ABORTED BY USER ***</b></font><br>';
  resetButtons();
  isStarted = 0;
  isActive = 0;
  api.abortDownload();
  setTimeout(() => canLog = 0, 1000);
});

// Handle user initiated pause
// TODO: Still problematic, since the browser instances could be dead when resuming.
pause.addEventListener('click', () => {
  if (!isStarted) return;
  if (pause.textContent === "Pause") {
    log.innerHTML += ("<span id='paused'>⏸️<b> Downloading paused...</b><br></span>");
    pause.textContent = "Resume";
    clearInterval(interval);
    tempTime = Date.now();
    return api.pauseDownload();
  }
  startTime += Date.now() - tempTime;
  interval = setInterval(printTime, 1000);
  document.getElementById('paused').remove();
  pause.innerText = "Pause";
  api.resumeDownload();
});

// Target folder selection
outdir.addEventListener('click', async () => {
  if (isActive) return;
  const folder = await api.selectFolder();
  if (folder) {
    document.getElementById('outdir').value = folder;
    obj.outdir = folder;
    localStorage.downloader_obj = JSON.stringify(obj);
  }
});

minimizer.addEventListener("click", () => {

});

maximizer.addEventListener("click", el => {
  document.fullscreenElement ? document.exitFullscreen() : body.requestFullscreen();
});

closer.addEventListener("click", () => {

});

function setTheme(mode) {
  root.setAttribute("data-theme", mode);
  localStorage.theme = mode;
}

// Enable inputs and buttons
function resetButtons() {
  inputs.forEach(input => input.disabled = false);
  start.disabled = false;
  pause.disabled = true;
  abort.disabled = true;
  outdir.disabled = false;
}

// Disable inputs and buttons
function setButtons() {
  inputs.forEach(input => input.disabled = true);
  start.disabled = true;
  pause.disabled = false;
  abort.disabled = false;
  outdir.disabled = true;
}
