
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
const ZIP_EXPORT = args.includes('--zip') || args.includes('-z');
const CLEAN_MODE = args.includes('--clean') || args.includes('-c');
const RECURSIVE = args.includes('--recursive') || args.includes('-r');
const MAX_DEPTH = depthArg ? parseInt(depthArg.split('=')[1], 10) : Infinity;
const SIMULTANEOUS = simulArg ? parseInt(simulArg.split('=')[1], 10) : 4;
const OUTPUT_DIR = outArg ? path.join(outArg.split('=')[1].replace(/^["']|["']$/g, ''), new URL(TARGET_URL).hostname) : path.join(process.cwd(), new URL(TARGET_URL).hostname);
const DYNAMIC_WAIT_TIME = dynArg ? parseInt(dynArg.split('=')[1], 10) : 3000;

/* If no website url is found, exit the tool */
if (!TARGET_URL) {
  console.log('❌ Please enter a URL!');
  process.exit(1);
}

const resourceMap = new Map(); // Contains all resource urls together with the corresponding local adresses
const visited = new Set(); // Contains all downloaded html file urls, to check if an html file is already downloaded
const assetTasks = []; // Queue for downloads
const sitemap = []; // List of the original addresses of all downloaded files
const logs = []; // List of all errors occured in the process

/* Functions */

/* Clean any url or filename */
function sanitize(p) {
  return decodeURIComponent(p.replace(/[^a-z0-9/\-_.]/gi, '_').replace(/_+/g, '_'));
}

/* The download queue function */
const pLimit = concurrency => {
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
};

function getLocalPath(resourceUrl, baseUrl) {
  const u = new URL(resourceUrl, baseUrl);
  let pathname = u.pathname.replace(/\/+$|^\//g, '');
  if (!path.extname(pathname)) pathname = path.join(pathname, 'index.html');
  const safe = pathname.split('/').map(sanitize).join('/');
  return path.join(OUTPUT_DIR, safe);
}

async function downloadResource(url, baseUrl) {
  try {
    /* Check cases where the file will not be downloaded */
    const loc = getLocalPath(url, baseUrl);
    if (await fs.access(loc).then(() => true).catch(() => false)) return;
    const parsedUrl = new URL(url);
    if (!parsedUrl.href.startsWith(TARGET_URL)) return;
    const filename = parsedUrl.href.split("/").pop();
    if (!filename.includes(".") || filename.includes("#")) return;

    /* The file is ok, going on...*/
    console.log(`🌐 File: ${url}`);

    await fs.mkdir(path.dirname(loc), { recursive: true });

    await new Promise((res, rej) => {
      const proto = url.startsWith('https') ? https : http;
      const req = proto.get(url, r => {
        if (r.statusCode !== 200) return rej(new Error(`Status ${r.statusCode}`));
        const ws = createWriteStream(loc);
        r.pipe(ws);
        ws.on('finish', res);
        ws.on('error', rej);
      });
      req.on('error', rej);
    });

    resourceMap.set(new URL(url, baseUrl).href, path.relative(OUTPUT_DIR, loc).replace(/\\/g,'/'));

    await reportProgress();

  } catch (e) {
    logs.push({ url, error: e.message || e.toString() });
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
  for (const u of matches) await downloadResource(u, baseUrl);
}

/* Print information about the download progress */
function reportProgress() {
  const total = visited.size + logs.length;
  const percent = total > 0 ? (visited.size / total) * 100 : 0;
  return console.log(`progress:📊 ${visited.size} Sites, ${resourceMap.size} Files, ${logs.length} Errors (${percent.toFixed(1)}%)`);
}

/* Starting point for downloading any html file */
async function crawl(url, depth, browser) {

  if (visited.has(url) || depth > MAX_DEPTH) return;

  /* Remember the url of this html file */
  visited.add(url);
  sitemap.push(url);

  /* Open a new page (puppeteer) */
  const page = await browser.newPage();

  /* Event handler for dynamically initiated file requests on the page */
  page.on('request', async (request) => {
    try {
      const url = decodeURIComponent(request.url());
      const type = request.resourceType();

      if (url.startsWith("blob:") || url.startsWith("data:")) return;
      if (!['image', 'stylesheet', 'script', 'font', 'xhr', 'other'].includes(type)) return;
      const parsedUrl = new URL(url);
      const filename = parsedUrl.href.split("/").pop();
      if (!parsedUrl.href.includes(TARGET_URL)) return;
      if (!filename.includes(".") || filename.includes("#")) return;

      let resourcePath = sanitize(parsedUrl.pathname);
      const ext = path.extname(resourcePath) || '.bin';
      if (!resourcePath.endsWith(ext)) resourcePath += ext;

      const localPath = path.join(OUTPUT_DIR, resourcePath);
      const relativePath = path.relative(OUTPUT_DIR, localPath).replace(/\\/g, '/');

      if (!resourceMap.has(url)) {
        resourceMap.set(url, relativePath);
        await downloadResource(url, localPath);
      }
    } catch (err) {
      console.error('Request Error:', err.message);
    }
  });

  try {
    console.log(`🌐 Site (Depth ${depth}): ${url}`);

    /* Open the website url in puppeteer */
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    /* Scroll down the body of the site in order to catch
       files that are dynamically requested by an on-scroll trigger */
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    /* Wait for any other dynamically requested files */
    await new Promise(resolve => setTimeout(resolve, DYNAMIC_WAIT_TIME));

    let html = await fetch(url);
    html = await html.text();

    /* Create an array with all valid links and sources found in the html file */
    const resUrls = await page.$$eval('*', els => {

      const urls = new Set();
      let src, href;

      /* Run through all html elements to see if any element has a src, a href
         or a srcset attribute, or if there are any <source...> elements */
      for (const el of els) {
        [src, href] = [el.src, el.href];
        if (src || href) {
          if (src && src.endsWith("/")) src += "index.html";
          if (href && href.endsWith("/")) href += "index.html";
          src && (src = src.split("?")[0]);
          href && (href = href.split("?")[0]);
          urls.add(src || href);
        }

        const srcset = el.getAttribute?.('srcset');
        if (srcset) {
          srcset.split(',').forEach(entry => {
            const [url] = entry.trim().split(' ');
            if (url) urls.add(url.split("?")[0]);
          });
        }

        if (el.tagName === 'SOURCE' && el.getAttribute?.('src')) {
          urls.add(el.getAttribute('src').split("?")[0]);
        }
      }
      return [...urls].filter(Boolean).filter(h => h.startsWith(location.origin || '') && !h.endsWith("#"));
    });

    /* Set the limit of simultaneous downloaded files */
    const limit = pLimit(SIMULTANEOUS);

    const queue = [];
    await reportProgress();

    /* Loop through all found urls */
    for (const raw of resUrls) {
      let res;
      try {
        res = new URL(decodeURIComponent(raw), url).href;
      } catch {
        continue;
      }

      const isSameHost = new URL(res).hostname === new URL(TARGET_URL).hostname;

      /* Check if a url is not a normally link or source */
      if (!res || res.startsWith("data:") || res.startsWith("blob:") || !isSameHost) continue;

      const isHtml = res.endsWith('.html');
      const isCss = res.endsWith('.css');

      /* Call this function ( crawl() ) for all linked html files */
      if (isHtml && RECURSIVE && depth < MAX_DEPTH) {
        queue.push(limit(() => crawl(res, depth + 1, browser)));
      } else {

        /* If it is no html file, just download it. If it is a css file,
           check it for further sources that have to be downloaded as well */
        queue.push(limit(async () => {
          await downloadResource(res, url);
          if (isCss) {
            try {
              const cssPath = getLocalPath(res, url);
              const cssContent = await fs.readFile(cssPath, 'utf8');
              await extractCssResources(cssContent, res);
            } catch (e) {
              console.log(`❌ Error on analyzing CSS: ${e.message || e.toString()}`);
              logs.push({ url: res, error: e.message || e.toString() });
            }
          }
        }));
      }
    }

    await Promise.all(queue);

    const adjusted = adjustLinks(html, url); // Make links relative
    const locHtml = getLocalPath(url, TARGET_URL); // Build the local folder name to save the file to
    await fs.mkdir(path.dirname(locHtml), { recursive: true }); // Create that folder...
    await fs.writeFile(locHtml, adjusted, 'utf8'); // ... and save the file in there
    await page.close();

  } catch (e) {
    console.log(`⚠️ Error while loading ${url}: ${e.message || e.toString()}`);
    logs.push({ url, error: e.message || e.toString() });
    await page.close();
  }
}

/* When the downloads are finished, create the sitemap.json and the log.json */
async function finish() {
  const map = [...resourceMap].map(r => r[0]);
  await fs.writeFile(path.join(OUTPUT_DIR, 'sitemap.json'), JSON.stringify([...sitemap, ...map], null, 2));
  console.log('🧭 Sitemap created.');
  await fs.writeFile(path.join(OUTPUT_DIR, 'log.json'), JSON.stringify(logs, null, 2));
  console.log('📝 Log created.');
}

/* Stop any activity of the tool, if the abort button in the gui is pressed */
process.stdin.on('data', async data => {
  const command = data.toString().trim();
  if (command === 'abort') {
    await finish();
    process.exit(1);
  }
});

(async () => {

  /* Show current settings in the gui
    (or inside the console when using the cli) */
  console.log(`settings:\nDownloading with ${SIMULTANEOUS} channels from ${TARGET_URL}\nFiles are saved to: ${OUTPUT_DIR}\nRecursion is ${RECURSIVE ? "enabled" : "disabled"}\nDepth: ${MAX_DEPTH}\nWaiting ${DYNAMIC_WAIT_TIME}ms for dynamically loaded files\n${ZIP_EXPORT ? "A" : "No"} ZIP archive will be created\nTarget folder is${CLEAN_MODE ? " cleaned" : "n't cleaned\n"}`);

  if (CLEAN_MODE && existsSync(OUTPUT_DIR)) {
    await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
    console.log('♻️ Clean: Folder deleted.');
  }

  /* Create the download folder for the website */
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  /* Start the browser, wait for the whole website to download
     and close the browser after all downloads are finished */
  const browser = await puppeteer.launch({ headless: true });
  await crawl(TARGET_URL, 0, browser);
  await browser.close();

  /* Write sitemap and log files */
  await finish();

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
    console.log('📦 ZIP created.');
  }
})();
