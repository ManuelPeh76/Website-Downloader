
/*  Website Downloader

    File: renderer.js
    Copyright © 2025 By Manuel Pelzer
    MIT License
*/

let isStarted = 0;
let isActive = 0;
let isInit = 0;
let canLog = 0;
let doScroll = true;

const root = document.documentElement;
const storedTheme = localStorage.theme;
const obj = localStorage.downloader_obj ? JSON.parse(localStorage.downloader_obj) : {};
const logProgress = msg => progress.innerHTML = msg;
const logMessage = msg => {
  doScroll = log.scrollHeight - log.scrollTop < 400 ? true : false;
  if (msg.startsWith("***")) msg = `<br><font size="3"><b>${msg}</b></font>`;
  log.innerHTML += msg.replace(/\n/g, "<br>");
  doScroll && (log.scrollTop = log.scrollHeight);
  msg.includes('Finished') ? (
    isActive = 0,
    canLog = 0,
    resetButtons(),
    window.api.saveProgress(log.innerHTML)
  ) : msg.includes("a valid URL") && (
    isStarted = 0,
    isActive = 0,
    canLog = 0,
    resetButtons()
  );
};

const progress = document.getElementById('progressText');
const start = document.getElementById('start');
const log = document.getElementById('log');
const abort = document.getElementById('abort');
const pause = document.getElementById('pause');
const inputs = [...document.getElementsByClassName("input")];
const outdir = document.getElementById("outdir");
const github = document.getElementById("github");
const themeToggler = [...document.querySelectorAll(".theme-toggle")];

const title = {
  url: "The web address of the site you want to download.\nMust start with 'http://' or 'https://'",
  depth: "The depth of links to consider.\nMin: 0, Default: Infinity",
  recursive: "If enabled, links on downloaded HTML pages will be searched and any files found there will also be downloaded.",
  zip: "If enabled, a ZIP archive containing the entire website will be created after downloads are complete.",
  clean: "If enabled, the folder where the files are saved will be emptied before downloading.",
  simultaneous: "Determines how many downloads run simultaneously.\nMin: 1, Max: 25, Default: 8",
  dwt: "The time (in ms) to wait after calling an HTML file to see if any content is dynamically loaded.\nMin: 1000, Max: 30000, Default: 3000",
  outdir: "Select a folder to save the downloaded web pages. Each downloaded page will have a separate folder derived from the page's URL. For example, for the URL 'https://example.com', a folder named 'example.com' would be created.",
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

// Theme Toggle Logic
if (storedTheme) setTheme(storedTheme);
else {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(prefersDark ? "dark" : "light");
}

resize();

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
  const recursive = document.getElementById('recursive').checked;
  const outdir = document.getElementById('outdir').value.trim();
  const dwt = document.getElementById('dwt').value;

  setButtons();

  log.innerHTML = url ? 'Starting download...<br>' : "";
  progress.innerHTML = "";
  canLog = 1;
  // Start Download
  window.api.startDownload({ url, zip, clean, depth, recursive, outdir, simultaneous, dwt });
  isActive = 1;
  if (isStarted) return;
  isStarted = 1;
  if (isInit) return;
  // Redirection of console.log
  window.api.onLog(msg => {
    if (!canLog) return;
    let m, m1 = [], m2 = [];
    const x = msg.includes("🌐") ? msg.split("🌐").map(e => msg.startsWith(e) ? e : "🌐" + e) : [msg];
    for (m of x) {
      if (m) {
        if (m.includes("📊")) {
          for (let e of m.split("📊")) e && m1.push(m.startsWith(e) ? e : "📊" + e);
        } else m1.push(m);
      }
    }
    for (m of m1) {
      if (m) {
        if (m.includes("*** ")) {
          for (e of m.split("*** ")) e && m2.push(m.startsWith(e) ? e : "*** " + e);
        } else m2.push(m);
      }
    }
    for (msg of m2) msg.startsWith("📊") ? logProgress(msg) : logMessage(msg);
  });
  isInit = 1;
});

// Handle user initiated abort of download
abort.addEventListener('click', () => {
  if (!isStarted) return;
  document.getElementById('paused')?.remove();
  log.innerHTML += '<font size="3"><b>*** Aborted by user ***</b></font><br>';
  resetButtons();
  window.api.abortDownload();
  isStarted = 0;
  isActive = 0;
  canLog = 0;
});

// Handle user initiated pause
// TODO: Still problematic, since the browser instances die after 30 seconds.
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

// Target folder selection
outdir.addEventListener('click', async () => {
  this.blur();
  if (isActive) return;
  const folder = await window.api.selectFolder();
  if (folder) {
    document.getElementById('outdir').value = folder;
    obj.outdir = folder;
    localStorage.downloader_obj = JSON.stringify(obj);
  }
});

// Size adaption of the log area on window resize
window.addEventListener("resize", resize);

function setTheme(mode) {
  root.setAttribute("data-theme", mode);
  localStorage.theme = mode;
}

// Button toggle function
function resetButtons() {
  start.disabled = false;
  pause.disabled = true;
  abort.disabled = true;
  outdir.disabled = false;
}

// Button toggle function
function setButtons() {
  start.disabled = true;
  pause.disabled = false;
  abort.disabled = false;
  outdir.disabled = true;
}

function resize() {
  log.style.width = (window.innerWidth - 110) + "px";
}
