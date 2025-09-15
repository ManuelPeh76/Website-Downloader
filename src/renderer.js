/*  Website Downloader

    File: renderer.js
    Copyright © 2025 By Manuel Pelzer
    MIT License
*/

let isStarted = 0;
let startTime, tempTime;
let isInit = 0;
let canLog = 0;
let doScroll = true;
let interval, isMaximized;

if (!window.api) window.api = {
  maximize: () => {},
  minimize: () => {},
  unmaximize: () => {},
  startDownload: args => console.log(args),
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
const zip = document.getElementById("zip");
const clean = document.getElementById("clean");
const useIndex = document.getElementById("use-index");
const totalLinks = document.getElementById("total-links");

const httpRegex = /^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)$/;

const root = document.documentElement;
const storedTheme = localStorage.theme;
const obj = localStorage.downloader_obj ? JSON.parse(localStorage.downloader_obj) : {};
const logProgress = msg => (progress.innerHTML = msg);
const logTotal = msg => totalLinks.innerHTML = msg.replace(/TLF/, "");
const logMessage = msg => {
  if (msg.startsWith("***")) msg = `<br><font size="3"><b>${msg}</b></font>`;
  log.innerHTML += msg.replace(/\n/g, "<br>");
  if (log.scrollHeight - log.scrollTop < 400) log.scrollTop = log.scrollHeight;
};

const printTime = () => {
  const now = Date.now() - startTime;
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
  concurrency: "Determines how many downloads run simultaneously.\nMin: 1, Max: 25, Default: 8",
  dwt: "The time (in ms) to wait after calling an HTML file to see if any content is dynamically loaded.\nMin: 500, Max: 30000, Default: 3000",
  outdir: "Select a folder in which to save the downloaded web pages. Each downloaded page will have a separate folder derived from the page's URL. For example, for the URL 'https://example.com', a folder named 'example.com' would be created.",
  github: "View source on GitHub",
  light: "Set Light Mode",
  dark: "Set Dark Mode",
};

Object.entries(title).forEach(([id, content]) => document.getElementById(`${id}-label`).setAttribute("data-tooltip", content));

minimizer.title = "Minimize";
maximizer.title = "Maximize";
closer.title = "Close";

if (obj.url) url.value = obj.url;
if (obj.depth) depth.value = obj.depth;
if (obj.dwt) dwt.value = obj.dwt;
if (obj.concurrency) concurrency.value = obj.concurrency;
if (obj.recursive) recursive.checked = obj.recursive;
if (obj.zip) zip.checked = obj.zip;
if (obj.clean) clean.checked = obj.clean;
if (obj.outdir) outdir.value = obj.outdir;
if (obj["use-index"]) useIndex.checked = obj["use-index"];

// Theme Toggle Logic
if (storedTheme) setTheme(storedTheme);
else {
  const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(prefersDark ? "dark" : "light");
}

api.unmaximize();

//
// Event Listeners
//

//Store values in the local storage if they change
inputs.forEach((el) => {
  el.addEventListener("change", function () {
    const name = this.id;
    const value = this.type === "checkbox" ? this.checked : this.value;
    obj[name] = value;
    localStorage.downloader_obj = JSON.stringify(obj);
  });
});

// Toggle Theme
themeToggler.forEach((el) =>
  el.addEventListener("click", function () {
    setTheme(this.id);
  })
);

github.addEventListener("click", () =>
  open("https://github.com/ManuelPeh76/Website-Downloader")
);

// Prepare to start downloading
start.addEventListener("click", async () => {
  const query = {
    url: url.value,
    depth: depth.value,
    zip: zip.checked,
    clean: clean.checked,
    useIndex: useIndex.checked,
    recursive:recursive.checked,
    outdir: outdir.value.trim(),
    concurrency: parseInt(concurrency.value, 10),
    dwt: parseInt(dwt.value, 10)
  };

  if (query.dwt < 500) dwt.value = query.dwt = 500;
  if (query.dwt > 30000) dwt.value = query.dwt = 30000;

  if (query.concurrency < 2) concurrency.value = query.concurrency = 2;
  if (query.concurrency > 25) concurrency.value = query.concurrency = 25;

  if (!query.url.startsWith("http")) {
    if (httpRegex.test("https://" + query.url)) {
      let response;
      response = await fetch("https://" + query.url, { method: 'HEAD' });
      if (response.ok) {
        query.url = url.value = obj.url =  "https://" + query.url;
        localStorage.downloader_obj = JSON.stringify(obj);
      } else {
        response = await fetch("http://" + query.url, { method: 'HEAD' });
        if (response.ok) {
          query.url = url.value = obj.url = "http://" + query.url;
          localStorage.downloader_obj = JSON.stringify(obj);
        } else return (logMessage("<br>❌ Please enter a valid URL!"), url.focus());
      }
    } else return (logMessage("<br>❌ Please enter a valid URL!"), url.focus());
  }

  log.innerHTML = "";
  progress.innerHTML = "";

  setButtons();
  startTime = Date.now();
  progressTime.innerHTML = "00:00:00";
  interval = setInterval(printTime, 1000);
  logMessage("*** STARTING DOWNLOAD ***<br>");
  canLog = 1;
  api.startDownload(query);
  if (isStarted) return;
  isStarted = 1;
  if (isInit) return;

  // Redirection of console.log
  api.onLog((msg) => {
    if (!msg || !canLog) return;
    // If console.log() is called multiple times within a short period of time,
    // all strings are automatically chained into a single string and sent at once.
    // Therefore, it is necessary to separate them again to display them correctly.
    // This is the purpose of the following lines of code.
    msg = msg
      .replace(/🌐/g, "!!🌐")
      .replace(/🏠/g, "!!🏠")
      .replace(/❌/g, "!!❌")
      .replace(/\*\*\* /g, "!!*** ")
      .replace(/TLF/g, "!!TLF")
      .split("!!")
      .filter((e) => e);
    // Walk through all messages and display them.
    for (let m of msg) m.startsWith("🏠") ? logProgress(m) : m.startsWith("TLF") ? logTotal(m) : logMessage(m);

    // If '🕧' (Finished icon) is found, reset the GUI and save the content of the Log DIV element.
    if (msg.join("").includes("🕧")) {
      isStarted = 0;
      canLog = 0;
      resetButtons();
      clearInterval(interval);
      api.saveProgress(
        log.innerHTML.replace(/<br>/g, "\n").replace(/<.*?>/g, "")
      );
    }
  });
  isInit = 1;
});

// Handle user initiated abort of download
abort.addEventListener("click", async () => {
  if (!isStarted) return;
  clearInterval(interval);
  document.getElementById("paused")?.remove();
  log.innerHTML += '<font size="3"><b>*** ABORTED BY USER ***</b></font><br>';
  resetButtons();
  isStarted = 0;
  api.abortDownload();
  setTimeout(() => (canLog = 0), 1000);
});

// Handle user initiated pause
// TODO: Still problematic, since the browser instances could be dead when resuming.
pause.addEventListener("click", () => {
  if (!isStarted) return;
  if (pause.textContent === "Pause") {
    log.innerHTML +=
      "<span id='paused'>⏸️<b> Downloading paused...</b><br></span>";
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
});

// Target folder selection
outdir.addEventListener("click", async () => {
  if (isStarted) return;
  const folder = await api.selectFolder();
  if (folder) {
    outdir.value = folder;
    obj.outdir = folder;
    localStorage.downloader_obj = JSON.stringify(obj);
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

function setTheme(mode) {
  root.setAttribute("data-theme", mode);
  localStorage.theme = mode;
}

// Enable inputs and buttons
function resetButtons() {
  inputs.forEach((input) => (input.disabled = false));
  start.disabled = false;
  pause.disabled = true;
  abort.disabled = true;
  outdir.disabled = false;
  pause.textContent = "Pause";
}

// Disable inputs and buttons
function setButtons() {
  inputs.forEach((input) => (input.disabled = true));
  start.disabled = true;
  pause.disabled = false;
  abort.disabled = false;
  outdir.disabled = true;
  pause.textContent = "Pause";
}

/**
 @ Contextmenu
 *
 * @param  {string}     item
 * @param  {attribute}  class
 * @param  {array}      submenu
 * @return {Element}    The DOM representation of the contextmenu
 *
 * Created in 2022 by Manuel Pelzer
 * There is no copyright, use and alter as needed
 *
 * How to use
 * ==========
 *
 * const contextMenu = new ContextMenu([
 *
 *   // menu entries:
 *   [entry name, id, className, title text, callback, action key],
 *   [entry2 name, id, className, title text, callback, action key],
 *   ["separator"], // Creates a horizontal line between entries
 *
 *   // menu entry with submenu:
 *   [entry3 name, id, [

 *     // submenu array:
 *     [subentry name, id, className, title text, callback, action key],
 *     ...
 *   ]]
 * ];
 *
 * The callback function of a menu entry will be called, when
 * the contextmenu is open and the action key of that entry is pressed
 *
 */

const ContextMenu = (function () {
  const each = (items, cb) =>
    items.constructor === Object
      ? Object.entries(items).forEach(([key, value], index) =>
          cb(key, value, index)
        )
      : [...items].forEach((key, index) => cb(key, index));

  const tag = function tag() {
    const args = Array.isArray(arguments[0]) ? arguments[0] : [...arguments];
    let element, k, v;
    args.length === 1 &&
      typeof args[0] === "string" &&
      (args[0] = { [args[0]]: {} });
    each(args, (arg, i) => {
      let parent;
      arg = Object.keys(arg);
      const attr = args[i][arg[0]];
      if (arg[1]) {
        parent = args[i][arg[1]];
        if (arg[0] === "text")
          return parent.appendChild(document.createTextNode(args[i][arg[0]]));
        if (arg[0] === "comment")
          return parent.appendChild(document.createComment(args[i][arg[0]]));
      }
      element = document.createElement(arg[0]);
      attr &&
        each(attr, (key, value) => {
          key === "children"
            ? each(value, (child) =>
                child.constructor.name === "Object"
                  ? tag({ ...child, parent: element })
                  : element.append(child)
              )
            : key === "dataset"
            ? each(value, (k, v) => (element.dataset[k] = v))
            : key === "text"
            ? element.appendChild(document.createTextNode(value))
            : key === "comment"
            ? element.appendChild(document.createComment(value))
            : key === "html"
            ? (element.innerHTML += value)
            : key === "for"
            ? (element.htmlFor = value)
            : key === "style"
            ? typeof value === "object"
              ? each(value, (k, v) => (element.style[k] = v))
              : each(
                  value.split(";"),
                  (entry) =>
                    (element.style[
                      toCamelCase(
                        ([k, v] = entry.split(":").map((e) => e.trim())),
                        k
                      )
                    ] = v)
                )
            : (element[key] = value);
        });
      parent && parent.appendChild(element);
    });
    return element;
  };

  const toCamelCase = (str) => str.replace(/-(\w)/g, (e, f) => f.toUpperCase());
  const rect = (element) => element.getBoundingClientRect();

  class cm {
    constructor(arr) {
      this.originalArray = arr;
      this.init();
    }

    elements = [];
    originalArray = null;
    menuElement = null;
    subElements = [];
    parents = [];
    isInit = false;
    styleElement = null;

    destroy = function () {
      const menu = document.querySelector("menu");
      document.oncontextmenu = null;
      document.onkeydown = null;
      menu && menu.remove();
      this.styleElement.remove();
      this.elements = [];
      this.subElements = [];
      this.parents = [];
      this.menuElement = null;
      this.styleElement = null;
      this.isInit = false;
    };

    keysOn = function () {
      document.onkeydown = this.events("keys");
    };

    keysOff = function () {
      document.onkeydown = null;
    };

    addChild = function (menu, child) {
      let parent;
      child === null || child === undefined
        ? ((parent = this.menuElement), (child = menu))
        : (parent = this.parents[menu]);
      const element = this.addItem(child);
      parent.appendChild(element);
      child.length > 3 &&
        (child === menu
          ? this.elements.push(element)
          : this.subElements.push(element));
    };

    removeChild = function (menu, item) {
      let parent, child;
      if (
        typeof menu === "string" &&
        !item &&
        document.getElementById("" + menu)
      ) {
        child = document.getElementById("" + menu);
        if (this.elements.includes(child))
          this.elements.splice(this.elements.indexOf(child), 1);
        else this.subElements.splice(this.subElements.indexOf(child), 1);
      } else if (typeof menu === "number" && !item) {
        child =
          this.elements.length > menu && menu >= 0 ? this.elements[menu] : null;
        if (!child) return;
        this.elements.splice(menu, 1);
      } else {
        child =
          this.parents.length > menu &&
          menu >= 0 &&
          this.parents[menu].children.length > item &&
          item >= 0
            ? this.parents[menu].children[item]
            : null;
        if (!child) return;
        this.subElements.splice(this.subElements.indexOf(child), 1);
      }
      child && child.parentElement.removeChild(child);
    };

    init() {
      if (!this.originalArray) return;
      this.menuElement = this.createContextMenu(
        this.originalArray,
        document.body
      );
      this.styleElement = tag({
        style: { text: "" /*this.style()*/ },
        parent: document.head,
      });
      this.menuElement.style.top = "-300px";
      document.oncontextmenu = this.events("contextmenu");
      document.onkeydown = this.events("keys");
      this.isInit = true;
    }

    events(e) {
      return e === "contextmenu"
        ? (event) => this.onContextMenu.call(this, event)
        : e === "contextmenuout"
        ? (event) => this.onContextmenuOut.call(this, event)
        : e === "keys"
        ? (event) => this.onKey.call(this, event)
        : e === "keyson"
        ? (event) => this.keysOn.call(this, event)
        : e === "keysoff"
        ? (event) => this.keysOff.call(this, event)
        : null;
    }

    addItem(item) {
      const [content, id, cl, title, onclick, key] = item;
      return tag({
        li: {
          id: `cm_${id}`,
          classList: "cm-item",
          title,
          onclick,
          children: [
            {
              button: {
                id,
                classList: "cm-btn " + cl,
                children: [
                  { i: { classList: "cm-i " + id } },
                  { span: { classList: "cm-text", html: content } },
                  { span: { classList: "cm-key", text: key || "" } },
                ],
              },
            },
          ],
        },
      });
    }

    addSubItem(item) {
      const [content, cl, arr] = item;
      const parent = tag({
        li: {
          classList: "cm-item submenu",
          children: [
            {
              button: {
                classList: "cm-btn",
                children: [
                  { i: { classList: "cm-i " + cl } },
                  { span: { classList: "cm-text", html: content } },
                ],
              },
            },
          ],
        },
      });
      const subMenu = this.createContextMenu(arr, parent);
      this.parents.push(subMenu);
      parent.append(subMenu);
      return parent;
    }

    addSeparator() {
      return tag({ li: { classList: "cm-separator" } });
    }

    createContextMenu(arr, parent) {
      const menu = tag({ menu: { classList: "cm" }, parent });
      each(arr, (args) => {
        const child = [
          0,
          this.addSeparator,
          0,
          this.addSubItem,
          this.addItem,
          this.addItem,
          this.addItem,
        ][args.length].call(this, args);
        args.length > 3 &&
          (parent === document.body
            ? this.elements.push(child)
            : this.subElements.push(child));
        menu.append(child);
      });
      return menu;
    }

    showMenu(e) {
      const box = rect(this.menuElement),
        submenus = this.parents,
        doc = document.documentElement;

      let left, top, boxWidth, boxHeight;

      // CALCULATE THE POSITION FOR THE CONTEXTMENU TO SHOW UP
      boxWidth =
        e.screenX + box.width > innerWidth - 30
          ? e.screenX + box.width - innerWidth
          : 0;
      boxHeight =
        e.y + box.height > innerHeight - 20
          ? e.y + box.height - innerHeight
          : 0;
      left = parseInt(e.x - boxWidth + doc.scrollLeft);
      top = parseInt(e.y - boxHeight + doc.scrollTop);

      // SET THE POSITION OF THE MENU BOX
      this.menuElement.style.top = top + "px";
      this.menuElement.style.left = left + "px";

      // AND DON'T WE FORGET ABOUT THE SUBMENU BOXES, THEY ALSO NEED TO BE POSITIONED
      each(submenus, (a) => {
        let subbox = rect(a);
        a.style.top =
          e.y + subbox.height > innerHeight - 20 ? "unset" : "-10px";
        a.style.left =
          e.screenX + box.width + subbox.width > innerWidth - 30
            ? "unset"
            : "96%";
        a.style.right =
          e.screenX + box.width + subbox.width > innerWidth - 20
            ? box.width - 10 + "px"
            : "unset";
        a.style.bottom =
          e.y + subbox.height > innerHeight - 20 ? "-10px" : "unset";
        // Check if a submenu is larger than top or bottom or the screen and correct its position if needed
        (subbox.top < 0 || subbox.height + subbox.top > innerHeight) &&
          ((a.style.top = boxHeight ? "unset" : `-${subbox.top}px`),
          (a.style.bottom = boxHeight
            ? `${subbox.bottom - innerHeight}px`
            : "unset"));
      });
      // ...and finally show the contextmenu
      this.menuElement.classList.add("show-cm");
    }

    onContextMenu(e) {
      e.preventDefault();
      this.showMenu(e);
      document.onclick = this.events("contextmenuout");
      this.events("keyson");
    }

    onContextmenuOut(e) {
      // CHECK IF THE CONTEXTMENU NEEDS TO BE CLOSED OR NOT
      ((e.target.closest("button") && e.target.closest("button").id) ||
        !e.target.closest("menu")) &&
        (e.preventDefault(),
        e.stopPropagation(),
        document.querySelector(".show-cm")?.classList.remove("show-cm"),
        (document.onclick = null),
        this.events("keysoff"));
    }

    onKey(e) {
      if (!this.menuElement?.classList.contains("show-cm")) return;
      e.preventDefault();
      e.stopPropagation();
      const key = e.key;
      const [element] = [
        ...this.menuElement.querySelectorAll(".cm-key"),
      ].filter((el) => el.textContent === key);
      element &&
        element.closest("li").onclick &&
        element.closest("li").onclick();
      this.menuElement.classList.remove("show-cm");
      document.onclick = null;
    }

    style() {
      return [
        ".cm{position:absolute;min-width:150px;padding:2px;margin:0;border:1px solid #bbb;background-color:#eee;background-image:linear-gradient(to bottom,#fff 0%,#e5e5e5 100px,#e5e5e5 100%);z-index:20000000001;border-radius:3px;box-shadow:1px 1px 4px rgba(0,0,0,.2);opacity:0;transition:transform 0.1s ease-out,opacity 0.1s ease-out;pointer-events:none;}",
        ".cm-item{display:block;position:relative;margin:0;padding:0;white-space:nowrap;}",
        ".cm-btn{line-height:8px;overflow:visible;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;display:flex;width:100%;color:#444;font-family:'Roboto',sans-serif;font-size:13px;text-align:left;align-items:center;cursor:pointer;border:1px solid transparent;white-space:nowrap;padding:8px 8px;border-radius:3px;}",
        ".cm-btn::-moz-focus-inner,.cm-btn::-moz-focus-inner{border:0;padding:0;}",
        ".cm-text{margin-left:25px;}",
        ".cm-btn i{position:absolute;left:8px;top:50%;-webkit-transform:translateY(-50%);transform:translateY(-50%);}",
        ".cm-item:hover > .cm-btn{color:#fff;outline:none;background-color:#2E3940;background-image:-webkit-linear-gradient(to bottom,#5D6D79,#2E3940);background-image:linear-gradient(to bottom,#5D6D79,#2E3940);border:1px solid #2E3940;}",
        ".cm-item.disabled{opacity:.5;pointer-events:none;}",
        ".cm-item.disabled .cm-btn{cursor:default;}",
        ".cm-separator{display:block;margin:7px 5px;height:0;border-bottom:1px solid #aaa;}",
        ".cm-item.submenu::after{content:'';position:absolute;right:6px;top:50%;-webkit-transform:translateY(-50%);transform:translateY(-50%);border:5px solid transparent;border-left-color:#808080;}",
        ".cm-item.submenu:hover::after{border-left-color:#fff;}",
        ".show-cm,.cm-item:hover > .cm{opacity:1;-webkit-transform:translate(0,0) scale(1);transform:translate(0,0) scale(1);pointer-events:auto;}",
        ".cm-item:hover > .cm{-webkit-transition-delay:100ms;transition-delay:300ms;}",
        ".cm-i{display:inline-block;margin:0;padding:0;height:16px;width:16px;text-align:center;z-index:1;}",
        ".cm-key {width:100%;text-align:right;text-transform:uppercase;opacity:0.5;}",
      ].join("");
    }
  }
  return cm;
})();

const cMenu = [
  ["New", "new_file", "", "", () => console.log("New"), "n"],
  ["Save", "save_project", "", "", () => console.log("Save"), "s"],
  ["Load", "load_project", "", "", () => console.log("Load")],
  ["separator"],
];

const contextmenu = new ContextMenu(cMenu);
