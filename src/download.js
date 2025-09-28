/*  Website Downloader

    File: download.js
    Copyright © 2025 By Manuel Pelzer
    MIT License
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
  process.exit(1);
}

/* Check given arguments and create constants */
const concArg = args.find(arg => arg.startsWith('--concurrency=') || arg.startsWith('-cc='));
const depthArg = args.find(arg => arg.startsWith('--depth=') || arg.startsWith('-d='));
const outArg = args.find(arg => arg.startsWith('--outdir=') || arg.startsWith('-o='));
const dynArg = args.find(arg => arg.startsWith('--dyn_wait_time=') || arg.startsWith('-dwt='));

const ZIP_EXPORT        = args.includes('--zip') || args.includes('-z');
const CLEAN_MODE        = args.includes('--clean') || args.includes('-c');
const RECURSIVE         = args.includes('--recursive') || args.includes('-r');
const USE_INDEX         = args.includes('--use-index') || args.includes('-u');
const MAX_DEPTH         = depthArg ? parseInt(depthArg.split('=')[1], 10) : Infinity;
const CONCURRENCY       = concArg ? parseInt(concArg.split('=')[1], 10) : 8;
const DYNAMIC_WAIT_TIME = dynArg ? parseInt(dynArg.split('=')[1], 10) : 3000;
const OUTPUT_DIR        = outArg ? path.join(outArg.split('=')[1].replace(/^["']|["']$/g, ''), new URL(TARGET_URL).hostname) : path.join(process.cwd(), new URL(TARGET_URL).hostname);
const START_TIME        = Date.now();
const HTTP_STATUS_CODES = { 100: "Continue", 101: "Switching Protocols", 102: "Processing", 103: "Early Hints", 200: "OK", 201: "Created", 202: "Accepted", 203: "Non-Authoritative Information", 204: "No Content", 205: "Reset Content", 206: "Partial Content", 207: "Multi-Status", 208: "Already Reported", 226: "IM Used", 300: "Multiple Choices", 301: "Moved Permanently", 302: "Found", 303: "See Other", 304: "Not Modified", 305: "Use Proxy", 307: "Temporary Redirect", 308: "Permanent Redirect", 400: "Bad Request", 401: "Unauthorized", 402: "Payment Required", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 406: "Not Acceptable", 407: "Proxy Authentication Required", 408: "Request Timeout", 409: "Conflict", 410: "Gone", 411: "Length Required", 412: "Precondition Failed", 413: "Payload Too Large", 414: "URI Too Long", 415: "Unsupported Media Type", 416: "Range Not Satisfiable", 417: "Expectation Failed", 418: "I'm a Teapot", 421: "Misdirected Request", 422: "Unprocessable Content", 423: "Locked", 424: "Failed Dependency", 425: "Too Early", 426: "Upgrade Required", 428: "Precondition Required", 429: "Too Many Requests", 431: "Request Header Fields Too Large", 451: "Unavailable For Legal Reasons", 500: "Internal Server Error", 501: "Not Implemented", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout", 505: "HTTP Version Not Supported", 506: "Variant Also Negotiates", 507: "Insufficient Storage", 508: "Loop Detected", 510: "Not Extended", 511: "Network Authentication Required" };

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

const stripHash = url => url.split("#")[0];
const stripSearch = url => url.split("?")[0];
const sanitize = p => p.replace(/[^@a-z0-9/\-_.%\[\]()]/gi, '_').replace(/_+/g, '_');
const log = msg => console.log(msg);
const isLocalFile = (url, baseUrl = TARGET_URL) => existsSync(getLocalPath(url, baseUrl));

// Handle incoming messages from the renderer process (renderer.js)
process.stdin.on('data', async data => {
  const command = data.toString().trim();
  if (command.startsWith('abort')) {
    await finish(1);
    process.exit(1);
  } else if (command.startsWith('save-progress:')) {
    // Write the content of the log div to a file
    const progressLog = command.slice(14);
    await fs.writeFile(path.join(OUTPUT_DIR, 'progress.log'), progressLog);
  }
});

/* Functions */

/**
 * Determines whether a given URL should be ignored based on various criteria.
 *
 * @param {string} url - The URL to check.
 * @returns {boolean} Returns true if the URL should be ignored; otherwise, false.
 */
function shouldIgnoreUrl(url) {
  url = stripHash(url);
  url = stripSearch(url);
  if (!url) return true;
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:') || url.startsWith('chrome:') || url.startsWith('javascript:') || url.startsWith('filesystem:')) return true;
  if (visited.has(url)) return true;
  if (resourceMap.has(url)) return true;
  if (failed.has(url)) return true;
  if (isLocalFile(url)) return true;
  try {
     if (new URL(url, TARGET_URL).origin === "null") return true;
     if (new URL(url, TARGET_URL).hostname !== new URL(TARGET_URL).hostname) return true;
  } catch {
    return true;
  }
  return false;
}

/**
 * Reports the current progress of the website download process.
 * Logs the number of visited pages, downloaded assets, and errors,
 * along with the percentage of errors relative to the total processed items.
 *
 * Assumes the existence of the following global variables:
 * - visited: Set containing visited page URLs.
 * - resourceMap: Map containing downloaded asset URLs.
 * - logs: Array containing error logs.
 * - log: Function to output log messages.
 */
function reportProgress() {
  const total = visited.size + resourceMap.size + logs.length;
  const err = logs.length;
  const percent = (100 / total * err).toFixed(2);
  log(`🏠 Pages: ${visited.size} | 📃 Assets: ${resourceMap.size} | ❌ Errors: ${logs.length} (${percent}%)`);
}

/**
 * Logs the total number of links found
 */
function reportTotal() {
  log(`TLF${totalRequests}`);
}

/**
 * Finalizes the download process by reporting progress, generating sitemap and log files,
 * and displaying summary information. Writes the sitemap and error logs to disk.
 *
 * @async
 * @param {boolean} aborted - Indicates if the process was aborted.
 * @returns {Promise<void>} Resolves when all finalization tasks are complete.
 */
async function finish(aborted) {
  reportProgress();
  await new Promise(async resolve => {
    if (!aborted) log(`*** FINISHED ***`);
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

/**
 * Calculates the total size of all files within a directory (recursively) and returns a human-readable string.
 *
 * @async
 * @param {string} dirPath - The path to the directory whose size is to be calculated.
 * @returns {Promise<string>} The total size of the directory in Bytes, kB, MB, or GB (rounded to two decimals).
 */
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
  return `${total.toFixed(2)} ${b}`;
}

/**
 * Automatically scrolls down the page to the bottom by incrementally scrolling.
 * Useful for loading dynamic content that appears as the user scrolls.
 *
 * @async
 * @param {import('puppeteer').Page} page - The Puppeteer Page object to scroll.
 * @returns {Promise<void>} Resolves when the bottom of the page is reached.
 */
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

/**
 * Creates a function that limits the number of concurrently executing asynchronous functions (the downloads in this case).
 *
 * @param {number} concurrency - The maximum number of concurrent executions allowed.
 * @returns {(fn: () => Promise<any>) => Promise<any>} A function that schedules the provided async function for execution, respecting the concurrency limit.
 */
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

/**
 * Converts a resource URL to a local file system path for saving.
 *
 * @param {string} resourceUrl - The URL of the resource to be downloaded.
 * @param {string} baseUrl - The base URL to resolve relative resource URLs.
 * @returns {string} The local file system path where the resource should be saved.
 */
function getLocalPath(resourceUrl, baseUrl) {
  const u = new URL(resourceUrl, baseUrl);
  let pathname = u.pathname.replace(/\/+$|^\//g, '');
  if (USE_INDEX && !path.extname(pathname)) pathname = path.join(pathname, 'index.html');
  const safe = pathname.split('/').map(sanitize).join('/');
  return path.join(OUTPUT_DIR, safe);
}

/**
 * Creates a ZIP archive of the contents of the OUTPUT_DIR directory.
 * Recursively adds all files and subdirectories to the ZIP file.
 * The resulting ZIP file is saved as OUTPUT_DIR.zip.
 *
 * @async
 * @function createZip
 * @returns {Promise<void>} Resolves when the ZIP file has been created and saved.
 */
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

/**
 * Handles requests for dynamic resources during website crawling.
 * Determines whether to ignore the URL, download resources, or schedule further crawling tasks.
 * Special handling is applied for HTML and CSS files, including extraction of CSS resources.
 *
 * @async
 * @param {import('puppeteer').HTTPRequest} request - The Puppeteer HTTP request object.
 * @returns {Promise<void>} Resolves when the request has been processed.
 */
async function dynamicPageRequest(request) {
  const url = request.url();
  const type = request.resourceType();
  try {
    const parsedUrl = new URL(url);
    const href = parsedUrl.href;
    if (shouldIgnoreUrl(href))  {
      totalRequests += 1;
      return;
    }
    let resourcePath = sanitize(parsedUrl.pathname);
    if (USE_INDEX && !path.extname(resourcePath)) resourcePath += resourcePath.endsWith("/") ? "index.html" : "/index.html";
    const localPath = path.join(OUTPUT_DIR, resourcePath);
    if (href.endsWith(".html") || href.endsWith(".htm")) {
      if (visited.has(href)) sitemap.add(href);
      else tasks.push(limit(() => crawl(href, depth + 1, browser, 1)));
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
    logs.push({ url, error: `Error fetching dynamic resource ${url.split("/").pop()}: ${err.message}` });
  }
}

/**
 * Downloads a resource from the specified URL and saves it locally.
 *
 * @async
 * @param {string} url - The URL of the resource to download.
 * @param {string} baseUrl - The base URL for resolving relative paths.
 * @param {string} [dyn=""] - The type of resource ("css" for CSS, "dyn" for dynamic, or empty for asset).
 * @returns {Promise<void>} Resolves when the resource is downloaded and saved.
 */
async function downloadResource(url, baseUrl, dyn = "") {
  totalRequests += 1;
  url = stripHash(url);
  url = stripSearch(url);
  const loc = getLocalPath(url, baseUrl);
  const type = dyn === "css" ? " CSS Resource" : dyn === "dyn" ? " Dynamic Resource" : " Asset Resource";
  const filename = url.split("/").pop();
  try {
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
            ws.on('error', msg => reject({ message: `Error on writing '${filename}': ${msg}` }));
          });
        } else {
          failed.add(url);
          reject({ message: `${type} '${filename}': ${r.statusCode} (${HTTP_STATUS_CODES[r.statusCode]})` });
        }
      });
      req.on('error', msg => reject({ message: `Error while retrieving '${filename}': ${msg}` }));
    });
  } catch (e) {
    failed.add(url);
    logs.push({ url, error: e.message || e.toString() });
  }
}

/**
 * Adjusts all relative and absolute links (href/src) in the provided HTML to point to their local equivalents.
 * Resolves URLs based on the given base URL, rewrites them to local paths if they exist in the resource map,
 * and optionally appends "index.html" for directory paths if USE_INDEX is enabled.
 *
 * @param {string} html - The HTML content whose links should be adjusted.
 * @param {string} baseUrl - The base URL used to resolve relative links in the HTML.
 * @returns {string} The HTML content with updated link paths.
 */
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

/**
 * Extracts resource URLs from a CSS string and schedules their download.
 * @param {string} css - The CSS content to parse for resource URLs.
 * @param {string} baseUrl - The base URL to resolve relative resource URLs.
 * @returns {Promise<void>} Resolves when all found resources are scheduled for download.
 */
async function extractCssResources(css, baseUrl) {
  let match;
  const urls = new Set();
  const add = url => url && !url.startsWith('data:') && !url.startsWith('blob:') && urls.add(url);
  // 1. url(...) – deckt background, fonts, border-image, etc. ab
  const urlRegex = /url\((['"]?)([^'")]+)\1\)/gi;
  while ((match = urlRegex.exec(css))) try { add(new URL(match[2].trim(), baseUrl).href) }  catch {}
  // 2. @import – CSS-Dateien können andere CSS-Dateien laden
  const importRegex = /@import\s+(['"]?)([^'"]+)\1;?/gi;
  while ((match = importRegex.exec(css))) try { add(new URL(match[2].trim(), baseUrl).href) }  catch {};
  for (const url of urls) !shouldIgnoreUrl(url) && tasks.push(limit(async () => await downloadResource(url, baseUrl, "css")));
}

/**
 * Searches the DOM of a loaded page for resource URLs, including attributes
 * such as src, href, data-src, data-href, srcset, and poster, as well as URLs
 * found in inline <style> elements. Filters out ignored URLs (e.g., data:, blob:, cross-origin).
 * 
 * @returns {string[]} An array of unique resource URLs found in the page.
 */
function pageEvaluate() {
  // Searches the DOM of a loaded page for sources
  //   (src, href, data-src, data-href, scrset and poster)
  // This script does not run in local scope, but in the scope
  //   of the website. That's why document.querySelectorAll() works.
  let match;
  const urls = new Set();
  const add = url => !shouldIgnoreUrl(url) && urls.add(url);
  const shouldIgnoreUrl = u => {
    if (!u || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:') || u.startsWith('chrome:') || u.startsWith('filesystem:')) return true;
    u = u.split("#")[0];
    try { if (new URL(u, location.origin).origin === "null" || new URL(u, location.origin).hostname !== new URL(location.href).hostname) return true; } catch { return true; }
    return false;
  };
  const els = [...document.querySelectorAll('[src], [href], [data-src], [data-href], [srcset], [poster]')];
  let link, parts, regex;
  for (const el of els) {
    try {
      if (el.srcset) el.srcset.split(',').forEach(s => (parts = s.trim().split(' '))[0] && add(parts[0]));
      else (link = el.src || el.href || el.dataset.src || el.dataset.href || el.poster) && add(link);
    } catch {}
  }
  // Collect URLs found in inline styles
  const style = [...document.querySelectorAll('style')];
  regex = /url\((['"]?)([^'")]+)\1\)/g;
  for (const s of style) if (s.textContent) while ((match = regex.exec(s.textContent))) try { add(new URL(match[2], location.origin).href) } catch {}
  return [...urls];
}

/**
 * Recursively crawls a website starting from the given URL, downloading HTML pages and their resources.
 *
 * @async
 * @param {string} url - The URL to crawl.
 * @param {number} depth - The current depth of the crawl.
 * @param {import('puppeteer').Browser} browser - The Puppeteer browser instance.
 * @param {?number} [recursive=null] - Indicates if the crawl is recursive (internal use).
 * @returns {Promise<void>} Resolves when the crawl for the given URL is complete.
 *
 * @throws Will log and record errors encountered during crawling or resource downloading.
 */
async function crawl(url, depth, browser, recursive = null) {
  totalRequests += 1;
  // If this is not the entry HTML file, or if we overstep MAX_DEPTH → return
  if ((!RECURSIVE && recursive) || depth > MAX_DEPTH) return;
  url = stripHash(url);
  const parsedUrl = new URL(url);
  const stripped = stripSearch(url);
  if (USE_INDEX && !path.extname(parsedUrl.pathname) && new URL(url).origin === new URL(TARGET_URL).origin) url = stripped + (stripped.endsWith("/") ? "index.html" : "/index.html") + parsedUrl.search || "";
  if (shouldIgnoreUrl(url)) return;
  log(`📄 Site (Depth ${depth}): ${url}`);
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
    await page.goto(url, { waitUntil: 'networkidle2' });
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
      if (USE_INDEX && !extname && new URL(res).origin === new URL(TARGET_URL).origin) res += (res.endsWith("/") ? "index.html" : "/index.html");
      totalRequests += 1;
      if (shouldIgnoreUrl(res)) continue;
      else {
        if (res.endsWith('.html') || res.endsWith('.htm') || !extname) {
          tasks.push(limit(() => crawl(res, depth + 1, browser, 1)));
        } else {
          try {
            if (res.endsWith(".css")) {
              tasks.push(limit(async () => {
                await downloadResource(res, url, "css");
                const cssPath = getLocalPath(res, url);
                const cssContent = await fs.readFile(cssPath, 'utf8');
                await extractCssResources(cssContent, res);
              }));
            } else tasks.push(limit(async () => await downloadResource(res, url, "Asset")));
          } catch(e) {
            logs.push({ url: res, error: `Error fetching resource ${res}: ${e.message || e.toString()}` });
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
    logs.push({ url, error: e.message || e.toString() });
    try { await page.close(); } catch {}
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
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  await crawl(TARGET_URL, 0, browser);

  // Wait for more dynamic content to be added to the limit array.
  // This can still happen even if the current tasks of the limit array have been processed.
  while (visitedSize < visited.size || resourceMapSize < resourceMap.size) {
    await Promise.allSettled(tasks);
    visitedSize = visited.size;
    resourceMapSize = resourceMap.size;
    await new Promise(r => setTimeout(r, DYNAMIC_WAIT_TIME));
  }

  await browser.close();
  clearInterval(totalInterval);
  if (ZIP_EXPORT) await createZip();
  await finish();
})();
