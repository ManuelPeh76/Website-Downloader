
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

/* Check which arguments are given and create constants with these infos */
const simulArg = args.find(arg => arg.startsWith('--simultaneous=') || arg.startsWith('-s='));
const depthArg = args.find(arg => arg.startsWith('--depth=') || arg.startsWith('-d='));
const outArg = args.find(arg => arg.startsWith('--outdir=') || arg.startsWith('-o='));
const dynArg = args.find(arg => arg.startsWith('--dyn_wait_time=') || arg.startsWith('-dwt='));

const TARGET_URL = args[0];

/* If no website url is found, exit the tool */
if (!TARGET_URL.startsWith("http")) {
  log('❌ Please enter a valid URL!');
  return process.exit(1);
}
const ZIP_EXPORT = args.includes('--zip') || args.includes('-z');
const CLEAN_MODE = args.includes('--clean') || args.includes('-c');
const RECURSIVE = args.includes('--recursive') || args.includes('-r');
const MAX_DEPTH = depthArg ? parseInt(depthArg.split('=')[1], 10) : Infinity;
const SIMULTANEOUS = simulArg ? parseInt(simulArg.split('=')[1], 10) : 8;
const OUTPUT_DIR = outArg ? path.join(outArg.split('=')[1].replace(/^["']|["']$/g, ''), new URL(TARGET_URL).hostname) : path.join(process.cwd(), new URL(TARGET_URL).hostname);
const DYNAMIC_WAIT_TIME = dynArg ? parseInt(dynArg.split('=')[1], 10) : 3000;
const START_TIME = Date.now();

const resourceMap = new Map(); // Contains all resource urls together with the corresponding local addresses
const visited = new Set(); // Contains all html file urls, to check if an html file has already been downloaded
const failed = new Set(); // Remember broken urls
let resourceMapSize = 0;
let visitedSize = 0;

const tasks = []; // Stack for downloads
const sitemap = new Set(); // List of the local addresses of all downloaded files
const logs = []; // List of all errors occured in the process
const limit = pLimit(SIMULTANEOUS);
const httpStatusCodes = { 100: "Continue", 101: "Switching Protocols", 102: "Processing", 103: "Early Hints", 200: "OK", 201: "Created", 202: "Accepted", 203: "Non-Authoritative Information", 204: "No Content", 205: "Reset Content", 206: "Partial Content", 207: "Multi-Status", 208: "Already Reported", 226: "IM Used", 300: "Multiple Choices", 301: "Moved Permanently", 302: "Found", 303: "See Other", 304: "Not Modified", 305: "Use Proxy", 307: "Temporary Redirect", 308: "Permanent Redirect", 400: "Bad Request", 401: "Unauthorized", 402: "Payment Required", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 406: "Not Acceptable", 407: "Proxy Authentication Required", 408: "Request Timeout", 409: "Conflict", 410: "Gone", 411: "Length Required", 412: "Precondition Failed", 413: "Payload Too Large", 414: "URI Too Long", 415: "Unsupported Media Type", 416: "Range Not Satisfiable", 417: "Expectation Failed", 418: "I'm a Teapot", 421: "Misdirected Request", 422: "Unprocessable Content", 423: "Locked", 424: "Failed Dependency", 425: "Too Early", 426: "Upgrade Required", 428: "Precondition Required", 429: "Too Many Requests", 431: "Request Header Fields Too Large", 451: "Unavailable For Legal Reasons", 500: "Internal Server Error", 501: "Not Implemented", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout", 505: "HTTP Version Not Supported", 506: "Variant Also Negotiates", 507: "Insufficient Storage", 508: "Loop Detected", 510: "Not Extended", 511: "Network Authentication Required" };

const stripHash = url => url.includes("#") ? url.split("#")[0] : url;
const stripSearch = url => url.includes("?") ? url.split("?")[0] : url;
const sanitize = p => p.replace(/[^@a-z0-9/\-_.%\[\]()]/gi, '_').replace(/_+/g, '_');
const log = msg => console.log(msg);
const isLocalFile = async (url, baseUrl = TARGET_URL) => await fs.access(getLocalPath(url, baseUrl)).then(() => true).catch(() => false);

// Reacts on requests from the main process (main.js)
process.stdin.on('data', async data => {
  const command = data.toString().trim();
  if (command === 'abort') {
    await finish();
    process.exit(1);
  } else if (command.startsWith('save-progress:')) {
    // Write the content of the log div to a file
    let progressLog = command.slice(14);
    await fs.writeFile(path.join(OUTPUT_DIR, 'progress.log'), progressLog.replace(/<br>/g, "\n"));
  }
});

/*************
 * Functions *
 *************/

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
  const percent = total > 0 ? 100 - (100 / total * err) : 0;
  log(`📊 ${visited.size} Sites, ${resourceMap.size} Files, ${logs.length} Errors (${percent.toFixed(2)}%)`);
}

// When the downloads are finished, create the sitemap.json and the log.json,
// and print the size of the downloaded website and how long it took to download it
async function finish() {
  reportProgress();
  setTimeout(async () => {
    log(`*** FINISHED ***`);
    const map = [...sitemap, ...[...resourceMap].map(r => r[0])];
    await fs.writeFile(path.join(OUTPUT_DIR, 'sitemap.json'), JSON.stringify(map, null, 2));
    log(`🧭 Sitemap created (${map.length} File${map.length === 1 ? "" : "s"}: ${sitemap.size} HTML file${sitemap.size === 1 ? "" : "s"}, ${resourceMap.size} Asset${resourceMap.size === 1 ? "" : "s"}).`);
    if (logs.length) {
      await fs.writeFile(path.join(OUTPUT_DIR, 'log.json'), JSON.stringify({ Errors: [...logs], Failed_Downloads: [...failed] }, null, 2));
      log(`📝 ${logs.length} Error${logs.length === 1 ? "" : "s"}, Log created.`);
    } else log('📝 No errors, log creation is skipped.');
    const size = await getFolderSize(OUTPUT_DIR);
    const date = Date.now();
    const time = parseInt((date - START_TIME) / 1000, 10);
    log(`🏁 Overall Size: ${size}.\n🕧 Finished in ${time} seconds.`);
  }, 0);
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

// A limit function, to not run more than SIMULTANEOUS download tasks
function pLimit(concurrency) {
  const queue = [];
  let active = 0;
  const next = () => {
    if (queue.length === 0 || active >= concurrency) return;
    const { fn, resolve, reject } = queue.shift();
    active++;
    fn().then(resolve).catch(reject).finally(() => {
      active--;
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
  if (!path.extname(pathname)) pathname = path.join(pathname, 'index.html');
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

// Download any file, except for HTML (HTML is processed by the crawl() function)
async function downloadResource(url, baseUrl, dyn = "") {
  url = stripHash(url);
  url = stripSearch(url);
  // Check if the url should be processed
  if (await shouldIgnoreUrl(url)) return;
  const loc = getLocalPath(url, baseUrl);
  if (await isLocalFile(url, baseUrl)) {
    if (!resourceMap.has(url)) resourceMap.set(new URL(url, baseUrl).href, path.relative(OUTPUT_DIR, loc).replace(/\\/g,'/'));
    return;
  }
  const type = dyn === "css" ? " CSS Resource" : dyn === "dyn" ? " Dynamic Resource" : " Asset Resource";
  let filename = url.split("/").pop();
  try {
    // This file is new, going on...
    await fs.mkdir(path.dirname(loc), { recursive: true });
    await new Promise((resolve, reject) => {
      const req = (url.startsWith('https') ? https : http).get(url, r => {
        if (r.statusCode !== 200) {
          failed.add(url);
          reject({ message: `${type} '${filename}': ${r.statusCode} (${httpStatusCodes[r.statusCode]})` });
        }
        fs.mkdir(path.dirname(loc), { recursive: true }).then(() => {
          const ws = createWriteStream(loc);
          r.pipe(ws);
          ws.on('finish', () => {
            resourceMap.set(new URL(url, baseUrl).href, path.relative(OUTPUT_DIR, loc).replace(/\\/g,'/'));
            reportProgress();
            setTimeout(() => log(`🌐${type}: ${url}`), 0);
            resolve();
          });
          ws.on('error', msg => reject({ message: ` Download Error on writing resource '${filename}': ${msg}` }));
        });
      });
      req.on('error', msg => reject({ message:` Download Error while retrieving resource '${filename}': ${msg}` }));
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
      const full = stripSearch(new URL(link, baseUrl).href);
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

// Starting point for downloading any HTML file
async function crawl(url, depth, browser, recursive = null) {
  url = stripHash(url);
  if (depth > MAX_DEPTH) return;
  if (await shouldIgnoreUrl(url)) return;
  log(`🌐 Site (Depth ${depth}): ${url}`);
  const parsedUrl = new URL(url);
  const stripped = stripSearch(url);
  if (!path.extname(parsedUrl.pathname)) url = stripped + (stripped.endsWith("/") ? "index.html" : "/index.html") + parsedUrl.search || "";
  // Remember the url of this HTML file
  visited.add(stripSearch(url));
  sitemap.add(stripSearch(url));
  // Print the progress
  reportProgress();
  // Open a new page (puppeteer)
  const page = await browser.newPage();
  // Event handler for dynamically initiated file requests on the page
  page.on('request', async (request) => {
    const url = request.url();
    const type = request.resourceType();
    try {
      if (await shouldIgnoreUrl(url)) return;
      const parsedUrl = new URL(url);
      const href = parsedUrl.href;
      let resourcePath = sanitize(parsedUrl.pathname);
      if (!path.extname(resourcePath)) resourcePath += resourcePath.endsWith("/") ? "index.html" : "/index.html";
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
  });

  try {
    // Open the website in puppeteer
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });
    // Scroll down the body of the site in order to catch
    // files that are dynamically requested by an on-scroll trigger
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    // Wait for any other dynamically requested files
    await new Promise(resolve => setTimeout(resolve, DYNAMIC_WAIT_TIME));
    // Collect all valid links and sources found in the HTML file
    const resUrls = await page.evaluate(() => {
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
    });
    // Loop through all found urls
    for (const raw of resUrls) {
      let res;
      try { res = new URL(raw, url).href; }
      catch { continue; }
      res = stripHash(res);
      res = stripSearch(res);
      if (!path.extname(new URL(raw, url).pathname)) res += res.endsWith("/") ? "index.html" : "/index.html";
      if (!recursive || (RECURSIVE && depth < MAX_DEPTH)) {
        if (!await isLocalFile(res)) {
          if (res.endsWith('.html') || res.endsWith('.htm')) {
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
    }
    // Get the source code from the actual HTML file (not from the rendered DOM)
    let html = await fetch(url);
    html = await html.text();
    const adjusted = adjustLinks(html, url); // Adjust links
    const locHtml = getLocalPath(url, TARGET_URL); // Get corresponding local folder path
    await fs.mkdir(path.dirname(locHtml), { recursive: true });
    await fs.writeFile(locHtml, adjusted, 'utf8');
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
  await Promise.allSettled(tasks);
  // Wait for more dynamic content to be added to the limit stack.
  // This can still happen even if all the tasks on the limit stack have been processed.
  while (visitedSize < visited.size || resourceMapSize < resourceMap.size) {
    visitedSize = visited.size;
    resourceMapSize = resourceMap.size;
    await new Promise(r => setTimeout(r, DYNAMIC_WAIT_TIME));
    await Promise.allSettled(tasks);
  }
  await browser.close();
  if (ZIP_EXPORT) await createZip();
  // Write Sitemap, Failed  and log
  await finish();
})();
