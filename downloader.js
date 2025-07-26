// downloader.js

const fs = require('fs/promises');
const path = require('path');
const { existsSync, createWriteStream } = require('fs');
const https = require('https');
const http = require('http');
const puppeteer = require('puppeteer');
const JSZip = require('jszip');
const pLimit = require('p-limit');
const limit = pLimit(8); // max. 8 gleichzeitige Tasks

const htmlLinks = [];
const assetTasks = [];

// CLI-Argumente
const isElectron = !!process.send;
const args = process.argv.slice(2);
const TARGET_URL = args[0];
const ZIP_EXPORT = args.includes('--zip') || args.includes('-z');
const CLEAN_MODE = args.includes('--clean') || args.includes('-c');
const RECURSIVE = args.includes('--recursive') || args.includes('-r');
const depthArg = args.find(arg => arg.startsWith('--depth=') || arg.startsWith('-d='));
const MAX_DEPTH = depthArg ? parseInt(depthArg.split('=')[1], 10) : Infinity;

if (!TARGET_URL) {
  console.log('❌ Bitte gib eine URL ein!');
  process.exit(1);
}

// Speicherordner
const outArg = args.find(arg => arg.startsWith('--outdir=') || arg.startsWith('-o='));
const OUTPUT_DIR = outArg
  ? path.join(outArg.split('=')[1].replace(/^["']|["']$/g, ''), new URL(TARGET_URL).hostname)
  : path.join(process.cwd(), new URL(TARGET_URL).hostname);

// Zustandskontrolle
const visited = new Set();
const resourceMap = new Map();
const sitemap = [];
const logs = [];


// Hilfsfunktionen
function sanitize(p) {
  return p.replace(/[^a-z0-9\-_.]/gi, '_').replace(/_+/g, '_');
}

function getLocalPath(resourceUrl, baseUrl) {
  const u = new URL(resourceUrl, baseUrl);
  let pathname = u.pathname.replace(/\/+$|^\//g, '');
  if (!path.extname(pathname)) pathname = path.join(pathname, 'index.html');
  const safe = pathname.split('/').map(sanitize).join('/');
  return path.join(OUTPUT_DIR, safe);
}

async function downloadResource(url, baseUrl) {
  try {
    const loc = getLocalPath(url, baseUrl);
    if (await fs.access(loc).then(() => true).catch(() => false)) return;
    console.log(`🌐 Datei: ${url}`);
    await fs.mkdir(path.dirname(loc), { recursive: true });
    await new Promise((res, rej) => {
      const proto = url.startsWith('https') ? https : http;
      const req = proto.get(url, r => {
        if (r.statusCode !== 200) return rej(new Error(`Status ${r.statusCode}`));
        const ws = createWriteStream(loc);
        r.pipe(ws);
        ws.on('finish', () => {
          return res();
        });
        ws.on('error', rej);
      });
      req.on('error', rej);
    });
    resourceMap.set(new URL(url, baseUrl).href, path.relative(OUTPUT_DIR, loc).replace(/\\/g,'/'));
    reportProgress();
  } catch (e) {
    logs.push({ url, error: e.message || e.toString() });
  }
}

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

function reportProgress() {
  const total = visited.size + logs.length;
  const percent = total > 0 ? (visited.size / total) * 100 : 0;
  console.log(`progress:📊 ${visited.size} Seiten, ${resourceMap.size} Dateien, ${logs.length} Fehler (${percent.toFixed(1)}%)`);
}

async function crawl(url, depth, browser) {
  if (visited.has(url) || depth > MAX_DEPTH) return;
  visited.add(url);
  sitemap.push(url);

  const page = await browser.newPage();
  try {
    console.log(`🌐 Seite (Tiefe ${depth}): ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    let html = await fetch(url);
    html = await html.text();

    reportProgress();

    // Ressourcen erfassen
    const resUrls = await page.$$eval('*', els => {

      const urls = new Set();
      let src, href;

      for (const el of els) {
        [src, href] = [el.src, el.href];
        if (src || href) {
          if (src && src.endsWith("/")) continue;
          if (href && href.endsWith("/")) continue;
          src && (src = src.split("?")[0]);
          href && (href = href.split("?")[0]);
          urls.add(src || href);
        }

        // <img srcset> und <source srcset>
        const srcset = el.getAttribute?.('srcset');
        if (srcset) {
          srcset.split(',').forEach(entry => {
            const [url] = entry.trim().split(' ');
            if (url) urls.add(url.split("?")[0]);
          });
        }

        // <video><source src=...>
        if (el.tagName === 'SOURCE' && el.getAttribute?.('src')) {
          urls.add(el.getAttribute('src').split("?")[0]);
        }
      }
      return  [...urls].filter(Boolean).filter(h => h.startsWith(location.origin || '') && !h.endsWith("#"));
    });

    const pLimit = (concurrency) => {
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

    const limit = pLimit(8);
  const assetTasks = [];

  for (const raw of resUrls) {
    let res;
    try {
      res = new URL(raw, url).href;
    } catch {
      continue;
    }

    const isSameHost = new URL(res).hostname === new URL(TARGET_URL).hostname;
    if (!res || res.startsWith("data") || !isSameHost) continue;

    const isHtml = res.endsWith('.html');
    const isCss = res.endsWith('.css');

    if (isHtml && RECURSIVE && depth < MAX_DEPTH) {
      // Unterseite: rekursiv crawlen
      //htmlLinks.push(res);
      assetTasks.push(limit(() => crawl(res, depth + 1, browser)));
    } else {
      // Asset (Bild, CSS, JS, etc.): herunterladen
      assetTasks.push(limit(async () => {
        await downloadResource(res, url);

        // Falls CSS: darin eingebettete URLs parsen (Fonts, Background-Images)
        if (isCss) {
          try {
            const cssPath = getLocalPath(res, url);
            const cssContent = await fs.readFile(cssPath, 'utf8');
            await extractCssResources(cssContent, res);
          } catch (e) {
            console.log(`❌ CSS-Analyse fehlgeschlagen: ${e.message || e.toString()}`);
            logs.push({ url: res, error: e.message || e.toString() });
          }
        }
      }));
    }
  }

  await Promise.all(assetTasks);

    // Jetzt HTML-Dateien rekursiv **nacheinander** crawlen
    for (const link of htmlLinks) {
      await crawl(link, depth + 1, browser);
    }

    // HTML anpassen & speichern
    const adjusted = adjustLinks(html, url);
    const locHtml = getLocalPath(url, TARGET_URL);
    await fs.mkdir(path.dirname(locHtml), { recursive: true });
    await fs.writeFile(locHtml, adjusted, 'utf8');
    await page.close();

  } catch (e) {
    console.log(`⚠️ Fehler beim Laden von ${url}: ${e.message || e.toString()}`);
    logs.push({ url, error: e.message || e.toString() });
    await page.close();
  }
}

(async () => {
  console.log(`settings:Ziel: ${TARGET_URL}#Unterseiten durchsuchen: ${RECURSIVE ? "Ja" : "Nein"}#Tiefe: ${MAX_DEPTH}#ZIP erstellen: ${ZIP_EXPORT ? "Ja" : "Nein"}#Ordner leeren: ${CLEAN_MODE ? "Ja" : "Nein"}`);
  if (CLEAN_MODE && existsSync(OUTPUT_DIR)) {
    await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
    console.log('♻️ Clean: Ordner gelöscht');
  }
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({ headless: true });
  await crawl(TARGET_URL, 0, browser);
  await browser.close();

  // Sitemap & Logs
  const map = [...resourceMap].map(r => r[0]);
  await fs.writeFile(path.join(OUTPUT_DIR, 'sitemap.json'), JSON.stringify([...sitemap, ...map], null, 2));
  console.log('🧭 Sitemap erstellt');
  await fs.writeFile(path.join(OUTPUT_DIR, 'log.json'), JSON.stringify(logs, null, 2));
  console.log('📝 Log erstellt');

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
    console.log('📦 ZIP erstellt');
  }
})();
