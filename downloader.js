
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
//const pLimit = require("p-limit").default;

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
const SIMULTANEOUS = simulArg ? parseInt(simulArg.split('=')[1], 10) : 4;
const OUTPUT_DIR = outArg ? path.join(outArg.split('=')[1].replace(/^["']|["']$/g, ''), new URL(TARGET_URL).hostname) : path.join(process.cwd(), new URL(TARGET_URL).hostname);
const DYNAMIC_WAIT_TIME = dynArg ? parseInt(dynArg.split('=')[1], 10) : 3000;
const START_TIME = Date.now();

const resourceMap = new Map(); // Contains all resource urls together with the corresponding local adresses
const visited = new Set(); // Contains all downloaded html file urls, to check if an html file is already downloaded

const tasks = []; // Stack for downloads
const sitemap = []; // List of the original addresses of all downloaded files
const logs = []; // List of all errors occured in the process
const limit = pLimit(SIMULTANEOUS);
const httpStatusCodes = {
  // 1xx: Informational
  100: "Continue",
  101: "Switching Protocols",
  102: "Processing",
  103: "Early Hints",

  // 2xx: Success
  200: "OK",
  201: "Created",
  202: "Accepted",
  203: "Non-Authoritative Information",
  204: "No Content",
  205: "Reset Content",
  206: "Partial Content",
  207: "Multi-Status",
  208: "Already Reported",
  226: "IM Used",

  // 3xx: Redirection
  300: "Multiple Choices",
  301: "Moved Permanently",
  302: "Found",
  303: "See Other",
  304: "Not Modified",
  305: "Use Proxy",
  307: "Temporary Redirect",
  308: "Permanent Redirect",

  // 4xx: Client Error
  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  407: "Proxy Authentication Required",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  411: "Length Required",
  412: "Precondition Failed",
  413: "Payload Too Large",
  414: "URI Too Long",
  415: "Unsupported Media Type",
  416: "Range Not Satisfiable",
  417: "Expectation Failed",
  418: "I'm a Teapot", // RFC 2324 (April Fools joke, but sometimes used)
  421: "Misdirected Request",
  422: "Unprocessable Content",
  423: "Locked",
  424: "Failed Dependency",
  425: "Too Early",
  426: "Upgrade Required",
  428: "Precondition Required",
  429: "Too Many Requests",
  431: "Request Header Fields Too Large",
  451: "Unavailable For Legal Reasons",

  // 5xx: Server Error
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
  505: "HTTP Version Not Supported",
  506: "Variant Also Negotiates",
  507: "Insufficient Storage",
  508: "Loop Detected",
  510: "Not Extended",
  511: "Network Authentication Required"
};

/* Stop any activity of the tool, if the abort button in the gui is pressed */
process.stdin.on('data', async data => {
  const command = data.toString().trim();
  if (command === 'abort') {
    await finish();
    process.exit(1);
  } else if (command.startsWith('save-progress:')) {
    let progressLog = command.slice(14);
    await fs.writeFile(path.join(OUTPUT_DIR, 'progress.log'), progressLog.replace(/<br>/g, "\n"));
  }
});

/* Functions */
function shouldIgnoreUrl(url) {
  if (!url) return true;
  if (
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('about:') ||
    url.startsWith('chrome:') ||
    url.startsWith('filesystem:') ||
    url.includes("#")
  ) return true;
  url = url.split("?")[0];
  if (!path.extname(new URL(url).pathname)) url += url.endsWith("/") ? "index.html" : "/index.html";
  if (url.endsWith(".html") || url.endsWith(".htm")) {
    if (visited.has(url)) return true;
  } else {
    if (resourceMap.has(url)) return true;
  }
  try {
     if (new URL(url, TARGET_URL).origin === "null") return true;
     if (new URL(url, TARGET_URL).hostname !== new URL(TARGET_URL).hostname) return true;
  } catch {
    return true;
  }
  return false;
}

/* Clean any url or filename */
function sanitize(p) {
  return p.replace(/[^a-z0-9/\-_.%\[\]()]/gi, '_').replace(/_+/g, '_');
}

function log(msg) {
  let time = "";
  const pics = ["📊", "❌", "📃", "🧭", "📝", "🏁", "📦"];
  if (!pics.includes(msg.substring(0, 2))) {
    const date = Date.now();
    const dif = (date - START_TIME) / 1000;
    time = "[" + ("0" + parseInt(dif / 60, 10)).substr(-2) + ":" + ("0" + parseInt(dif, 10)).substr(-2) + ":" + ("0" + parseInt((date - START_TIME) % 1000, 10)).substring(0,2) + "] ";
  }
  console.log(`${time}${msg}`);
  return;
}


/* Print information about the download progress */
function reportProgress() {
  const total = visited.size + resourceMap.size;
  const err = logs.length;
  const percent = total > 0 ? 100 - (100 / total * err) : 0;
  return log(`📊 ${visited.size} Sites, ${resourceMap.size} Files, ${logs.length} Errors (${percent.toFixed(2)}%)`);
}

/* When the downloads are finished, create the sitemap.json and the log.json */
async function finish() {
  const map = [...resourceMap].map(r => r[0]);
  await fs.writeFile(path.join(OUTPUT_DIR, 'sitemap.json'), JSON.stringify([...sitemap, ...map], null, 2));
  log('🧭 Sitemap created.');
  await fs.writeFile(path.join(OUTPUT_DIR, 'log.json'), JSON.stringify([...logs], null, 2));
  log('📝 Log created.');
  const size = await getFolderSize(OUTPUT_DIR);
  const date = Date.now();
  const time = parseInt((date - START_TIME) / 1000, 10);
  log(`🏁 Overall Size: ${size}.\n🕧 Finished in ${time} seconds.`);
}

async function getFolderSize(dirPath) {
  const walk = async currentPath => {
    let totalSize = 0;
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) await walk(fullPath); // recursive
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

/* The download queue function */
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

function getLocalPath(resourceUrl, baseUrl) {
  const u = new URL(resourceUrl, baseUrl);
  let pathname = u.pathname.replace(/\/+$|^\//g, '');
  if (!path.extname(pathname)) pathname = path.join(pathname, 'index.html');
  const safe = pathname.split('/').map(sanitize).join('/');
  return path.join(OUTPUT_DIR, safe);
}

async function downloadResource(url, baseUrl, dyn = "") {
  if (shouldIgnoreUrl(url)) return;
  url = url.split(url.includes("#") ? "#" : "?")[0];
  const type = dyn === "css" ? " CSS Resource" : dyn === "dyn" ? " Dynamic Request" : " Asset";
  let filename = url.split("/").pop();
  if (filename.length) filename = " " + filename;
  try {
    /* Check cases where the file will not be downloaded */
    const loc = getLocalPath(url, baseUrl);
    if (await fs.access(loc).then(() => true).catch(() => false)) {
      if (!resourceMap.has(url)) resourceMap.set(new URL(url, baseUrl).href, path.relative(OUTPUT_DIR, loc).replace(/\\/g,'/'));
      return;
    }
    const parsedUrl = new URL(url);

    /* The file is ok, going on...*/
    log(`🌐${type}: ${url}`);

    await fs.mkdir(path.dirname(loc), { recursive: true });
    await new Promise((resolve, reject) => {
      const req = (url.startsWith('https') ? https : http).get(url, r => {
        if (r.statusCode !== 200) {
          logs.push({ url, error: `Status: ${httpStatusCodes[r.statusCode]}` });
          log(`❌ Status of${type?.toLowerCase()}${filename?.toLowerCase()}: ${httpStatusCodes[r.statusCode]}`);
        }
        resourceMap.set(new URL(url, baseUrl).href, path.relative(OUTPUT_DIR, loc).replace(/\\/g,'/'));
        reportProgress();
        const ws = createWriteStream(loc);
        r.pipe(ws);
        ws.on('finish', resolve);
        ws.on('error', msg => { log(`❌ Error on writing${filename}: ${msg}`); reject(); });
      });
      req.on('error', msg => { log(`❌ Error while retrieving${filename}: ${msg}`); reject(); });
    });
  } catch (e) {
    logs.push({ url, error: e.message || e.toString() });
    log(`❌ Error:${type}${filename}: ${e.message || e.toString()}`);
  }
}

/* Take the url of a file and create the local path to save the file to */
function adjustLinks(html, baseUrl) {
  const fromPath = getLocalPath(baseUrl, TARGET_URL);
  return html.replace(/(href|src)=["']([^"']+)["']/g, (m, attr, link) => {
    try {
      const full = new URL(link, baseUrl).href;
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

/* Checks every css file for resources that should be downloaded as well */
async function extractCssResources(cssContent, baseUrl) {
  const regex = /url\((['"]?)([^'")]+)\1\)/g;
  const matches = new Set();
  let match;
  while ((match = regex.exec(cssContent)) !== null) {
    const relUrl = match[2];
    if (!relUrl.startsWith("data") && new URL(relUrl, baseUrl).href.startsWith(baseUrl)) {
      try {
        matches.add(new URL(relUrl, baseUrl).href);
      } catch {}
    }
  }
  for (const u of matches) tasks.push(limit(async () => await downloadResource(u, baseUrl, "css")));
}

/* Starting point for downloading any html file */
async function crawl(url, depth, browser, recursive = null) {
  if (visited.has(url) || depth > MAX_DEPTH) return;

  /* Remember the url of this html file */
  visited.add(url);
  sitemap.push(url);

  // Print the progress
  await reportProgress();

  /* Open a new page (puppeteer) */
  const page = await browser.newPage();

  /* Event handler for dynamically initiated file requests on the page */
  page.on('request', async (request) => {
    const url = request.url();
    const type = request.resourceType();
    try {
      if (shouldIgnoreUrl(url)) return;
      if (!['image', 'stylesheet', 'script', 'font', 'xhr', 'other'].includes(type)) return;
      const parsedUrl = new URL(url.split(url.includes("#") ? "#" : "?")[0]);
      const href = parsedUrl.href;
      let resourcePath = sanitize(parsedUrl.pathname);
      if (!path.extname(resourcePath)) resourcePath += resourcePath.endsWith("/") ? "index.html" : "/index.html";
      const localPath = path.join(OUTPUT_DIR, resourcePath);
      const relativePath = path.relative(OUTPUT_DIR, localPath).replace(/\\/g, '/');
      if (href.endsWith(".html") || href.endsWith(".htm")) {
        if (visited.has(href)) {
          if (!sitemap.includes(href)) sitemap.push(href);
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
      log(`❌ Error fetching dynamic Resource ${url.split("/").pop()}: ${err.message}`);
    }
  });

  try {
    log(`🌐 Site (Depth ${depth}): ${url}`);

    /* Open the website url in puppeteer */
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    /* Scroll down the body of the site in order to catch
       files that are dynamically requested by an on-scroll trigger */
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));

    /* Wait for any other dynamically requested files */
    await new Promise(resolve => setTimeout(resolve, DYNAMIC_WAIT_TIME));

    /* Create an array with all valid links and sources found in the html file */
    const resUrls = await page.evaluate(() => {
      const urls = new Set();
      const shouldIgnoreUrl = u => {
        if (!u) return true;
        if (u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:') || u.startsWith('chrome:') || u.startsWith('filesystem:')) return true;
        if (u.includes("#")) return true;
        try { if (new URL(u, location.origin).origin === "null" || new URL(u, location.origin).hostname !== new URL(location.href).hostname) return true; } catch { return true; }
        return false;
      };
      const els = Array.from(document.querySelectorAll('[src], [href], source[src], source[srcset], img[srcset], video[poster]'));
      for (const el of els) {
        try {
          if (el.src && !shouldIgnoreUrl(el.src)) urls.add(el.src);
          if (el.href && !shouldIgnoreUrl(el.href)) urls.add(el.href);
          if (el.poster && !shouldIgnoreUrl(el.poster)) urls.add(el.poster);
          if (el.srcset) {
            const srcset = el.srcset;
            srcset.split(',').forEach(s => {
              const parts = s.trim().split(' ');
              if (parts[0] && !shouldIgnoreUrl(parts[0])) urls.add(parts[0]);
            });
          }
        } catch (e) { /* ignore individual element issues */ }
      }
      // also scan inline styles for url(...)
      const styleEls = Array.from(document.querySelectorAll('style'));
      for (const s of styleEls) {
        if (s.textContent) {
          const regex = /url\((['"]?)([^'")]+)\1\)/g;
          const matches = new Set();
          let match;
          while ((match = regex.exec(s.textContent))) {
            const relUrl = match[2];
            if (!shouldIgnoreUrl(relUrl)) {
              try {
                matches.add(new URL(relUrl, location.origin).href);
              } catch {}
            }
          }
          for (const match of [...matches]) urls.add(match);
        }
      }
      // return array
      return Array.from(urls);
    });

    //
    // const resUrls = await page.$$eval('*', els => {
    //
    //   const urls = new Set();
    //   let linkUrl;
    //
    //   /* Run through all html elements to see if any element has a src, a href
    //      or a srcset attribute, or if there are any <source...> elements */
    //   for (const el of els) {
    //     let src = el.src || el.href;
    //     if (src) {
    //       if (!src.startsWith("data:") && !src.startsWith("blob:")) {
    //         src = (new URL(src).href).split(src.includes("?") ? "?" : "#")[0];
    //         if (!/\./.test(src.split("/").pop())) src += src.endsWith("/") ? "index.html" : "/index.html";
    //         urls.add(src);
    //       }
    //     }
    //
    //     const srcset = el.getAttribute?.('srcset');
    //     if (srcset) {
    //       srcset.split(',').forEach(entry => {
    //         const [url] = entry.trim().split(' ');
    //         if (url) urls.add(url.split("?")[0]);
    //       });
    //     }
    //
    //     if (el.tagName === 'SOURCE' && el.getAttribute?.('src')) {
    //       urls.add(el.getAttribute('src').split("?")[0]);
    //     }
    //   }
    //
    //   const filteredUrls = [...urls].filter(Boolean).filter(h => h.startsWith(location.origin || ''));
    //   return filteredUrls;
    // });

    /* Loop through all found urls */

    for (const raw of resUrls) {
      let res;
      try {
        res = new URL(raw, url).href;
      } catch {
        continue;
      }
      /* Check if a url is not a normally link or source */
      if (shouldIgnoreUrl(res)) continue;
      if (!recursive || (RECURSIVE && depth < MAX_DEPTH)) {
        if (!await fs.access(getLocalPath(res, TARGET_URL)).then(() => true).catch(() => false)) {
          if (res.endsWith('.html') || res.endsWith('.htm')) {
            if (visited.has(res)) !sitemap.includes(res) && sitemap.push(res);
            else tasks.push(limit(() => crawl(res, depth + 1, browser, 1)));
          } else {
            if (!resourceMap.has(res)) {
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
                console.log(`❌ Error fetching resource ${res}: ${e.message || e.toString()}`);
                logs.push({ url: res, error: e.message || e.toString() });
              }
            }
          }
        }
      }
    }

    // Get the original source code from the html file (not the source from the rendered dom)
    if (!await fs.access(getLocalPath(url, TARGET_URL)).then(() => true).catch(() => false)) {
      let html = await fetch(url);
      html = await html.text();
      const adjusted = adjustLinks(html, url); // Make links relative
      const locHtml = getLocalPath(url, TARGET_URL); // Build the local folder name to save the file to
      await fs.mkdir(path.dirname(locHtml), { recursive: true }); // Create that folder...
      await fs.writeFile(locHtml, adjusted, 'utf8'); // ... and save the file in there
    }
    try { await page.close(); } catch {}

  } catch (e) {
    log(`❌ Error processing ${url}: ${e.message || e.toString()}`);
    logs.push({ url, error: e.message || e.toString() });
    try { await page.close(); } catch {}
  }
}

(async () => {

  /* Show current settings in the gui
    (or inside the console when using the cli) */
  log(`📃URL: ${TARGET_URL}\nDownload channels: ${SIMULTANEOUS}\nLocal path: ${OUTPUT_DIR}\nRecursion: ${RECURSIVE ? "enabled" : "disabled"}\nDepth: ${MAX_DEPTH}\nWait time for dynamically fetched sources: ${DYNAMIC_WAIT_TIME}ms\n${ZIP_EXPORT ? "ZIP archive will be created" : ""}\n${CLEAN_MODE ? "Cleaning target folder" : ""}`);

  if (CLEAN_MODE && existsSync(OUTPUT_DIR)) {
    await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
    log('♻️ Clean: Folder deleted.');
  }

  /* Create the download folder for the website */
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  /* Start the browser, wait for the whole website to download
     and close the browser after all downloads are finished */
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  await crawl(TARGET_URL, 0, browser);
  //await new Promise(m => setTimeout(m, 200));
  await Promise.allSettled(tasks);
  await browser.close();
  /* Create a zip file containing the whole website */
  if (ZIP_EXPORT) {
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
  /* Write sitemap and log files */
  await finish();
})();
