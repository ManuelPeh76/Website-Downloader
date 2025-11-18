 /**
 * @name Website Downloader
 *
 * @author Manuel Pelzer
 * @file download.js
 * @copyright © 2025 By Manuel Pelzer
 * @license MIT
 */

"use strict";

/* Load dependencies */
const fs = require('fs/promises');
const path = require('path');
const { existsSync, createWriteStream } = require('fs');
const https = require('https');
const http = require('http');
const puppeteer = require('puppeteer');
const JSZip = require('jszip');

/* Get arguments */
const args = process.argv.slice(2);

const TARGET_URL = args[0];
/* If no website url is found, exit the tool */
if (!TARGET_URL.startsWith("http")) {
  process.exit();
}

/* Check arguments */
const concArg = args.find(arg => arg.startsWith('--concurrency=') || arg.startsWith('-cc='));
const depthArg = args.find(arg => arg.startsWith('--depth=') || arg.startsWith('-d='));
const folderArg = args.find(arg => arg.startsWith('--folder=') || arg.startsWith('-f='));
const dynArg = args.find(arg => arg.startsWith('--dyn_wait_time=') || arg.startsWith('-dwt='));

const ZIP_EXPORT        = args.includes('--zip') || args.includes('-z');
const CLEAN_MODE        = args.includes('--clean') || args.includes('-c');
const RECURSIVE         = args.includes('--recursive') || args.includes('-r');
const USE_INDEX         = args.includes('--use-index') || args.includes('-u');
const CREATE_LOG        = args.includes('--log') || args.includes('-l');
const CREATE_SITEMAP    = args.includes('--sitemap') || args.includes('-s');
const IS_ELECTRON       = args.includes('--electron');
const DEBUG_MODE        = args.includes("--debug") || args.includes("-db");
const MAX_DEPTH         = depthArg ? parseInt(depthArg.split('=')[1], 10) : Infinity;
const CONCURRENCY       = concArg ? parseInt(concArg.split('=')[1], 10) : 8;
const DYNAMIC_WAIT_TIME = dynArg ? parseInt(dynArg.split('=')[1], 10) : 3000;
let   OUTPUT_DIR        = folderArg ? path.join(folderArg.split('=')[1].replace(/^["']|["']$/g, ''), new URL(TARGET_URL).hostname) : path.join(process.cwd(), new URL(TARGET_URL).hostname);

const START_TIME        = Date.now();
const HTTP_STATUS_CODES = { 100: "Continue", 101: "Switching Protocols", 102: "Processing", 103: "Early Hints", 200: "OK", 201: "Created", 202: "Accepted", 203: "Non-Authoritative Information", 204: "No Content", 205: "Reset Content", 206: "Partial Content", 207: "Multi-Status", 208: "Already Reported", 226: "IM Used", 300: "Multiple Choices", 301: "Moved Permanently", 302: "Found", 303: "See Other", 304: "Not Modified", 305: "Use Proxy", 307: "Temporary Redirect", 308: "Permanent Redirect", 400: "Bad Request", 401: "Unauthorized", 402: "Payment Required", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 406: "Not Acceptable", 407: "Proxy Authentication Required", 408: "Request Timeout", 409: "Conflict", 410: "Gone", 411: "Length Required", 412: "Precondition Failed", 413: "Payload Too Large", 414: "URI Too Long", 415: "Unsupported Media Type", 416: "Range Not Satisfiable", 417: "Expectation Failed", 418: "I'm a Teapot", 421: "Misdirected Request", 422: "Unprocessable Content", 423: "Locked", 424: "Failed Dependency", 425: "Too Early", 426: "Upgrade Required", 428: "Precondition Required", 429: "Too Many Requests", 431: "Request Header Fields Too Large", 451: "Unavailable For Legal Reasons", 500: "Internal Server Error", 501: "Not Implemented", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout", 505: "HTTP Version Not Supported", 506: "Variant Also Negotiates", 507: "Insufficient Storage", 508: "Loop Detected", 510: "Not Extended", 511: "Network Authentication Required" };
let   BROWSER = null;

OUTPUT_DIR = OUTPUT_DIR.replace(/\\/g, '/').replace(/\/+$/,''); // Normalize output dir (change to posix format (forward slashes) and remove trailing slashes)
const limit = pLimit(CONCURRENCY); // Set the number of download concurrency
const resourceMap = new Map(); // Contains all resource URLs together with the corresponding local addresses
const visited = new Set(); // List of the URLs of all saved HTML files
const sitemap = new Set(); // List of the local addresses of all downloaded files
const failed = new Set(); // Remember broken URLs
const tasks = []; // List of download tasks
const logs = []; // List of all errors occured in the process

let resourceMapSize = 0;
let visitedSize = 0;
let totalRequests = 0;


/* Debugging function */
// A debug mode can be switched on in the GUI. It shows more
// details on the processes in the background while crawling a page.
const debug = DEBUG_MODE && IS_ELECTRON ? msg => {
  msg = msg.startsWith("+") ? `<font color="green"><b>${msg.slice(1)}</b></font>`
  : msg.startsWith("-") ? `<font color="red"><b>${msg.slice(1)}</b></font>` : msg;
  logAsync(`debug:${msg}`);
} : ()=>{};

if(DEBUG_MODE) debugShowStartSettings();

// Handle incoming messages from the renderer process (renderer.js)
process.stdin.on('data', async data => {
  const command = data.toString().trim();
  if (command.startsWith('abort')) {
    debug("-Execution aborted by renderer process.");
    await finish(1);
    await BROWSER.close();
    process.exit();
  } else if (command.startsWith('save-progress:')) {
    debug("+Creating progress.log.");
    const progressLog = command.slice(14);
    await fs.writeFile(path.join(OUTPUT_DIR, 'progress.log'), progressLog);
  } else if (command.startsWith('get-active-handles')) {
    logActiveHandles();
  }
});

/* Functions */

/**
 * logActiveHandles
 *
 * Collects and emits information about currently active libuv handles and active I/O
 * requests using Node.js internal APIs. The collected items are passed to the
 * debug() function for inspection — useful when diagnosing why a process won't exit or
 * when tracking resource leaks.
 *
 * Important:
 * - This function uses undocumented private APIs: process._getActiveHandles() and
 *   process._getActiveRequests(). These are not part of Node's public, stable API and
 *   may change or be removed in future Node.js versions.
 * - Errors during introspection are caught and reported via debug().
 *
 * @function
 * @name logActiveHandles
 * @returns {void} Emits formatted HTML via debug(); no value is returned.
 * @example Invoke to print current handles/requests when debugging shutdown issues:
 * logActiveHandles();
 *
 * @see https://nodejs.org/api/process.html (note: _getActiveHandles/_getActiveRequests are internal)
 */
function logActiveHandles() {
  try {
    const handles = process._getActiveHandles();
    const requests = process._getActiveRequests();
    let hTxt = "", rTxt = "";
    handles.forEach((h, i) => hTxt += `  [${i}] ${h.constructor.name}<br>`);
    requests.forEach((r, i) => rTxt += `  [${i}] ${r.constructor.name}<br>`);
    debug(`<div style="padding:10px;border:var(--border) 2px solid;color:green"><u>🔍 <b>Active Handles:</b></u><br>${hTxt || "None."}<br><br><u>📡 <b>Active Requests:</b></u><br>${rTxt || "None."}</div>`);
} catch (err) {
    debug(`-Error detecting active handles: ${err.message || err.toString()}`);
  }
}

/**
 * Sanitizes a file path by removing or replacing invalid characters.
 * @param {string} p - The file path to sanitize
 * @returns {string} The sanitized file path with invalid characters replaced by underscores
 */
function sanitize(p) {
  return p.replace(/[<>"/\\|?*\x00-\x1F]/g, '_').replace(/_+/g, '_');
}

/** Checks if a URL corresponds to a file that has already been downloaded locally. */
function isLocalFile(url, baseUrl = TARGET_URL) {
  return existsSync(getLocalPath(url, baseUrl));
}

/** Logs a message to the console or sends it to the renderer process in Electron. */
function log(msg) {
  console.log(msg);
}

/** Asynchronously logs a message to the console. */
function logAsync(msg) {
  return new Promise(r => r(console.log(msg)));
}

/**
 * Removes the search query string and hash fragment from a URL.
 * @param {string} url - The URL to process
 * @returns {string} The URL without search parameters and hash, or the original URL if it's invalid
 */
function stripSearch(url) {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    return u.href;
  } catch {
    return url;
  }
}

/**
 * normalizeUrl
 * - removes search & hash
 * - collapses duplicated slashes
 * - removes trailing slash (except for root '/')
 * - returns normalized href string
 */
function normalizeUrl(raw, base = TARGET_URL) {
  try {
    const u = new URL(raw, base);
    // clear search/hash
    u.search = '';
    u.hash = '';
    // collapse duplicate slashes in pathname
    u.pathname = u.pathname.replace(/\/{2,}/g, '/');
    // remove trailing slash for non-root paths
    if (u.pathname !== '/' ) u.pathname = u.pathname.replace(/\/+$/,'');
    return u.href;
  } catch {
    return raw;
  }
}

/**
 * ensureDir
 * - wrapper around fs.mkdir(..., { recursive:true })
 * - swallows EEXIST races and rethrows other errors
 */
async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    if (err && err.code !== 'EEXIST') throw err;
  }
}

function debugShowStartSettings() {
  debug(`<style>#settings td{line-height:0.6}</style><table id="settings" border=0 cellpadding=6 cellspacing=0 style="font-size: 14px; font-weight: 100"><tr><th colspan=3 style="border-bottom: var(--border) 1px solid">Settings:</th></tr>
  <tr><td align=right>Target URL:</td><td width=10></td><td>${TARGET_URL}</td></tr>
  <tr><td align=right>Output Folder:</td><td></td><td>${OUTPUT_DIR}</td></tr>
  <tr><td align=right>Concurrency:</td><td></td><td>${CONCURRENCY}</td></tr>
  <tr><td align=right>Max Depth:</td><td></td><td>${MAX_DEPTH === Infinity ? "Unlimited" : MAX_DEPTH}</td></tr>
  <tr><td align=right>Use index.html:</td><td></td><td>${USE_INDEX}</td></tr>
  <tr><td align=right>Clean Start:</td><td></td><td>${!existsSync(OUTPUT_DIR) ? "Yes (folder will be created)" : CLEAN_MODE ? "Enabled" : "Disabled"}</td></tr>
  <tr><td align=right>Recursive:</td><td></td><td>${RECURSIVE}</td></tr>
  <tr><td align=right>DWT:</td><td></td><td>${DYNAMIC_WAIT_TIME}ms</td></tr>
  <tr><td align=right>Debug Mode:</td><td></td><td>${DEBUG_MODE}</td></tr>
  <tr><td align=right>Create Log:</td><td></td><td>${CREATE_LOG}</td></tr>
  <tr><td align=right>Create Sitemap:</td><td></td><td>${CREATE_SITEMAP}</td></tr>
  <tr><td align=right>ZIP Export:</td><td></td><td>${ZIP_EXPORT}</td></tr>
  </table><br><b>Starting Website Downloader...</b><br>`);
}

/**
 * @function shouldIgnoreUrl
 *
 * Determines whether a given URL should be ignored based on various criteria.
 *
 * @param {string} url - The URL to check.
 * @returns {boolean} Returns true if the URL should be ignored; otherwise, false.
 */

function shouldIgnoreUrl(url) {
  if (!url) return true;
  // Normalize for consistent comparisons
  const norm = normalizeUrl(url, TARGET_URL);
  if (!norm) return true;
  if (norm.startsWith('data:') || norm.startsWith('blob:') || norm.startsWith('about:') || norm.startsWith('chrome:') || norm.startsWith('javascript:') || norm.startsWith('filesystem:')) return true;
  // Use normalized comparisons — visited and resourceMap keys will be normalized too
  if (visited.has(norm) || resourceMap.has(norm) || failed.has(norm)) return true;
  if (isLocalFile(norm)) return true;
  if (!isSameDomain(norm, TARGET_URL)) return true;
  try {
     if (new URL(norm, TARGET_URL).origin === "null") return true;
  } catch {
    return true;
  }
  return false;
}


/**
 * @function reportProgress
 *
 * Reports the current progress of the website download process.
 * Logs the number of visited pages, downloaded assets, and errors,
 * along with the percentage of errors relative to the total processed items.
 * When downloads are complete, it shows the downloaded files and errors on hover.
 *
 * @param {boolean} finished - If true, the progress bar will show detailed information on hovering with the mouse.
 */
function reportProgress(finished) {
  const total = visited.size + resourceMap.size + logs.length;
  const err = logs.length;
  let percent = (100 / total * err).toFixed(2);
  if (percent.toString() === "NaN") percent = 0;
  if (IS_ELECTRON) {
    const fin = ["", "", ""];
    if (finished) {
        fin[0] = ` data-summary="${[...visited].join("\n")}"`;
        fin[1] = ` data-summary="${[...resourceMap].map(r => r[0].trim()).join("\n")}"`;
        fin[2] = ` data-summary="${[...logs].map(log => log.error.trim()).join("\n")}"`;
    }
    log(`🏠 <span${fin[0]}>Pages: ${visited.size}</span> | 📃 <span${fin[1]}>Assets: ${resourceMap.size}</span> | ❌ <span${fin[2]}>Errors: ${logs.length} (${percent}%)</span>`);
  } else log(`🏠 Pages: ${visited.size} | 📃 Assets: ${resourceMap.size} | ❌ Errors: ${logs.length} (${percent}%)`);
}

 /** Reports the total number of links and resources found */
function reportTotal() {
  if (IS_ELECTRON) log(`TLF${totalRequests}`);
}

/** Sort URLs by folder, folder depth and filenames */
function sortUrls(urls) {
  debug(`Sorting ${[...urls].length} URLs.`);
  return [...urls].sort((a, b) => {
    const [pathA, pathB] = [new URL(a).pathname, new URL(b).pathname];
    const [partsA, partsB] = [pathA.split('/').filter(Boolean), pathB.split('/').filter(Boolean)];
    const len = Math.max(partsA.length, partsB.length);
    for (let i = 0; i < len; i++) {
      const [segA, segB] = [partsA[i] || '', partsB[i] || ''];
      if (!segA && segB) return -1;
      if (!segB && segA) return 1;
      const cmp = segA.localeCompare(segB);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}

/** Finalizes the download process */
async function finish(aborted) {
  debug(`${aborted ? "-" : "+"}Finished (aborted: ${Boolean(aborted)})`);
  reportProgress(1);
  if (!aborted) {
    log(`*** FINISHED ***`);
    if (ZIP_EXPORT) {
      await createZip();
      log(`📦 ZIP file '${OUTPUT_DIR}.zip' created.`);
    }
  }
  if (CREATE_SITEMAP) {
    let map = sortUrls(sitemap);
    map = [...map, ...sortUrls([...resourceMap].map(r => r[0]))];
    await fs.writeFile(path.join(OUTPUT_DIR, 'sitemap.json'), JSON.stringify(map, null, 2));
    log(`🧭 Sitemap created (${map.length} File${map.length === 1 ? "" : "s"}: ${sitemap.size} HTML file${sitemap.size === 1 ? "" : "s"}, ${resourceMap.size} Asset${resourceMap.size === 1 ? "" : "s"}).`);
  }
  if (CREATE_LOG) {
    if (logs.length || failed.size) {
      await fs.writeFile(path.join(OUTPUT_DIR, 'log.json'), JSON.stringify({ Errors: [...logs], Failed_Downloads: [...failed] }, null, 2));
      log(`📝 ${logs.length} Error${logs.length === 1 ? "" : "s"}, Log created.`);
    } else log('📝 No errors, log creation is skipped.');
  }
  const size = await getFolderSize(OUTPUT_DIR);
  const date = Date.now();
  const time = parseInt((date - START_TIME) / 1000, 10);
  log(`🏁 Overall Size: ${size}.🕧 Finished in ${time} seconds.`);
  return;
}

/** Calculates the total size of the target folder (recursively). */
async function getFolderSize(dirPath) {
  const walk = async currentPath => {
    let totalSize = 0;
    for (const entry of await fs.readdir(currentPath, { withFileTypes: true })) {
      const fullPath = path.join(currentPath, entry.name);
      totalSize += entry.isDirectory() ? await walk(fullPath) : (await fs.stat(fullPath)).size;
    }
    return totalSize;
  };
  let total = await walk(dirPath);
  let b = "Bytes";
  total > 1024 && (total /= 1024, b = "kB");
  total > 1024 && (total /= 1024, b = "MB");
  total > 1024 && (total /= 1024, b = "GB");
  debug(`Folder size: ${total.toFixed(2)} ${b}`);
  return `${total.toFixed(2)} ${b}`;
}

/** Automatically scrolls down the loaded pages to the bottom by incrementally scrolling. */
async function autoScroll(page, fn) {
  debug(`Auto scrolling page '${await page.evaluate(() => document.title) || ""}'.`);
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let totalHeight = 0;
      const scrollHeight = document.body.scrollHeight;
      const distance = scrollHeight / 20;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 50);
    });
  });
}

/** Limits the number of concurrent downloads. */
function pLimit(concurrency) {
  const queue = [];
  let active = 0;
  const next = () => {
    if (queue.length === 0 || active >= concurrency) return;
    const { fn, resolve, reject } = queue.shift();
    active += 1;
    fn().then(resolve).catch(reject).finally(() => {
      active -= 1;
      next();
    });
  };
  return fn => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}

function getLocalPath(resourceUrl, baseUrl) {
  // resourceUrl may be absolute or relative — use baseUrl to resolve
  const u = new URL(resourceUrl, baseUrl);
  // Normalize pathname (remove duplicate slashes)
  let pathname = u.pathname.replace(/\/{2,}/g, '/');
  // Determine if the original resourceURL or resolved pathname ends with a slash
  // (treat as "folder")
  const endsWithSlash = resourceUrl.endsWith('/') || u.pathname.endsWith('/');
  // Trim leading and trailing slashes for segment handling
  pathname = pathname.replace(/^\/+|\/+$/g, '');
  // If empty -> root
  if (!pathname) pathname = 'index.html';
  else {
    // If the path ends with a slash -> folder -> index.html
    if (endsWithSlash) pathname = path.posix.join(pathname, 'index.html');
    else if (!path.extname(pathname)) {
      // No file extension -> apply USE_INDEX policy
      if (USE_INDEX) pathname = path.posix.join(pathname, 'index.html');
      else pathname = pathname + '.html';
    }
  }
  // Sanitize each path segment
  const safe = pathname.split('/').map(sanitize).join('/');
  // Return POSIX-style path (forward slashes) — fs.* accepts forward slashes on Windows.
  return path.posix.join(OUTPUT_DIR, safe);
}

/** Creates a ZIP archive of the contents of the OUTPUT_DIR directory (recursively). */
async function createZip() {
  debug(`Creating ZIP file.`);
  const zip = new JSZip();
  async function addDir(dir, zipFolder) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await addDir(full, zipFolder.folder(entry.name));
      else zipFolder.file(entry.name, await fs.readFile(full));
    }
  }
  await addDir(OUTPUT_DIR, zip.folder(path.basename(OUTPUT_DIR)));
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(`${OUTPUT_DIR}.zip`, buf);
  log('📦 ZIP created.');
}

/**
 * Handles requests for dynamic resources during website crawling.
 * Determines whether to ignore the URL, download resources, or schedule further crawling tasks.
 * Special handling is applied for HTML and CSS files, including extraction of CSS resources.
 */
async function dynamicPageRequest(request, depth) {
  const url = request.url();
  const type = request.resourceType();
  try {
    const parsedUrl = new URL(url);
    const href = parsedUrl.href;
    if (shouldIgnoreUrl(href)) return totalRequests++;
    let resourcePath = sanitize(parsedUrl.pathname);
    //if (USE_INDEX && !path.extname(resourcePath)) resourcePath += resourcePath.endsWith("/") ? "index.html" : "/index.html";
    const localPath = path.posix.join(OUTPUT_DIR, resourcePath);
    if (href.endsWith(".html") || href.endsWith(".htm") || !path.extname(resourcePath)) {
      sitemap.add(href);
      tasks.push(limit(() => crawl(href, depth + 1, 1)));
    } else if (href.endsWith(".css")) {
      tasks.push(limit(async () => {
        await downloadResource(href, localPath, "dyn");
        const cssPath = getLocalPath(href, localPath);
        const cssContent = await fs.readFile(cssPath, 'utf8');
        const urls = await extractCssResources(cssContent, href);
        // Schedule downloads for all found URLs
        for (let u of [...urls]) tasks.push(limit(async () => await downloadResource(u, href, "css")));
      }));
    } else tasks.push(limit(async () => await downloadResource(href, localPath, "dyn")));
  } catch (err) {
    const error = `Error fetching dynamic resource ${url.split("/").pop()}: ${err.message || err.toString()}`;
    totalRequests++;
    debug(`-Error: ${error}`);
    failed.add(url);
    logs.push({ url, error });
  }
}

/**
 * Downloads a resource from the specified URL and saves it locally.

 * @async
 * @function downloadResource
 * @param {string} url - The URL of the file.
 * @param {string} baseUrl - The base URL, on which the file URL is relative to. Important for calculating the local download path.
 * @param {?string} [dyn=""] - A text that is displayed in the progress window.
 * @returns {Promise<void>} Resolves when the file is saved on the local drive.
 *
 * @throws Will log and record errors encountered during request, download and local saving of the file.
 */
async function downloadResource(url, baseUrl, dyn = "") {
  totalRequests++;
  url = stripSearch(url);
  const loc = getLocalPath(url, baseUrl);
  const type = (dyn === "css" ? "CSS" : dyn === "dyn" ? "Dynamic" : dyn || "Asset") + " Resource";
  const filename = url.split("/").pop();
  try {
    await new Promise((resolve, reject) => {
      // Choose http or https module
      const req = (url.startsWith('https') ? https : http).get(url, r => {
        if (r.statusCode === 200) {
          // ensure directory (race-safe)
          ensureDir(path.dirname(loc)).then(() => {
            const ws = createWriteStream(loc);
            r.pipe(ws);
            ws.on('finish', () => {
              // store normalized absolute href as key
              try {
                const mapKey = normalizeUrl(new URL(url, baseUrl).href, TARGET_URL);
                resourceMap.set(mapKey, path.relative(OUTPUT_DIR, loc).replace(/\\/g,'/'));
              } catch {
                resourceMap.set(url, path.relative(OUTPUT_DIR, loc).replace(/\\/g,'/'));
              }
              reportProgress();
              log(`🌐 ${type}: ${url}`);
              debug(`${url}`);
              resolve();
            });
            ws.on('error', msg => reject({ message: `Error on writing '${filename}': ${msg}` }));
          }).catch(err => reject({ message: `Error creating dir: ${err.message || err.toString()}` }));
        } else reject({ message: `${type} '${filename}': ${r.statusCode} (${HTTP_STATUS_CODES[r.statusCode]})` });
      });
      req.on('error', msg => reject({ message: `Error while retrieving '${filename}': ${msg}` }));
    });
  } catch (e) {
    debug(`-${e.message || e.toString()}`);
    failed.add(url);
    logs.push({ url, error: e.message || e.toString() });
  }
}

/** Checks if two URLs have the same domain. */
function isSameDomain(urlA, urlB) {
  try {
    const a = new URL(urlA);
    const b = new URL(urlB);
    return a.hostname === b.hostname;
  } catch {
    return false;
  }
}

/**
 * Adjusts all relative and absolute links (href/src) in the provided HTML to point to their local equivalents.
 * Resolves URLs based on the given base URL, rewrites them to local paths if they exist in the resource map.
 */
function adjustLinks(html, baseUrl) {
  const fromPath = getLocalPath(baseUrl, TARGET_URL);
  const fromDir = path.dirname(fromPath);
  const makeRel = full => {
    const toRel = resourceMap.get(full);
    const toPath = path.join(OUTPUT_DIR, toRel);
    let rel = path.relative(fromDir, toPath).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = './' + rel;
    counter++;
    return rel;
  };
  let counter = 0;
  /**
   * href & src
   */
  html = html.replace(/(href|src)=["']([^"']+)["']/g, (m, attr, link) => {
    try {
      const full = stripSearch(new URL(link, baseUrl).href);
      const pathname = new URL(full).pathname;
      // Cross domain → Link remains untouched
      if (!isSameDomain(full, TARGET_URL)) return m;
      // Normalize
      let normalized = full;
      // Does resource exist locally?
      if (resourceMap.has(normalized)) return `${attr}="${makeRel(normalized)}"`;
      // Root-relative links → relativize
      if (link.startsWith('/')) {
        counter++;
        return `${attr}=".${link}"`;
      }
    } catch (err) {
      debug(`-${err.message || err.toString()}`);
    }
    return m;
  });
  /**
   * srcset (multiple URLs, separated by commas)
   */
  html = html.replace(/srcset=["']([^"']+)["']/g, (m, links) => {
    const parts = links.split(',').map(part => {
      const [urlPart, size] = part.trim().split(/\s+/, 2);
      try {
        const full = stripSearch(new URL(urlPart, baseUrl).href);
        if (!isSameDomain(full, TARGET_URL)) return part.trim();
        if (resourceMap.has(full)) {
          return `${makeRel(full)}${size ? ' ' + size : ''}`;
        }
      } catch {}
      return part.trim();
    });
    return `srcset="${parts.join(', ')}"`;
  });
  /**
   * Inline CSS: url('...') or url("...") or url(...)
   */
  html = html.replace(/url\((['"]?)([^'")]+)\1\)/g, (m, quote, link) => {
    try {
      const full = stripSearch(new URL(link, baseUrl).href);
      if (!isSameDomain(full, TARGET_URL)) return m;
      if (resourceMap.has(full)) {
        return `url(${quote}${makeRel(full)}${quote})`;
      }
    } catch {}
    return m;
  });
  /**
   * Meta refresh URLs
   */
  html = html.replace(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["']\d+;\s*url=([^"']+)["']/gi, (m, url) => {
    try {
      const full = stripSearch(new URL(url, baseUrl).href);
      if (!isSameDomain(full, TARGET_URL)) return m;
      if (resourceMap.has(full)) {
        return m.replace(url, makeRel(full));
      }
    } catch {}
    return m;
  });
  debug(`Adjusted ${counter} URLs in ${baseUrl}.`);
  return html;
}
/**
 * Extracts url(...) and @import resource URLs
 * from a CSS string and schedules their download.
 */
async function extractCssResources(css, baseUrl) {
  let match;
  let urls = new Set();
  const urlRegex = /url\((['"]?)([^'")]+)\1\)/gi;
  const importRegex = /@import\s+(['"]?)([^'"]+)\1;?/gi;
  try {
      // 1. url(...) – Finds backgrounds, fonts, images, border-images
      for (match of css.matchAll(urlRegex)) urls.add(new URL(match[2].trim(), baseUrl).href);
      // 2. @import – Finds CSS files loaded by a CSS file
      for (match of css.matchAll(importRegex)) urls.add(new URL(match[2].trim(), baseUrl).href);
  } catch {}
  urls = [...urls].filter(u => !shouldIgnoreUrl(u)).map(u => stripSearch(u).split("/").map(sanitize).join("/"));
  urls.length && debug(`Scheduling ${urls.length} resource${urls.length === 1 ? "" : "s"} from CSS for download:<br>${urls.join("<br>")}`);
  return urls;

}


/**
 * Loads a manifest.json file and extracts all assets referenced within it.
 */
async function handleManifest(manifestUrl, baseUrl) {
  debug(`Manifest found: ${manifestUrl}`);
  let counter = 0;
  try {
    const res = await fetch(manifestUrl);
    if (!res.ok) {
      const msg = `Manifest fetch failed: ${res.status} (${HTTP_STATUS_CODES[res.status]})`;
      debug(`-${msg}`);
      logs.push({ url: manifestUrl, error: msg });
      return;
    }
    const manifest = await res.json();

    // Extract icons
    if (manifest.icons && Array.isArray(manifest.icons)) {
      for (const icon of manifest.icons) {
        if (icon.src) {
          const iconUrl = new URL(icon.src, manifestUrl).href;
          if (!shouldIgnoreUrl(iconUrl)) {
            counter++;
            tasks.push(limit(async () => await downloadResource(iconUrl, baseUrl, "Icon")));
          }
        }
      }
    }
    // Start URL (treat as HTML page)
    if (manifest.start_url) {
      const startUrl = new URL(manifest.start_url, manifestUrl).href;
      if (!shouldIgnoreUrl(startUrl)) {
        counter++;
        tasks.push(limit(() => crawl(startUrl, 1, 1)));
      }
    }

    // Splash Screens for Progressive Web Apps
    if (manifest.splash_pages && Array.isArray(manifest.splash_pages)) {
      for (const page of manifest.splash_pages) {
        if (page.src) {
          const splashUrl = new URL(page.src, manifestUrl).href;
          if (!shouldIgnoreUrl(splashUrl)) {
            counter++;
            tasks.push(limit(async () => await downloadResource(splashUrl, baseUrl, "Splash")));
          }
        }
      }
    }
  } catch (e) {
    debug(`-${manifestUrl}: ${e.message || e.toString()}`);
    logs.push({ url: manifestUrl, error: `Manifest error: ${e.message || e.toString()}` });
  }
  debug(`${counter || "No"} resource${counter === 1 ? "" : "s"} found in ${manifestUrl}.`);
}

/**
 * Searches the DOM of a loaded page for resource URLs, including attributes
 * such as src, href, data-src, data-href, srcset, and poster, as well as URLs
 * found in inline <style> elements. Filters out ignored URLs.
 * This script does not run in local scope, but in the scope
 * of the website loaded by puppeteer. That's why document.querySelectorAll() works.
 */
function pageEvaluate() {
  // Searches the DOM of a loaded page for sources
  //   (src, href, data-src, data-href, scrset and poster)
  // This script does not run in local scope, but in the scope
  //   of the website. That's why document.querySelectorAll() works.
  const urls = new Set();
  let link;
  // Links, Meta, Manifest, Favicon, Apple-Touch-Icon
  [...document.querySelectorAll('link[rel~="icon"], link[rel~="apple-touch-icon"], link[rel="manifest"]')].forEach(link => urls.add(link.href));
  [...document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]')].forEach(meta => urls.add(meta.content));
  [...document.querySelectorAll('[src], [href], [data-src], [data-href], [srcset], [poster]')].forEach(el => {
    try {
      if (el.srcset) urls.add(...(el.srcset.split(',').map(e => e.trim().split(' ')[0])));
      else (link = el.src || el.href || el.dataset.src || el.dataset.href || el.poster) && urls.add(link);
    } catch {}
  });
  // Collect URLs found in inline styles
  const regex = /url\((['"]?)([^'")]+)\1\)/g;
  const style = [...document.querySelectorAll('style')];
  for (const s of style) if (s.textContent) for (const match of s.textContent.matchAll(regex)) try {
      urls.add(new URL(match[2], location.origin).href);
  } catch {}
  return [...urls];
}

/**
 * Recursively crawls a website starting from the given URL, downloading HTML pages and their resources.
 *
 * @async
 * @function crawl
 * @param {string} url - The URL to crawl.
 * @param {number} depth - The current depth of the crawl.
 * @param {import('puppeteer').Browser} browser - The Puppeteer browser instance.
 * @param {?number} [recursive=null] - Indicates if the crawl is recursive (internal use).
 * @returns {Promise<void>} Resolves when the crawl for the given URL is complete.
 *
 * @throws Will log and record errors encountered during crawling or resource downloading.
 */
async function crawl(uri, depth, recursive = null) {
  totalRequests++;
  // If this is not the entry HTML file, or if we overstep MAX_DEPTH → return
  if ((!RECURSIVE && recursive) || depth > MAX_DEPTH) return;
  let url = normalizeUrl(uri);
  const parsedUrl = new URL(uri);
  if (shouldIgnoreUrl(url)) return;
  // Remember the url of this HTML file
  visited.add(url);
  sitemap.add(url);
  // Print the progress
  reportProgress();
  debug(`Opening new browser page for ${url} at depth ${depth}.`);
  // Open a new page (puppeteer)
  const page = await BROWSER.newPage();
  page.on('request', request => dynamicPageRequest(request, depth));
  let pageTitle;
  try {
    // Open the website in puppeteer
    await page.goto(uri, { waitUntil: 'networkidle2' });
    pageTitle = await page.evaluate(() => document.title) || "";
    debug(`Crawling '${pageTitle}' (${url})...`);
    log(`📄 Site (Depth ${depth}): ${url}`);
    // Scroll down the page in order to catch requests which are initiated by an on-scroll trigger
    await autoScroll(page);
    // Wait for any other dynamically requested files
    await new Promise(r => setTimeout(r, DYNAMIC_WAIT_TIME));
    // Collect all valid links and sources found in the HTML file
    const resUrls = await page.evaluate(pageEvaluate);
    const l = resUrls.length;
    debug(`${l || "No"} resource${l === 1 ? "" : "s"} found on ${url}.`);
    // Loop through all found urls
    for (const raw of resUrls) {
      let res;
      try { res = new URL(raw, uri).href; }
      catch { continue; }
      res = stripSearch(res);
      const extname = path.extname(new URL(raw, url).pathname);
      // Do NOT mutate the URL by appending '/index.html' here — mapping is handled by getLocalPath
      totalRequests += 1;
      if (shouldIgnoreUrl(res)) continue;
      if (res.endsWith('.html') || res.endsWith('.htm') || !extname) {
        tasks.push(limit(() => crawl(res, depth + 1, 1)));
      } else {
        try {
          if (res.endsWith(".css")) {
            tasks.push(limit(async () => {
              await downloadResource(res, url, "css");
              const cssPath = getLocalPath(res, url);
              const cssContent = await fs.readFile(cssPath, 'utf8');
              const urls = await extractCssResources(cssContent, res);
              // Schedule downloads for all found URLs
              for (let u of urls) tasks.push(limit(async () => await downloadResource(u, res, "css")));
            }));
          } else tasks.push(limit(async () => await downloadResource(res, url, "Asset")));
        } catch(e) {
          const error = e.message || e.toString();
          logs.push({ url: res, error });
          debug(`-${pageTitle}: ${error}`);
        }
      }
    }
    // Check all HTML files for manifests and send the links to the manifest handler
    const manifestLinks = await page.evaluate(() => [...document.querySelectorAll('link[rel="manifest"]')].map(link => link.href).filter(Boolean));
    for (const manifestUrl of manifestLinks) await handleManifest(manifestUrl, url);

    // Get the source code from the actual HTML file (not from the rendered DOM)
    let response = await fetch(url);
    let ok = 1;
    if (!response.ok) {
      response = await fetch(uri);
      if (!response.ok) {
        const error = `Error while trying to open ${url}. Status ${response.status}: ${HTTP_STATUS_CODES[response.status]}`;
        logs.push({ url, error });
        debug(`-${error}`);
        ok = 0;
      }
    }
    if (ok) {
        const html = await response.text();
        const adjustedContent = adjustLinks(html, url);
        const localPath = getLocalPath(url, TARGET_URL);
        // await fs.mkdir(path.dirname(localPath), { recursive: true });
        await ensureDir(path.dirname(localPath));
        await fs.writeFile(localPath, adjustedContent, 'utf8');
    }
    try {
      await page.close();
      debug(`Page '${pageTitle || url}' closed.`);
   } catch {}
  } catch (e) {
    logs.push({ url, error: e.message || e.toString() });
    debug(`-Page '${pageTitle}': ${e.message || e.toString()}`);
    try {
      await page.close();
    } catch {}
  }
}

/**
 * The main function that initializes the crawling process.
 * It handles cleaning the output directory, launching the Puppeteer browser,
 * and managing the crawling tasks. It also ensures that dynamic content is fully loaded
 * before finalizing the process, and creates a ZIP archive if specified.
 *
 * @async
 * @returns {Promise<void>} Resolves when the entire crawling and downloading process is complete.
 */
(async () => {
  if (CLEAN_MODE && existsSync(OUTPUT_DIR)) {
    await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
    log('♻️ Clean: Folder deleted.');
  }
  const totalInterval = setInterval(reportTotal, 500);
  await ensureDir(OUTPUT_DIR);
  // await fs.mkdir(OUTPUT_DIR, { recursive: true });
  BROWSER = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  debug(`Target folder has been created and browser is launched.`);
  await crawl(TARGET_URL, 0);

  // Wait for more dynamic content to be added to the limit array.
  // This can still happen even if the current tasks of the limit array have been processed.
  while (visitedSize < visited.size || resourceMapSize < resourceMap.size) {
    visitedSize = visited.size;
    resourceMapSize = resourceMap.size;
    await Promise.allSettled(tasks);
    await new Promise(r => setTimeout(r, DYNAMIC_WAIT_TIME));
  }
  await BROWSER.close();
  clearInterval(totalInterval);
  debug(`Browser closed.`);
  await finish();
  process.exit(0);
})();
