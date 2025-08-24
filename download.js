
/*  Website Downloader

    File: downloader.js
    Copyright © 2025 By Manuel Pelzer
    MIT License
 */

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
  process.exit(1);
}

/* Check given arguments and create constants */
const simulArg = args.find(arg => arg.startsWith('--simultaneous=') || arg.startsWith('-s='));
const depthArg = args.find(arg => arg.startsWith('--depth=') || arg.startsWith('-d='));
const outArg = args.find(arg => arg.startsWith('--outdir=') || arg.startsWith('-o='));
const dynArg = args.find(arg => arg.startsWith('--dyn_wait_time=') || arg.startsWith('-dwt='));

const ZIP_EXPORT = args.includes('--zip') || args.includes('-z');
const CLEAN_MODE = args.includes('--clean') || args.includes('-c');
const RECURSIVE = args.includes('--recursive') || args.includes('-r');
const USE_INDEX = args.includes('--use-index') || args.includes('-u');
const MAX_DEPTH = depthArg ? parseInt(depthArg.split('=')[1], 10) : Infinity;
const SIMULTANEOUS = simulArg ? parseInt(simulArg.split('=')[1], 10) : 8;
const OUTPUT_DIR = outArg ? path.join(outArg.split('=')[1].replace(/^["']|["']$/g, ''), new URL(TARGET_URL).hostname) : path.join(process.cwd(), new URL(TARGET_URL).hostname);
const DYNAMIC_WAIT_TIME = dynArg ? parseInt(dynArg.split('=')[1], 10) : 3000;
const START_TIME = Date.now();
const HTTP_STATUS_CODES = { 100: "Continue", 101: "Switching Protocols", 102: "Processing", 103: "Early Hints", 200: "OK", 201: "Created", 202: "Accepted", 203: "Non-Authoritative Information", 204: "No Content", 205: "Reset Content", 206: "Partial Content", 207: "Multi-Status", 208: "Already Reported", 226: "IM Used", 300: "Multiple Choices", 301: "Moved Permanently", 302: "Found", 303: "See Other", 304: "Not Modified", 305: "Use Proxy", 307: "Temporary Redirect", 308: "Permanent Redirect", 400: "Bad Request", 401: "Unauthorized", 402: "Payment Required", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 406: "Not Acceptable", 407: "Proxy Authentication Required", 408: "Request Timeout", 409: "Conflict", 410: "Gone", 411: "Length Required", 412: "Precondition Failed", 413: "Payload Too Large", 414: "URI Too Long", 415: "Unsupported Media Type", 416: "Range Not Satisfiable", 417: "Expectation Failed", 418: "I'm a Teapot", 421: "Misdirected Request", 422: "Unprocessable Content", 423: "Locked", 424: "Failed Dependency", 425: "Too Early", 426: "Upgrade Required", 428: "Precondition Required", 429: "Too Many Requests", 431: "Request Header Fields Too Large", 451: "Unavailable For Legal Reasons", 500: "Internal Server Error", 501: "Not Implemented", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout", 505: "HTTP Version Not Supported", 506: "Variant Also Negotiates", 507: "Insufficient Storage", 508: "Loop Detected", 510: "Not Extended", 511: "Network Authentication Required" };
const KNOWN_EXTS = new Set([".html", ".htm", ".js", ".mjs", ".cjs", ".css", ".json", ".txt", ".xml", ".svg", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".ico", ".pdf", ".woff", ".woff2", ".ttf", ".mp3", ".wav", ".ogg", ".m4a", ".flac", ".mp4", ".webm", ".ogv", ".mov", ".avi", ".mkv"]);

const resourceMap = new Map(); // Contains all resource urls together with the corresponding local addresses
const visited = new Set(); // Contains all html file urls, to check if an html file has already been downloaded
const failed = new Set(); // Remember broken urls
let resourceMapSize = 0;
let visitedSize = 0;

const tasks = []; // Stack for downloads
const sitemap = new Set(); // List of the local addresses of all downloaded files
const logs = []; // List of all errors occured in the process
const limit = pLimit(SIMULTANEOUS);

const stripHash = url => url.split("#")[0];
const stripSearch = url => url.split("?")[0];
const sanitize = p => p.replace(/[^@a-z0-9/\-_.%\[\]()]/gi, '_').replace(/_+/g, '_');
const log = msg => console.log(msg);
const isLocalFile = async (url, baseUrl = TARGET_URL) => await fs.access(getLocalPath(url, baseUrl)).then(() => true).catch(() => false);

// Reacts on requests from the renderer process (renderer.js)
process.stdin.on('data', async data => {
  const command = data.toString().trim();
  if (command.startsWith('abort')) {
    await finish();
    setTimeout(() => process.exit(1), 0);
  } else if (command.startsWith('save-progress:')) {
    // Write the content of the log div to a file
    const progressLog = command.slice(14);
    await fs.writeFile(path.join(OUTPUT_DIR, 'progress.log'), progressLog);
  }
});

/* Functions */

function isFile(filePath) {
  const ext = path.extname(new URL(filePath, TARGET_URL).pathname);
  // No extension → Folder
  if (!ext) return false;
  // Only numbers → Probably no file
  if (/^\.\d+$/.test(ext)) return (log(`[Notice] Path '${filePath}' ends with ${ext.length === 1 ? "a number" : "numbers"} (${ext}). Treated as folder.`), false);
  // Known extension → File
  if (KNOWN_EXTS.has(ext)) return true;
  // Unknown extension → Probably a file
  else return (log(`[Warning] Unknown extension '${ext}' in path '${filePath}'. Will still be saved as a file.`), true);
}

 // Check cases where the file will not be downloaded
async function shouldIgnoreUrl(url) {
  url = stripHash(url);
  url = stripSearch(url);
  if (!url) return true;
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:') || url.startsWith('chrome:') || url.startsWith('javascript:') || url.startsWith('filesystem:')) return true;
  if (visited.has(url)) return true;
  if (resourceMap.has(url)) return true;
  if (failed.has(url)) return true;
  if (await isLocalFile(url)) return true;
  try {
     if (new URL(url, TARGET_URL).origin === "null") return true;
     if (new URL(url, TARGET_URL).hostname !== new URL(TARGET_URL).hostname) return true;
  } catch {
    return true;
  }
  return false;
}

// Print information about the download progress
function reportProgress() {
  const total = visited.size + resourceMap.size + logs.length;
  const err = logs.length;
  const percent = (100 - (100 / total * err)).toFixed(2);
  log(`📊 ${visited.size} Sites, ${resourceMap.size} Files, ${logs.length} Errors (${percent}%)`);
}

// Last steps... Print stats and create Sitemap and Log files
async function finish() {
  reportProgress();
  await new Promise(async resolve => {
    log(`*** FINISHED ***`);
    let map = [...sitemap, ...[...resourceMap].map(r => r[0])].sort(([a, b]) => a > b);
    await fs.writeFile(path.join(OUTPUT_DIR, 'sitemap.json'), JSON.stringify(map, null, 2));
    log(`🧭 Sitemap created (${map.length} File${map.length === 1 ? "" : "s"}: ${sitemap.size} HTML file${sitemap.size === 1 ? "" : "s"}, ${resourceMap.size} Asset${resourceMap.size === 1 ? "" : "s"}).`);
    if (logs.length || failed.size) {
      await fs.writeFile(path.join(OUTPUT_DIR, 'log.json'), JSON.stringify({ Errors: [...logs], Failed_Downloads: [...failed] }, null, 2));
      log(`📝 ${logs.length} Error${logs.length === 1 ? "" : "s"}, Log created.`);
    } else log('📝 No errors, log creation is skipped.');
    const size = await getFolderSize(OUTPUT_DIR);
    const date = Date.now();
    const time = parseInt((date - START_TIME) / 1000, 10);
    log(`🏁 Overall Size: ${size}.\n🕧 Finished in ${time} seconds.`);
    resolve();
  });
}

// Get the size of the website folder, recursively
async function getFolderSize(dirPath) {
  const walk = async currentPath => {
    let totalSize = 0;
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) totalSize += await walk(fullPath);
      else if (entry.isFile()) {
        const stats = await fs.stat(fullPath);
        totalSize += stats.size;
      }
    }
    return totalSize;
  };
  let total = await walk(dirPath);
  let b = "Bytes";
  if (total > 1024) { total /= 1024; b = "kB"; }
  if (total > 1024) { total /= 1024; b = "MB"; }
  if (total > 1024) { total /= 1024; b = "GB"; }
  return `${total.toFixed(2)}${b}`;
}

// ========== SCROLL ==========
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let totalHeight = 0;
      const distance = 200;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

// A limit function, to not run more than SIMULTANEOUS download tasks
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
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}

// Creates the local path for a downloaded file, based on its URL
function getLocalPath(resourceUrl, baseUrl) {
  const u = new URL(resourceUrl, baseUrl);
  let pathname = u.pathname.replace(/\/+$|^\//g, '');
  if (USE_INDEX && !path.extname(pathname)) pathname = path.join(pathname, 'index.html');
  const safe = pathname.split('/').map(sanitize).join('/');
  return path.join(OUTPUT_DIR, safe);
}

async function createZip() {
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

// Event handler for dynamically initiated file requests on the page
async function dynamicPageRequest(request) {
  const url = request.url();
  const type = request.resourceType();
  try {
    if (await shouldIgnoreUrl(url)) return;
    const parsedUrl = new URL(url);
    const href = parsedUrl.href;
    let resourcePath = sanitize(parsedUrl.pathname);
    if (USE_INDEX && !path.extname(resourcePath)) resourcePath += resourcePath.endsWith("/") ? "index.html" : "/index.html";
    const localPath = path.join(OUTPUT_DIR, resourcePath);
    const relativePath = path.relative(OUTPUT_DIR, localPath).replace(/\\/g, '/');
    if (href.endsWith(".html") || href.endsWith(".htm")) {
      if (visited.has(href)) {
        if (!sitemap.has(href)) sitemap.add(href);
      } else {
        tasks.push(limit(() => crawl(href, depth + 1, browser, 1)));
      }
    } else {
      if (!resourceMap.has(href)) {
        if (href.endsWith(".css")) {
          tasks.push(limit(async () => {
            await downloadResource(href, localPath, "dyn");
            const cssPath = getLocalPath(href, localPath);
            const cssContent = await fs.readFile(cssPath, 'utf8');
            await extractCssResources(cssContent, href);
          }));
        } else {
          tasks.push(limit(async () => await downloadResource(href, localPath, "dyn")));
        }
      }
    }
  } catch (err) {
    log(`❌ Error fetching dynamic resource ${url.split("/").pop()}: ${err.message}`);
  }
}

// Download any file, except for HTML (HTML is processed by the crawl() function)
async function downloadResource(url, baseUrl, dyn = "") {
  url = stripHash(url);
  url = stripSearch(url);
  const loc = getLocalPath(url, baseUrl);
  if (await isLocalFile(url, baseUrl)) {
    if (!resourceMap.has(url)) resourceMap.set(new URL(url, baseUrl).href, path.relative(OUTPUT_DIR, loc).replace(/\\/g,'/'));
    return;
  }
  if (await shouldIgnoreUrl(url)) return;

  const type = dyn === "css" ? " CSS Resource" : dyn === "dyn" ? " Dynamic Resource" : " Asset Resource";
  const filename = url.split("/").pop();
  try {
    // This file is new, going on...
    await new Promise((resolve, reject) => {
      const req = (url.startsWith('https') ? https : http).get(url, r => {
        if (r.statusCode === 200) {
          fs.mkdir(path.dirname(loc), { recursive: true }).then(() => {
            const ws = createWriteStream(loc);
            r.pipe(ws);
            ws.on('finish', () => {
              resourceMap.set(new URL(url, baseUrl).href, path.relative(OUTPUT_DIR, loc).replace(/\\/g,'/'));
              reportProgress();
              log(`🌐${type}: ${url}`);
              resolve();
            });
            ws.on('error', msg => reject({ message: ` Error on writing file '${filename}': ${msg}` }));
          });
        } else {
          failed.add(url);
          reject({ message: `${type} '${filename}': ${r.statusCode} (${HTTP_STATUS_CODES[r.statusCode]})` });
        }
      });
      req.on('error', msg => reject({ message:` Error while retrieving resource '${filename}': ${msg}` }));
    });
  } catch (e) {
    failed.add(url);
    logs.push({ url, error: e.message || e.toString() });
    log("❌" + e.message || e.toString());
  }
}

function adjustLinks(html, baseUrl) {
  const fromPath = getLocalPath(baseUrl, TARGET_URL);
  return html.replace(/(href|src)=["']([^"']+)["']/g, (m, attr, link) => {
    try {
      let full = stripSearch(new URL(link, baseUrl).href);
      const pathname = new URL(full).pathname;
      if (USE_INDEX && !path.extname(pathname)) full += (pathname.endsWith("/") ? "index.html" : "/index.html");
      if (resourceMap.has(full)) {
        const toRel = resourceMap.get(full);
        const toPath = path.join(OUTPUT_DIR, toRel);
        const rel = path.relative(path.dirname(fromPath), toPath).replace(/\\/g, '/');
        return `${attr}="${rel}"`;
      }
    } catch {}
    return m;
  });
}

// Checks every CSS file for resources that should be downloaded as well
async function extractCssResources(cssContent, baseUrl) {
  const regex = /url\((['"]?)([^'")]+)\1\)/g;
  const matches = new Set();
  let match;
  while ((match = regex.exec(cssContent))) {
    try {
      const url = new URL(match[2], baseUrl).href;
      if (!await shouldIgnoreUrl(url)) matches.add(url);
    } catch {}
  }
  for (const match of matches) tasks.push(limit(async () => await downloadResource(match, baseUrl, "css")));
}

function pageEvaluate() {
  // This script does not run in local scope (download.js), but in the
  // scope of the website. That's why document.querySelectorAll() works.
  const urls = new Set();
  const shouldIgnoreUrl = u => {
    if (!u || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:') || u.startsWith('chrome:') || u.startsWith('filesystem:')) return true;
    u = u.split("#")[0];
    try { if (new URL(u, location.origin).origin === "null" || new URL(u, location.origin).hostname !== new URL(location.href).hostname) return true; } catch { return true; }
    return false;
  };
  const els = [...document.querySelectorAll('[src], [href], [data-src], [data-href], [srcset], [poster]')];
  for (const el of els) {
    try {
      if (el.srcset) {
        el.srcset.split(',').forEach(s => {
          const parts = s.trim().split(' ');
          if (parts[0] && !shouldIgnoreUrl(parts[0])) urls.add(parts[0]);
        });
      } else {
        const link = el.src || el.href || el.dataset.src || el.dataset.href || el.poster;
        if (link && !shouldIgnoreUrl(link)) urls.add(link);
      }
    } catch {}
  }
  // Also collect URLs found in inline styles
  const styleEls = [...document.querySelectorAll('style')];
  for (const s of styleEls) {
    if (s.textContent) {
      const regex = /url\((['"]?)([^'")]+)\1\)/g;
      const matches = new Set();
      let match;
      while ((match = regex.exec(s.textContent))) {
        const relUrl = match[2];
        if (!shouldIgnoreUrl(relUrl)) try { matches.add(new URL(relUrl, location.origin).href); } catch {}
      }
      for (const match of [...matches]) urls.add(match);
    }
  }
  return [...urls];
}

// Starting point for downloading any HTML file
async function crawl(url, depth, browser, recursive = null) {
  // If this is not the entry HTML file, or if we overstep MAX_DEPTH → return
  if ((!RECURSIVE && recursive) || depth > MAX_DEPTH) return;
  if (await shouldIgnoreUrl(url)) return;
  url = stripHash(url);
  log(`🌐 Site (Depth ${depth}): ${url}`);
  const parsedUrl = new URL(url);
  const stripped = stripSearch(url);
  if ((USE_INDEX && !path.extname(parsedUrl.pathname)) || new URL(url).pathname === new URL(TARGET_URL).pathname) url = stripped + (stripped.endsWith("/") ? "index.html" : "/index.html") + parsedUrl.search || "";
  // Remember the url of this HTML file
  visited.add(stripSearch(url));
  sitemap.add(stripSearch(url));
  // Print the progress
  reportProgress();
  // Open a new page (puppeteer)
  const page = await browser.newPage();
  page.on('request', dynamicPageRequest);

  try {
    // Open the website in puppeteer
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });
    // Scroll down the page in order to catch requests which are initiated by an on-scroll trigger
    await autoScroll(page);
    // Wait for any other dynamically requested files
    await new Promise(resolve => setTimeout(resolve, DYNAMIC_WAIT_TIME));
    // Collect all valid links and sources found in the HTML file
    const resUrls = await page.evaluate(pageEvaluate);
    // Loop through all found urls
    for (const raw of resUrls) {
      let res;
      try { res = new URL(raw, url).href; }
      catch { continue; }
      res = stripHash(res);
      res = stripSearch(res);
      const extname = path.extname(new URL(raw, url).pathname);
      if (USE_INDEX && !extname) res += res.endsWith("/") ? "index.html" : "/index.html";
      if (!await isLocalFile(res)) {
        if (res.endsWith('.html') || res.endsWith('.htm') || !extname) {
          if (visited.has(res)) {
            if (!sitemap.has(res)) sitemap.add(res);
            continue;
          }
          tasks.push(limit(() => crawl(res, depth + 1, browser, 1)));
        } else {
          if (resourceMap.has(res)) continue;
          try {
            if (res.endsWith(".css")) {
              tasks.push(limit(async () => {
                await downloadResource(res, url, "css");
                const cssPath = getLocalPath(res, url);
                const cssContent = await fs.readFile(cssPath, 'utf8');
                await extractCssResources(cssContent, res);
              }));
            } else {
              tasks.push(limit(async () => await downloadResource(res, url, "Asset")));
            }
          } catch(e) {
            log(`❌ Error fetching resource ${res}: ${e.message || e.toString()}`);
            logs.push({ url: res, error: e.message || e.toString() });
          }
        }
      }
    }
    // Get the source code from the actual HTML file (not from the rendered DOM)
    const response = await fetch(url);
    const html = await response.text();
    const adjustedContent = adjustLinks(html, url);
    const localPath = getLocalPath(url, TARGET_URL);
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, adjustedContent, 'utf8');
    try { await page.close(); } catch {}
  } catch (e) {
    log(`❌ Error processing ${url}: ${e.message || e.toString()}`);
    logs.push({ url, error: e.message || e.toString() });
    try { await page.close(); } catch {}
  }
}

// Main
(async () => {
  if (CLEAN_MODE && existsSync(OUTPUT_DIR)) {
    await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
    log('♻️ Clean: Folder deleted.');
  }
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  await crawl(TARGET_URL, 0, browser);

  // Wait for more dynamic content to be added to the limit stack.
  // This can still happen even if all the tasks on the limit stack have been processed.
  while (visitedSize < visited.size || resourceMapSize < resourceMap.size) {
    await Promise.allSettled(tasks);
    visitedSize = visited.size;
    resourceMapSize = resourceMap.size;
    await new Promise(r => setTimeout(r, DYNAMIC_WAIT_TIME));
  }
  await browser.close();
  if (ZIP_EXPORT) await createZip();
  // Write Sitemap, Failed  and log
  await finish();
})();
