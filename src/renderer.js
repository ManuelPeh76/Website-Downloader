/**
 * @name Website Downloader
 *
 * @author Manuel Pelzer
 * @file renderer.js
 * @copyright © 2025 By Manuel Pelzer
 * @license MIT
 */

"use strict";

import { History } from "./history.js";
import { Modal } from "./modal.js";

const root = document.documentElement;
const storage = window.localStorage || {};

let downloadInProgress = false;
let startTime, tempTime;
let loggingIsLinked = false;
let loggingEnabled = false;
let downloadTimer;
let previousFolder;

/**
 * For testing purposes only
 *
 * window.api is part of the contextBridge and is added to the DOM by electron.
 * If you open this file inside a browser, there is no contextBridge, so I define api here
 * in order to test functionality inside the browser.
 */
if (!window.api) window.api = {
  maximize: () => (debug.checked ? logDev : logMessage)("Maximize\n"),
  minimize: () => (debug.checked ? logDev : logMessage)("Minimize\n"),
  unmaximize: () => (debug.checked ? logDev : logMessage)("Unmaximize\n"),
  startDownload: args => (debug.checked ? logDev : logMessage)("Start Download\n"),
  quit: () => (debug.checked ? logDev : logMessage)("Quit\n"),
  saveProgress: () => (debug.checked ? logDev : logMessage)("Save Progress\n"),
  resumeDownload: () => (debug.checked ? logDev : logMessage)("Resume Download\n"),
  pauseDownload: () => (debug.checked ? logDev : logMessage)("Pause Download\n"),
  abortDownload: () => (debug.checked ? logDev : logMessage)("Abort Download\n"),
  selectFolder: () => (debug.checked ? logDev : logMessage)("Select Folder\n"),
  onLog: () => (debug.checked ? logDev : logMessage)("On Log\n")
};

/* DOM elements */
const progress = document.getElementById("progress-text");
const start = document.getElementById("start");
const log = document.getElementById("log");
const abort = document.getElementById("abort");
const pause = document.getElementById("pause");
const folder = document.getElementById("folder");
const github = document.getElementById("github");
const themeToggler = [...document.getElementsByClassName("theme-toggle")];
const progressTime = document.getElementById("progress-time");
const minimizer = document.querySelector(".minimizer");
const maximizer = document.querySelector(".maximizer");
const closer = document.querySelector(".closer");
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
const debug = document.getElementById("debug");
const inputs = [...document.getElementsByClassName("input")];
const inputElements = [...document.getElementsByClassName("cycle")];

/* Default values */
const preferences = {
  url: "",
  depth: "100",
  dwt: "3000",
  concurrency: "12",
  folder: "",
  recursive: true,
  clean: false,
  "use-index": true,
  "create-zip": false,
  "create-sitemap": true,
  "create-log": true,
  "create-progresslog": false,
  ...fromStore("dwnldr_preferences")  ||  {}
};

const tooltips = {
  tooltips: {
    url: "The web address of the site you want to download.\nHistory: Navigate with [ArrowUp]/[ArrowDown]\n         [Delete]: Remove entry from history.",
    depth: "The depth of links to consider.\n\n0 - 100 (100)",
    recursive: "If enabled, links on downloaded HTML pages will be searched and any files found there will also be downloaded. (Enabled)",
    "create-zip": "If enabled, a ZIP archive containing the entire website will be created after downloads are complete. (Disabled)",
    "create-sitemap": "If enabled, a sitemap (sitemap.json) will be created inside the target folder after downloads are complete. (Enabled)",
    "create-log": "If enabled, a log file (log.json) containing all error messages will be created inside the target folder after downloads are complete. (Enable)",
    "create-progresslog": "If enabled, a progress log file (progress.log) containing the progress list will\nbe created inside the target folder after downloads are complete. (Disabled)",
    clean: "If enabled, the target folder will be cleared before downloading. (Disabled)",
    "use-index": "If no file extension is found at the end of a path, the filename is assumed as 'index.html'. (Enabled)",
    concurrency: "Determines how many downloads run simultaneously.\n\n2 - 50 (12)",
    dwt: "The time (in ms) to wait after parsing an HTML file for dynamically loaded content to be called.\n\n500 - 30000 (3000)",
    folder: "Select a folder in which to save the downloaded web pages.\nClick - Enter the path manually.\nDoubleclick - Open 'Select folder' dialog.\n\nEach folder path you enter here, will be added to the history.\n\nArrowUp/ArrowDown - Navigate through history.\nDelete - Remove entry from history.",
    github: "View source on GitHub",
    light: "Set Light Mode",
    dark: "Set Dark Mode",
    debug: "Enable Debug Mode. An additional modal window opens while downloading. It shows more detailed information about what happens in the background."
  }, title: {
    minimizer: "Minimize",
    maximizer: "Maximize",
    closer: "Close"
  }
};

const restoreSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect x="5" y="14" width="28" height="28" fill="none" stroke-width="5" /><g stroke-width="4"><line x1="14" y1="14" x2="14" y2="5" /><line x1="14" y1="5" x2="42" y2="5" /><line x1="42" y1="5" x2="42" y2="34" /><line x1="42" y1="34" x2="32" y2="34" /></g></svg>`;
const maximizeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect x="5" y="5" width="38" height="38" fill="none" stroke-width="5"/></svg>`;

const httpRegex = /^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)$/;
const storedTheme = storage.theme;

/* Activate history of the text input fields 'URL' and 'Target Folder' */
const urlHistory = new History("url");
const folderHistory = new History("folder");

const modal = new Modal({ isClosable: () => !downloadInProgress, title: "Debug Log", footerText: "Website Downloader", logType: "div" });

modal.button({
  label: "Save Log",
  showOn: () => !modal.isEmpty() && !downloadInProgress,
  onClick: () => {
    const a = document.createElement("a");
    const file = new Blob([modal.text()], { type: "text/plain" });
    a.href = URL.createObjectURL(file);
    a.download = "debug.log";
    a.click();
    URL.revokeObjectURL(a.href);
  },
  parent: "footer"
});

modal.button({
  label: "Clear Log",
  showOn: () => !modal.isEmpty() && !downloadInProgress,
  onClick: () => modal.clear(),
  parent: "footer"
});

api.unmaximize();

debug.parentElement.style.display = "none";

setTheme(storedTheme || matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

/* Add tooltips and restore the previous state of the input elements */
for (const [id, content] of Object.entries(tooltips.tooltips)) document.getElementById(`${id}-label`).dataset.tooltip = content;
for (const [id, content] of Object.entries(tooltips.title)) document.getElementById(`${id}-label`).title = content;
for (const [id, val] of Object.entries(preferences)) { const el = document.getElementById(id); el && (el[el.type === "checkbox" ? "checked" : "value"] = val); }

/* Event Handling */
for (const el of themeToggler) el.addEventListener("click", () => setTheme(el.id));
for (const el of [concurrency, depth, dwt]) (updateValue(el), el.addEventListener('input', updateValue));
for (const el of inputs) el.addEventListener("change", storeValues);
for (const el of inputElements) {
    el.addEventListener("focus", function() {
        this.classList.add("active");
    });
    el.addEventListener("blur", function () {
        this.classList.remove("active");
    });
}

document.addEventListener("keydown", keyDown);
github.addEventListener("click", () => open("https://github.com/ManuelPeh76/Website-Downloader"));
start.addEventListener("click", startDownload);
abort.addEventListener("click", abortDownload);
pause.addEventListener("click", pauseDownload);
minimizer.addEventListener("click", minimize);
maximizer.addEventListener("click", maximize);
folder.addEventListener("dblclick", selectFolder);
folder.addEventListener("blur", changeFolder);
folder.addEventListener("focus", () => previousFolder = folder.value);
closer.addEventListener("click", api.quit);

/* Functions */

function toStore(item, value) {
  storage[item] = JSON.stringify(value);
  return value;
}

function fromStore(item) {
    try {
        return JSON.parse(storage[item]);
    } catch {
        return false;
    }
}

function noValidUrl() {
    logMessage("[CLS]❌ Please enter a valid URL!");
    url.focus();
    return false;
}

function createQuery() {
  return {
    url: url.value,
    depth: depth.value,
    zip: createZip.checked,
    clean: clean.checked,
    useIndex: useIndex.checked,
    recursive: recursive.checked,
    folder: folder.value.trim(),
    concurrency: parseInt(concurrency.value, 10),
    dwt: parseInt(dwt.value, 10),
    debug: debug.checked,
    sitemap: createSitemap.checked,
    log: createLog.checked
  };
}

function logProgress(msg) {
  progress.innerHTML = msg;
}

function logTotal(msg) {
  totalLinks.innerHTML = msg.replace(/TLF/, "");
}

function logDev(msg) {
  modal.add(msg);
}

function logMessage(msg) {
  msg.startsWith("[CLS]") && (log.innerHTML = "", msg = msg.substring(5));
  if (msg.startsWith("***")) msg = `<br><font size="3"><b>${msg}</b></font>`;
  if (!msg.startsWith("🌐") || (msg.startsWith("🌐") && !log.innerHTML.includes(msg.replace(/\n/g, "")))) log.innerHTML += msg.replace(/\n/g, "<br>");
  if (log.scrollHeight - log.scrollTop < 400) log.scrollTop = log.scrollHeight;
}

function minimize() {
    minimizer.blur();
    api.minimize();
}

async function maximize(){
    await api.maximize() ? (
        maximizer.innerHTML = restoreSvg,
        maximizer.title = "Restore"
    ) : (
        maximizer.innerHTML = maximizeSvg,
        maximizer.title = "Maximize"
    );
}

/**
 * @function keyDown
 * @param {KeyboardEvent} e - The keyboard event triggered on a keydown action.
 */
function keyDown(e) {

    /* Navigating and setting up the tool via keys */
    if (
      (["Tab", "Enter"].includes(e.key) && !downloadInProgress) ||
      (["Escape", "p"].includes(e.key) && downloadInProgress) ||
      (e.ctrlKey && ("Ddl".includes(e.key)))
    ) e.preventDefault();

    /* Navigate through the input fields using the Tab key (backwards with Shift+Tab). */
    if (e.key === "Tab" && !downloadInProgress) {
        if (!document.querySelector(".active")) return inputElements[0].focus();
        let active = inputElements.indexOf(document.querySelector(".active"));
        inputElements[active].blur();
        active += (e.shiftKey ? -1 : 1);
        active = active >= inputElements.length ? 0 : active < 0 ? inputElements.length - 1 : active;
        inputElements[active].focus();
    }
    /* Next are self explaining */
    else if (e.key === "Enter" && !downloadInProgress) startDownload();
    else if (e.key === "Escape") {
        downloadInProgress ? abortDownload() : modal.isOpen() ? modal.hide() : document.querySelector(".active")?.blur();
    }
    else if (e.key === "a" && e.ctrlKey && downloadInProgress && debug.checked) {
      e.preventDefault();
      api.getActiveHandles();
    }
    else if (e.key === "p" && downloadInProgress) pauseDownload();
    else if (e.key === "l" && e.ctrlKey) root.setAttribute("data-theme", (storage.theme = "light"));
    else if (e.key === "d" && e.ctrlKey) root.setAttribute("data-theme", (storage.theme = "dark"));

    else if (e.key === "s" && e.ctrlKey && !downloadInProgress) selectFolder();
    if (e.key === "D" && e.ctrlKey && !downloadInProgress) {
      debug.parentElement.style.display = "";
      debug.checked = !debug.checked;
    }
}

/**
 * Updates the visible values of the range sliders.
 *
 * @param {Element|*} el - The element whose value is used for updating the label.
 */
function updateValue(el) {
  const This = el instanceof Element ? el : this;
  This.nextElementSibling.textContent = This.value;
}


/**
 * Stores the value of a changed input field persistantly to the preferences.
 *
 * @function storeValues
 * @this {HTMLInputElement} The HTML input element that triggered the event.
 *                          For checkboxes, its checked property is stored; for other
 *                          input types, its value property is used.
 */
function storeValues() {
    preferences[this.id] = this.type === "checkbox" ? this.checked : this.value;
    toStore("dwnldr_preferences", preferences);
}

/**
 * Opens a folder selection dialog and stores the selected folder path persistently.
 *
 * @async
 * @function selectFolder
 * @returns {Promise<void>}
 */
async function selectFolder() {
    if (downloadInProgress) return;
    const dir = await api.selectFolder();
    if (dir) {
        folder.value = dir;
        preferences.folder = dir;
        toStore("dwnldr_preferences", preferences);
        folderHistory.toHistory(dir);
    }
}

/**
 * Upon editing the download folder path manually, this function stores the folder path persistently.
 *
 * @function changeFolder
 * @returns {void}
 */
function changeFolder() {
  if (downloadInProgress) return;
  if (folder.value && folder.value !== previousFolder) {
    preferences.folder = folder.value;
    toStore("dwnldr_preferences", preferences);
  }
}

/* Prepare the UI for starting the download process */
function prepareDownloadStart() {
    if (debug.checked) modal.clear().show();
    log.innerHTML = "";
    progress.innerHTML = "";
    totalLinks.innerHTML = "0";
    progressTime.innerHTML = "00:00:00";
    setButtons();
    startTime = Date.now();
    downloadTimer = setInterval(printTime, 1000);
}

/**
 * Start the download process
 *
 * @async
 * @function startDownload
 * @returns {Promise<void>}
 */
async function startDownload() {
  if (!await validateUserInput()) return;
  const query = createQuery();
  prepareDownloadStart();
  logMessage("*** STARTING DOWNLOAD ***<br>");
  loggingEnabled = true;
  api.startDownload(query);
  downloadInProgress = true;
  loggingIsLinked || api.onLog(onLog);
  loggingIsLinked = true;
}

/**
 * Processes an incoming log message by separating concatenated log segments.
 *
 * If the log message contains the finished icon "🕧", the function performs cleanup operations.
 *
 * @function onLog
 * @param {string} msg - The log message potentially containing multiple segments joined together.
 */
function onLog(msg) {
  if (!msg || !loggingEnabled) return;
  let finished = false;
  msg = msg // Insert markers (!!)
    .replace(/🌐/g, "!!🌐")
    .replace(/📄/g, "!!📄")
    .replace(/🏠/g, "!!🏠")
    .replace(/🏁/g, "!!🏁")
    .replace(/🕧/g, "!!🕧")
    .replace(/\*\*\* /g, "!!*** ")
    .replace(/TLF/g, "!!TLF")
    .replace(/debug:/g, "!!debug:")
    .split("!!") // Split the messages at marker positions
    .filter(Boolean); // No empty entries

    // Forward each segment to the appropriate logging function
  for (let m of msg) {
    m.startsWith("🏠") ? logProgress(m) :
    m.startsWith("TLF") ? logTotal(m) :
    m.startsWith("debug:") ? logDev(m.slice(6)) :
    logMessage(m);
    m.startsWith("🕧") && (finished = true);
  }

  // If the download is finished, perform cleanup operations
  if (finished) {
    downloadInProgress = false;
    resetButtons();
    clearInterval(downloadTimer);
    if (createProgresslog.checked) api.saveProgress(log.innerHTML.replace(/<br>/g, "\n").replace(/<.*?>/g, ""));
    setTimeout(() => loggingEnabled = false, 1000);
  }
}

function abortDownload() {
  if (!downloadInProgress) return;
  clearInterval(downloadTimer);
  document.getElementById("paused")?.remove();
  log.innerHTML += '<font size="3"><b>*** ABORTED BY USER ***</b></font><br>';
  resetButtons();
  downloadInProgress = false;
  api.abortDownload();
  setTimeout(() => (loggingEnabled = 0), 1000);
}

function pauseDownload() {
  if (!downloadInProgress) return;
  if (pause.textContent === "Pause") {
    log.innerHTML += "<span id='paused'>⏸️<b> Downloading paused...</b><br></span>";
    pause.textContent = "Resume";
    clearInterval(downloadTimer);
    tempTime = Date.now();
    return api.pauseDownload();
  }
  startTime += Date.now() - tempTime;
  downloadTimer = setInterval(printTime, 1000);
  document.getElementById("paused").remove();
  pause.innerText = "Pause";
  api.resumeDownload();
}

function setTheme(mode) {
  root.setAttribute("data-theme", mode);
  storage.theme = mode;
}

// Enable inputs and buttons in idle
function resetButtons() {
  inputs.forEach((input) => (input.disabled = false));
  start.disabled = false;
  pause.disabled = true;
  abort.disabled = true;
  folder.disabled = false;
  pause.textContent = "Pause";
}

// Disable inputs and buttons while downloading
function setButtons() {
  inputs.forEach((input) => (input.disabled = true));
  start.disabled = true;
  pause.disabled = false;
  abort.disabled = false;
  folder.disabled = true;
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
  let response;

  if (dwt.value < 500) dwt.value = (corrected.dwt = 500);
  if (dwt.value > 30000) dwt.value = (corrected.dwt = 30000);

  if (concurrency.value < 2) concurrency.value = (corrected.concurrency = 2);
  if (concurrency.value > 50) concurrency.value = (corrected.concurrency = 50);

  if (!httpRegex.test(url.value)) {
    if (httpRegex.test(`http://${url.value}`)) {
      response = await fetch("https://" + url.value, { method: "HEAD" });
      if (response.ok) url.value = corrected.url = `https://${url.value}`;
      else {
        response = await fetch("http://" + url.value, { method: "HEAD" });
        if (response.ok) url.value = corrected.url = `http://${url.value}`;
        else return noValidUrl();
      }
    } else return noValidUrl();
  } else {
    response = await fetch(url.value, { method: "HEAD" });
    if (!response.ok) return noValidUrl();
  }
  if (Object.keys(corrected).length) {
    for (let val in corrected) preferences[val] = corrected[val];
    storage.dwnldr_preferences = JSON.stringify(preferences);
  }
  return true;
}

