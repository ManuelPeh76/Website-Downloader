/**
 * @name Website Downloader
 * 
 * @author Manuel Pelzer
 * @file renderer.js
 * @copyright © 2025 By Manuel Pelzer
 * @license MIT
 */

"use strict";

const root = document.documentElement;
const storage = window.localStorage || {};

const toStore = (item, value) => (storage[item] = JSON.stringify(value), value);
const fromStore = item => { try { return JSON.parse(storage[item]); } catch { return false; }};

let downloadInProgress = false;
let startTime, tempTime;
let loggingIsLinked = false;
let loggingEnabled = false;
let downloadTimer;
let isMaximized;
let previousFolder;

/**
 * For testing purposes only
 *
 * window.api is part of the contextBridge and is added to the DOM by electron.
 * If you open this file inside a browser, there is no contextBridge, so I define api here
 * in order to test functionality inside the browser.
 */
if (!window.api) window.api = {
  maximize: () => logMessage("Maximize\n"),
  minimize: () => logMessage("Minimize\n"),
  unmaximize: () => logMessage("Unmaximize\n"),
  startDownload: args => logMessage("Start Download\n"),
  quit: () => logMessage("Quit\n"),
  saveProgress: () => logMessage("Save Progress\n"),
  resumeDownload: () => logMessage("Resume Download\n"),
  pauseDownload: () => logMessage("Pause Download\n"),
  abortDownload: () => logMessage("Abort Download\n"),
  selectFolder: () => logMessage("Select Folder\n"),
  onLog: () => logMessage("On Log\n")
};

/**
 * History
 *
 * Manages a per-input history stack with keyboard navigation and persistence to localStorage.
 * Attaches to an input/textarea element by id, intercepts its onchange and onkeydown handlers
 * (preserving any previously assigned handlers), and stores entered values in a history array
 * saved in localStorage.
 *
 * Usage:
 *   const h = new History('myInputId');
 *
 * Behavior summary:
 * - Records the element's value when it changes and persists the history.
 * - Up/Down arrow keys navigate back and forward through recorded values.
 * - Delete (while focused on the element) removes the currently selected value from history.
 * - clear() empties stored history; remove(e) removes the currently selected entry.
 *
 * @class
 *
 * @param {string} id - The id of the input/textarea element to attach history handling to.
 *
 * @property {string} id - The id passed to the constructor.
 * @property {(HTMLInputElement|HTMLTextAreaElement|null)} element - The DOM element found by id; null if not found.
 * @property {string[]} history - Array of stored values for this element (loaded from localStorage).
 * @property {number} pointer - Index into `history` representing the current selection; may be history.length - 1
 *                              when the currently shown value is the most recent entry or point at an empty value.
 * @property {(function|null)} oldOnChange - Previously assigned onchange handler on the element (if any).
 * @property {(function|null)} oldOnKeyDown - Previously assigned onkeydown handler on the element (if any).
 *
 * Public instance methods:
 *
 * @method add
 * @returns {History} this - Adds the current element value to the end of the history (if different from last entry),
 *                          updates the pointer to the new last index, and persists the history.
 * @method forward
 * @returns {History} this - Moves the pointer forward by one. If the pointer moves past the last stored entry,
 *                          the element's value is cleared and the pointer is clamped to history.length.
 * @method back
 * @returns {History} this - Moves the pointer back by one (clamped to 0) and sets the element's value to the
 *                          history entry at the new pointer.
 * @method clear
 * @returns {History} this - Clears the persisted history for this id (removes the localStorage key and empties
 *                          the in-memory history array), and resets the pointer to 0.
 * @method remove
 * @returns {History} this - Removes the last occurrence of the element's current value from history (if present),
 *                          updates/persists the history and pointer, and sets the element value to the new selected entry.
 * @method destroy
 * @returns {void} - Restores the element's original onchange handler and the document's original onkeydown handler,
 *                   clears internal history/pointer references, and detaches behavior.
 *
 * Notes:
 * - If no DOM element is found for the supplied id, the constructor returns early and the instance will not manage history.
 * - The class preserves and calls any previously attached onchange and onkeydown handlers for the element.
 * - The implementation assumes the element exposes a 'value' property (e.g., input or textarea).
 */

class History {
    oldOnChange = null;
    oldOnKeyDown = null;
    constructor(id) {
        this.id = id;
        this.element = document.getElementById(id);
        if (!this.element) return;
        this.history = this.#fromStore(`${id}-history`) || [];
        this.pointer = (this.element.value && this.history.includes(this.element.value) ? this.history.indexOf(this.element.value) : this.history.length - 1);
        this.#handleEvents();
        return this;
    }
    add = () => {
        if (this.history[this.history.length - 1] !== this.element.value) {
            this.history.push(this.element.value);
            this.pointer = this.history.length - 1;
            this.#toStore(`${this.id}-history`, this.history);
        }
        return this;
    }
    forward = () => {
        this.pointer += 1;
        if (this.pointer >= this.history.length) {
            this.pointer = this.history.length;
            this.element.value = "";
            return this;
        }
        this.element.value = this.history[this.pointer] || "";
        return this;
    }
    back = () => {
        this.pointer -= 1;
        if (this.pointer < 0) this.pointer = 0;
        this.element.value = this.history[this.pointer];
        return this;
    }
    clear = () => {
        localStorage[`${this.id}-history`] = "";
        this.history = [];
        this.pointer = 0;
        return this;      
    }
    remove = e => {
        if (!this.history.includes(this.element.value)) return this;
        e.preventDefault();
        this.pointer = this.history.lastIndexOf(this.element.value);
        this.history.splice(this.pointer, 1);
        if (this.pointer >= this.history.length) this.pointer = this.history.length - 1;
        this.#toStore(`${this.id}-history`, this.history.length ? this.history : "");
        this.element.value = this.history[this.pointer] || "";
        return this;
    }
    destroy = () => {
        this.element.onchange = this.oldOnChange;
        document.onkeydown = this.oldOnKeyDown;
        this.history = null;
        this.pointer = null;
        return;
    }
    #handleEvents() {
        this.oldOnChange = this.element.onchange;
        this.oldOnKeyDown = this.element.onkeydown;
        this.element.onkeydown = e => {
            this.#keyDown(e);
            this.oldOnKeyDown && this.oldOnKeyDown(e);
        }
        this.element.onchange = e => {
            this.add();
            this.oldOnChange && this.oldOnChange(e);
        }
    }
    #keyDown(e) {
        const key = e.key;
        const element = e.target;
        if (element !== this.element) return;
        if (["ArrowUp", "ArrowDown", "Delete"].includes(key)) e.preventDefault();
        if (key === "ArrowUp") this.back();
        else if (e.key === "ArrowDown") this.forward();
        else if (e.key === "Delete") this.remove(e);
    }
    #storage = window.localStorage || {};
    #toStore = (item, value) => {
        this.#storage[item] = JSON.stringify(value);
        return value;
    }
    #fromStore = item => {
        try {
            return JSON.parse(this.#storage[item]);
        } catch {
            return false;
        }
    }
}

/* DOM elements */
const progress = document.getElementById("progress-text");
const start = document.getElementById("start");
const log = document.getElementById("log");
const abort = document.getElementById("abort");
const pause = document.getElementById("pause");
const inputs = [...document.getElementsByClassName("input")];
const folder = document.getElementById("folder");
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
const inputElements = [...document.querySelectorAll(".cycle")];

const httpRegex = /^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)$/;

const storedTheme = storage.theme;

/* Activate history of the text input fields 'URL' and 'Target Folder' */
const history = [
    new History("url"),
    new History("folder")
];

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

const restoreSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><path d="M4,8H8V4H20V16H16V20H4V8M16,8V14H18V6H10V8H16M6,12V18H14V12H6Z" /></svg>`;
const maximizeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 550 550"><path d="M.3 89.5C.1 91.6 0 93.8 0 96L0 224 0 416c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-192 0-128c0-35.3-28.7-64-64-64L64 32c-2.2 0-4.4 .1-6.5 .3c-9.2 .9-17.8 3.8-25.5 8.2C21.8 46.5 13.4 55.1 7.7 65.5c-3.9 7.3-6.5 15.4-7.4 24zM48 224l416 0 0 192c0 8.8-7.2 16-16 16L64 432c-8.8 0-16-7.2-16-16l0-192z"/></svg>`;
const noValidUrl = () => (logMessage("[CLS]❌ Please enter a valid URL!"), url.focus(), false);
const createQuery = () => ({ url: url.value, depth: depth.value, zip: createZip.checked, clean: clean.checked, useIndex: useIndex.checked, recursive: recursive.checked, folder: folder.value.trim(), concurrency: parseInt(concurrency.value, 10), dwt: parseInt(dwt.value, 10), sitemap: createSitemap.checked, log: createLog.checked });
const logProgress = msg => progress.innerHTML = msg;
const logTotal = msg => totalLinks.innerHTML = msg.replace(/TLF/, "");
const logMessage = msg => {
  msg.startsWith("[CLS]") && (log.innerHTML = "", msg = msg.substring(5));
  if (msg.startsWith("***")) msg = `<br><font size="3"><b>${msg}</b></font>`;
  if (!msg.startsWith("🌐") || (msg.startsWith("🌐") && !log.innerHTML.includes(msg.replace(/\n/g, "")))) log.innerHTML += msg.replace(/\n/g, "<br>");
  if (log.scrollHeight - log.scrollTop < 400) log.scrollTop = log.scrollHeight;
}

const tooltips = {
  tooltips: {
    url: "The web address of the site you want to download.\nHistory: Navigate with [ArrowUp]/[ArrowDown]\n         [Delete]: Remove entry from history.",
    depth: "The depth of links to consider.\n\n0 - 100 (100)",
    recursive: "If enabled, links on downloaded HTML pages will be searched and any files found there will also be downloaded. (Enabled)",
    "create-zip": "If enabled, a ZIP archive containing the entire website will be created after downloads are complete. (Disabled)",
    "create-sitemap": "If enabled, a sitemap (sitemap.json) will be created inside the target folder after downloads are complete. (Enabled)",
    "create-log": "If enabled, a log file (log.json) containing all error messages will be created inside the target folder after downloads are complete. (Enable)",
    "create-progresslog": "If enabled, a progress log file (progress.log) containing the progress list will be created inside the target folder after downloads are complete. (Enabled)",
    clean: "If enabled, the target folder will be cleared before downloading. (Disabled)",
    "use-index": "If no file extension is found at the end of a path, the filename is assumed as 'index.html'. (Enabled)",
    concurrency: "Determines how many downloads run simultaneously.\n\n2 - 50 (12)",
    dwt: "The time (in ms) to wait after parsing an HTML file for dynamically loaded content to be called.\n\n500 - 30000 (3000)",
    folder: "Select a folder in which to save the downloaded web pages.\nClick - Enter the path manually.\nDoubleclick - Open 'Select folder' dialog.\n\nEach folder path you enter here, will be added to the history.\n\nArrowUp/ArrowDown - Navigate through history.\nDelete - Remove entry from history.",
    github: "View source on GitHub",
    light: "Set Light Mode",
    dark: "Set Dark Mode"
  }, title: {
    minimizer: "Minimize",
    maximizer: "Maximize",
    closer: "Close"
  }
};

api.unmaximize();

/* Theme Toggle Logic */
setTheme(storedTheme || matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

/* Add tooltips and restore the previous state of the input elements */
for (const [id, content] of Object.entries(tooltips.tooltips)) document.getElementById(`${id}-label`).dataset.tooltip = content;
for (const [id, content] of Object.entries(tooltips.title)) document.getElementById(`${id}-label`).title = content;
for (const [id, val] of Object.entries(preferences)) { const el = document.getElementById(id); el[el.type === "checkbox" ? "checked" : "value"] = val; }
for (const el of [concurrency, depth, dwt]) updateValue(el);

/* Event Handling */
for (const el of themeToggler) el.addEventListener("click", () => setTheme(el.id));
for (const el of [concurrency, depth, dwt]) el.addEventListener('input', updateValue);
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

/* Minimizes the app */
function minimize() {
    minimizer.blur();
    api.minimize();
}

/* Maximizes/restores the app */
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
    if ((["Tab", "Enter"].includes(e.key) && !downloadInProgress) || (["Escape", "p"].includes(e.key) && downloadInProgress)) e.preventDefault();
    
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
        if (downloadInProgress) abortDownload();
        else document.querySelector(".active")?.blur();
    } else if (e.key === "p" && downloadInProgress) pauseDownload();
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
  msg = msg // Insert markers (!!)
    .replace(/🌐/g, "!!🌐")
    .replace(/📄/g, "!!📄")
    .replace(/🏠/g, "!!🏠")
    .replace(/\*\*\* /g, "!!*** ")
    .replace(/TLF/g, "!!TLF")
    .split("!!") // Split the messages at marker positions
    .filter(e => e); // No empty entries
  // Forward each segment to the appropriate logging function
  for (let m of msg) m.startsWith("🏠") ? logProgress(m) : m.startsWith("TLF") ? logTotal(m) : logMessage(m);
  if (msg.join("").includes("🕧")) {
    downloadInProgress = false;
    loggingEnabled = 0;
    resetButtons();
    clearInterval(downloadTimer);
    if (createProgresslog.checked) api.saveProgress(log.innerHTML.replace(/<br>/g, "\n").replace(/<.*?>/g, ""));
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

