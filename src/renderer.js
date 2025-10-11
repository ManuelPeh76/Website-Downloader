/*  Website Downloader

    File: renderer.js
    Copyright © 2025 By Manuel Pelzer
    MIT License
*/

"use strict";

let isStarted = 0;
let startTime, tempTime;
let isInit = 0;
let canLog = 0;
let doScroll = true;
let interval, isMaximized;

// for testing inside the browser
if (!window.api) window.api = {
  maximize: () => {},
  minimize: () => {},
  unmaximize: () => {},
  startDownload: args => {},
  quit: () => {},
  saveProgress: () => {},
  resumeDownload: () => {},
  pauseDownload: () => {},
  abortDownload: () => {},
  selectFolder: () => {},
  onLog: () => {}
};

const progress = document.getElementById("progress-text");
const start = document.getElementById("start");
const log = document.getElementById("log");
const abort = document.getElementById("abort");
const pause = document.getElementById("pause");
const inputs = [...document.getElementsByClassName("input")];
const outdir = document.getElementById("outdir");
const github = document.getElementById("github");
const themeToggler = [...document.querySelectorAll(".theme-toggle")];
const progressTime = document.getElementById("progress-time");
const minimizer = document.querySelector(".minimizer");
const maximizer = document.querySelector(".maximizer");
const closer = document.querySelector(".closer");
const body = document.querySelector(".body");
const concurrency = document.getElementById("concurrency");
const dwt = document.getElementById("dwt");
const url = document.getElementById("url");
const depth = document.getElementById("depth");
const recursive = document.getElementById("recursive");
const createZip = document.getElementById("create-zip");
const createSitemap = document.getElementById("create-sitemap");
const createLog = document.getElementById("create-log");
const createProgresslog = document.getElementById("create-progresslog");
const clean = document.getElementById("clean");
const useIndex = document.getElementById("use-index");
const totalLinks = document.getElementById("total-links");
const cycles = [...document.querySelectorAll(".cycle")];

const httpRegex = /^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)$/;

const root = document.documentElement;
const storedTheme = localStorage.theme;
const preferences = localStorage.dwnldr_preferences ? JSON.parse(localStorage.dwnldr_preferences) : {};
const logProgress = msg => (progress.innerHTML = msg);
const logTotal = msg => totalLinks.innerHTML = msg.replace(/TLF/, "");
const logMessage = msg => {
  if (msg.startsWith("***")) msg = `<br><font size="3"><b>${msg}</b></font>`;
  log.innerHTML += msg.replace(/\n/g, "<br>");
  if (log.scrollHeight - log.scrollTop < 400) log.scrollTop = log.scrollHeight;
};

const title = {
  url: "The web address of the site you want to download.\nMust start with 'http://' or 'https://'",
  depth: "The depth of links to consider.\nMin: 0, Default: Infinity",
  recursive: "If enabled, links on downloaded HTML pages will be searched and any files found there will also be downloaded.\nDefault: Enabled",
  "create-zip": "If enabled, a ZIP archive containing the entire website will be created after downloads are complete.\nDefault: Disabled",
  "create-sitemap": "If enabled, a sitemap (sitemap.json) will be created after downloads are complete.\nDefault: Enabled",
  "create-log": "If enabled, a log file (log.json) containing all error messages will be created after downloads are complete.\nDefault: Enabled",
  "create-progresslog": "If enabled, a progress log file (progress.log) containing the progress list will be created after downloads are complete.\nDefault: Enabled",
  clean: "If enabled, the folder where the files are saved will be emptied before downloading.\nDefault: Disabled",
  "use-index": "If no file extension is found at the end of a path, the filename is assumed as 'index.html'.\nDefault: Enabled",
  concurrency: "Determines how many downloads run simultaneously.\nMin: 1, Max: 25, Default: 8",
  dwt: "The time (in ms) to wait after calling an HTML file to see if any content is dynamically loaded.\nMin: 500, Max: 30000, Default: 3000",
  outdir: "Select a folder in which to save the downloaded web pages. Each downloaded page will have a separate folder derived from the page's URL. For example, for the URL 'https://example.com', a folder named 'example.com' would be created.",
  github: "View source on GitHub",
  light: "Set Light Mode",
  dark: "Set Dark Mode",
};

Object.entries(title).forEach(([id, content]) => document.getElementById(`${id}-label`).setAttribute("data-tooltip", content));

api.unmaximize();

minimizer.title = "Minimize";
maximizer.title = "Maximize";
closer.title = "Close";

url.value = preferences.url || "";
depth.value = preferences.depth || "";
dwt.value = preferences.dwt || "";
concurrency.value = preferences.concurrency || "";
outdir.value = preferences.outdir || "";

typeof preferences.recursive === "boolean" && (recursive.checked = preferences.recursive);
typeof preferences.zip === "boolean" && (createZip.checked = preferences.zip);
typeof preferences.clean === "boolean" && (clean.checked = preferences.clean);
typeof preferences["use-index"] === "boolean" && (useIndex.checked = preferences["use-index"]);
typeof preferences["create-sitemap"] === "boolean" && (createSitemap.checked = preferences["create-sitemap"]);
typeof preferences["create-log"] === "boolean" && (createLog.checked = preferences["create-log"]);
typeof preferences["create-progresslog"] === "boolean" && (createProgresslog.checked = preferences["create-progresslog"]);

// Theme Toggle Logic
if (storedTheme) setTheme(storedTheme);
else setTheme(matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

themeToggler.forEach(el => el.addEventListener("click", function () {
  setTheme(this.id);
}));

//
// Event Listeners
//

document.addEventListener("keydown", keyDown);
inputs.forEach(input => input.addEventListener("change", updatePreferences);
github.addEventListener("click", () => open("https://github.com/ManuelPeh76/Website-Downloader"));
start.addEventListener("click", startDownload);
abort.addEventListener("click", abortDownload);
pause.addEventListener("click", pauseDownload);

// Target folder selection
outdir.addEventListener("change", function() {
  if (isStarted) return;
  if (this.value) {
    preferences.outdir = this.value;
    localStorage.dwnldr_preferences = JSON.stringify(preferences);
  }
});

outdir.addEventListener("dblclick", async () => {
  if (isStarted) return;
  const folder = await api.selectFolder();
  if (folder) {
    outdir.value = folder;
    preferences.outdir = folder;
    localStorage.dwnldr_preferences = JSON.stringify(preferences);
  }
});

minimizer.addEventListener("click", () => {
  minimizer.blur();
  api.minimize();
});

maximizer.addEventListener("click", async () => {
  (await api.maximize())
    ? ((maximizer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><path d="M4,8H8V4H20V16H16V20H4V8M16,8V14H18V6H10V8H16M6,12V18H14V12H6Z" /></svg>`),
      (maximizer.title = "Restore"))
    : ((maximizer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 550 550"><path d="M.3 89.5C.1 91.6 0 93.8 0 96L0 224 0 416c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-192 0-128c0-35.3-28.7-64-64-64L64 32c-2.2 0-4.4 .1-6.5 .3c-9.2 .9-17.8 3.8-25.5 8.2C21.8 46.5 13.4 55.1 7.7 65.5c-3.9 7.3-6.5 15.4-7.4 24zM48 224l416 0 0 192c0 8.8-7.2 16-16 16L64 432c-8.8 0-16-7.2-16-16l0-192z"/></svg>`),
      (maximizer.title = "Maximize"));
});

closer.addEventListener("click", api.quit);

/**
 * Handles keyboard events for custom navigation and download controls.
 *
 * - "Tab": Cycles focus through input elements.
 * - "Enter": Starts the download process.
 * - "Escape": Aborts the download process.
 * - "p": Pauses the download if it has started.
 *
 * @param {KeyboardEvent} e - The keyboard event object.
 */
function keyDown(e) {
  if ((["Tab", "Enter"].includes(e.key) && !isStarted) || (["Escape", "p"].includes(e.key) && isStarted)) e.preventDefault();
  if (e.key === "Tab" && !isStarted) {
    if (!cycles.includes(document.activeElement)) return cycles[0].focus();
    const position = cycles.indexOf(document.activeElement);
    if (position === cycles.length - 1 && !e.shiftKey) return cycles[0].focus();
    if (position === 0 && e.shiftKey) return cycles[cycles.length - 1].focus();
    cycles[e.shiftKey ? position - 1 : position + 1].focus();
  }
  else if (e.key === "Enter" && !isStarted) startDownload();
  else if (e.key === "Escape" && isStarted) abortDownload();
  else if (e.key === "p" && isStarted) pauseDownload();
}

function updatePreferences() {
  preferences[this.id] = this.type === "checkbox" ? this.checked : this.value;
  localStorage.dwnldr_preferences = JSON.stringify(preferences);
}

async function startDownload() {
  if (!await validateUserInput()) return;
  const query = {
    url: url.value,
    depth: depth.value,
    zip: createZip.checked,
    clean: clean.checked,
    useIndex: useIndex.checked,
    recursive: recursive.checked,
    outdir: outdir.value.trim(),
    concurrency: parseInt(concurrency.value, 10),
    dwt: parseInt(dwt.value, 10),
    sitemap: createSitemap.checked,
    log: createLog.checked
  };
  log.innerHTML = "";
  progress.innerHTML = "";
  setButtons();
  startTime = Date.now();
  progressTime.innerHTML = "00:00:00";
  interval = setInterval(printTime, 1000);
  canLog = 1;
  logMessage("*** STARTING DOWNLOAD ***<br>");
  api.startDownload(query);
  isStarted = 1;
  if (isInit) return;
  // Redirection of console.log
  api.onLog(onLog);
  isInit = 1;
}

function onLog(msg) {
  if (!msg || !canLog) return;
  // If console.log() is called multiple times within a short period of time,
  // all strings are joined together and sent at once.
  // Thus it is necessary to separate them again to display them correctly.
  // This is the purpose of the following lines of code.

  msg = msg // Insert markers (!!)
    .replace(/🌐/g, "!!🌐")
    .replace(/📄/g, "!!📄")
    .replace(/🏠/g, "!!🏠")
    .replace(/\*\*\* /g, "!!*** ")
    .replace(/TLF/g, "!!TLF")
    .split("!!") // Split the messages at marker positions
    .filter((e) => e); // No empty entries
  // Walk through all messages and display them.
  for (let m of msg) m.startsWith("🏠") ? logProgress(m) : m.startsWith("TLF") ? logTotal(m) : logMessage(m);

  // If '🕧' (Finished icon) is found, reset the GUI and save the content of the Log DIV element.
  if (msg.join("").includes("🕧")) {
    isStarted = 0;
    canLog = 0;
    resetButtons();
    clearInterval(interval);
    if (createProgresslog.checked) api.saveProgress(log.innerHTML.replace(/<br>/g, "\n").replace(/<.*?>/g, ""));
  }
}

function abortDownload() {
  if (!isStarted) return;
  clearInterval(interval);
  document.getElementById("paused")?.remove();
  log.innerHTML += '<font size="3"><b>*** ABORTED BY USER ***</b></font><br>';
  resetButtons();
  isStarted = 0;
  api.abortDownload();
  setTimeout(() => (canLog = 0), 1000);
}

function pauseDownload() {
  if (!isStarted) return;
  if (pause.textContent === "Pause") {
    log.innerHTML += "<span id='paused'>⏸️<b> Downloading paused...</b><br></span>";
    pause.textContent = "Resume";
    clearInterval(interval);
    tempTime = Date.now();
    return api.pauseDownload();
  }
  startTime += Date.now() - tempTime;
  interval = setInterval(printTime, 1000);
  document.getElementById("paused").remove();
  pause.innerText = "Pause";
  api.resumeDownload();
}

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
  pause.textContent = "Pause";
}

// Disable inputs and buttons
function setButtons() {
  inputs.forEach(input => input.disabled = true);
  start.disabled = true;
  pause.disabled = false;
  abort.disabled = false;
  pause.textContent = "Pause";
}

function printTime() {
  const now = Date.now() - startTime;
  const hours = String(parseInt(now / 3600000, 10)).padStart(2, "0");
  const mins = String(parseInt(now / 60000, 10)).padStart(2, "0");
  const secs = String(parseInt((now / 1000) % 60, 10)).padStart(2, "0");
  progressTime.innerHTML = `${hours}:${mins}:${secs}`;
}

async function validateUserInput() {
  const corrected = {};
  if (dwt.value < 500) dwt.value = corrected.dwt = 500;
  if (dwt.value > 30000) dwt.value = corrected.dwt = 30000;

  if (concurrency.value < 2) concurrency.value = corrected.concurrency = 2;
  if (concurrency.value > 25) concurrency.value = corrected.concurrency = 25;

  if (!url.value.startsWith("http")) {
    if (httpRegex.test("https://" + url.value)) {
      let response;
      response = await fetch("https://" + url.value, { method: "HEAD" });
      if (response.ok) url.value = corrected.url = "https://" + url.value;
      else {
        response = await fetch("http://" + url.value, { method: "HEAD" });
        if (response.ok) url.value = corrected.url = "http://" + query.url;
        else return (logMessage("<br>❌ Please enter a valid URL!"), url.focus(), false);
      }
    } else return (logMessage("<br>❌ Please enter a valid URL!"), url.focus(), false);
  }
  if (Object.keys(corrected).length) {
    for (let val in corrected) preferences[val] = corrected[val];
    localStorage.dwnldr_preferences = JSON.stringify(preferences);
  }
  return true;
}
