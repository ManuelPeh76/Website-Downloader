# Website Downloader

## Project Overview
**Website Downloader** is an Electron-based desktop application that downloads entire websites (including dynamic content) for offline use. It combines Puppeteer for rendering and crawling with Node.js backend processing and an Electron GUI.

### Tech Stack
- **Frontend**: Electron (HTML/CSS/JS in `src/gui.html` + `src/renderer.js`)
- **Backend**: Node.js (`src/download.js`)
- **Key Dependencies**: Puppeteer (rendering), JSZip (archive creation), ntsuspend (process management)
- **Build Tools**: electron-packager, electron-installer-windows

---

## Architecture & Data Flow

### Three-Process Architecture

```
┌─ Electron Main Process (src/main.js)
│   ├─ Creates BrowserWindow with contextIsolation=true
│   ├─ Manages IPC channels (start-download, select-folder, abort, pause, resume)
│   └─ Spawns child Node process for heavy downloads
│
├─ Electron Renderer Process (src/renderer.js)
│   ├─ GUI input handling, history, theme, modals
│   ├─ Real-time progress display
│   └─ Sends download config → Main via IPC
│
└─ Node.js Child Process (src/download.js)
    ├─ Launches Puppeteer browser
    ├─ Crawls & downloads resources concurrently
    ├─ Emits progress via stdout (piped to Renderer)
    └─ Handles ZIP export & sitemap generation
```

### Critical IPC Bridges (preload.js)
- **Renderer → Main**: `startDownload()`, `selectFolder()`, `abortDownload()`, `pauseDownload()`, `resumeDownload()`, `saveProgress()`
- **Main → Renderer**: `onLog()` listener for stdout streaming
- **Security Model**: `contextIsolation=true`, `nodeIntegration=false` — use preload.js for all Node API access

---

## Download Flow & Configuration

### Entry Point: renderer.js → download.js
1. User fills form in GUI → `startDownload()` called with config object
2. Main process spawns `node src/download.js <url> [options]`
3. Options passed as CLI flags (e.g., `--folder=`, `--depth=`, `--recursive`, `--zip`, `--debug`)
4. download.js streams progress lines to stdout → piped to Renderer's `onLog()` listener

### Key Concurrency & Resource Patterns
- **Concurrency Control**: Uses `pLimit(CONCURRENCY)` — limits parallel downloads (default 8, configurable 1-32)
- **Resource Map**: Stores `resourceMap<url → localPath>` — deduplicates requests
- **Visited Set**: Tracks crawled HTML pages (`visited<url>`) — prevents infinite recursion
- **Folder Naming**: Auto-creates subdirectory named after hostname: `output_folder/example.com/`

### Dynamic Content Handling
- **Puppeteer Approach**: Renders pages via headless browser, not HTML parsing
- **DYNAMIC_WAIT_TIME (dwt)**: After page load, waits N ms for XHR/fetch-loaded assets (default 3000ms, user-configurable)
- **Asset Detection**: Extracts from:
  - HTML `<img>`, `<script>`, `<link>`, `<source>`, `<iframe>` tags
  - CSS `url()` and `@import` declarations
  - Manifest.json (Web App manifests, icons, splash screens)
  - Meta tags (OpenGraph, Twitter Cards)
  - `srcset`, `poster` attributes

### Recursive Crawling
- If `--recursive` flag set: extracts links from every downloaded page up to `--depth` (default Infinity)
- **Depth-First Search (DFS)** approach: processes queue page-by-page

---

## File Structure & Responsibilities

| File | Purpose |
|------|---------|
| `src/main.js` | Electron app lifecycle, window setup, IPC handlers, child process spawning |
| `src/renderer.js` | GUI interaction, form state, History/Modal classes, progress display, API calls to main |
| `src/download.js` | Core download logic: Puppeteer browser control, resource fetching, URL rewriting, export (ZIP/sitemap) |
| `src/preload.js` | Security bridge: exposes IPC methods to renderer via `window.api` |
| `src/gui.html` | UI markup, form inputs, progress display, debug mode |
| `src/history.js` | `History` class: manages input history with arrow-key navigation + localStorage persistence |
| `src/modal.js` | `Modal` class: window management (minimize/maximize/restore/close modals) |
| `src/style.css` | CSS + theme variables for dark/light mode |

---

## Development Workflows

### Running the App
```bash
npm start          # Start Electron app (production)
npm run dev        # Start with auto-reload (electronmon)
npm run build      # Package as Windows .exe (electron-packager)
npm run setup      # Create Windows installer (electron-installer-windows)
```

### Key Debugging Approaches
1. **Debug Mode**: Press `Ctrl+Shift+D` in GUI to toggle debug checkbox → opens modal with detailed logs
2. **stdout Streaming**: All download.js logs emit to process.stdout → piped through IPC to Renderer

### Testing/Development Pattern
- **Renderer.js**: Has fallback `window.api` mock for browser testing (see lines ~28-45) — allows GUI testing without Electron
- **Process Arguments**: download.js parses CLI flags — can be tested standalone via `node src/download.js <url> [flags]`

---

## Project-Specific Patterns & Conventions

### 1. **IPC Command Structure**
Arguments bundled in single config object (not multiple params):
```javascript
// src/renderer.js sends this:
window.api.startDownload({ url, zip, clean, depth, recursive, folder, concurrency, dwt, useIndex, log, sitemap, debug })

// src/main.js unpacks and converts to CLI flags for child process
```

### 2. **Output Directory Logic**
- If user specifies `--folder=/home/downloads`, final path becomes `/home/downloads/example.com/`
- Hostname automatically appended: `new URL(TARGET_URL).hostname`
- Paths normalized to posix format internally: `.replace(/\\/g, '/').replace(/\/+$/, '')`

### 3. **History & Input State**
- `History` class (src/history.js): wraps DOM input elements
- Persists to `localStorage` per input ID
- Arrow Up/Down navigates, Delete removes entries
- Used for URL + target folder fields

### 4. **Logging Architecture**
- **Progress Logs**: Streamed from download.js during run
- **Optional Error Log**: If `--log` flag, errors saved to `errors.txt` in output folder
- **Sitemap Export**: If `--sitemap` flag, generates `sitemap.json` with all downloaded resources

### 5. **Process Lifecycle**
- Main spawns child process, captures stdout/stderr
- Renderer listens to `ipcMain.send('log', data)` for real-time display
- Download.js can receive stdin commands for pause/resume/abort (see stdin handler in download.js)

---

## Important Implementation Notes

### Asset Rewriting
When downloading resources, download.js rewrites URLs in HTML/CSS:
- `href="/styles/main.css"` → `href="styles/main.css"` (relative paths)
- External URLs → mapped to local paths stored in `resourceMap`
- Index.html special handling: if `--use-index`, URLs without extensions become `index.html` for offline compatibility

### Concurrent Download Limits
- Default concurrency: 8 parallel downloads
- Configurable via `--concurrency=N` (affects Puppeteer resource fetching + asset downloads)
- Use `pLimit` from p-limit library for queue management

### Manifest.json & Web Apps
- If target URL is a PWA, download.js extracts `manifest.json`
- Processes icons, splash screens, start URLs from manifest
- Enables offline PWA functionality

### Error Handling
- Failed downloads logged to `logs` array
- HTTP status codes mapped to names (500+ errors flagged prominently in debug mode)
- Broken URLs added to `failed` Set to avoid retry

---

## Build & Distribution

- **Windows EXE**: `npm run build` creates executable in `dist/website-downloader-win32-x64/`
- **Installer**: `npm run setup` wraps EXE with Windows installer (installs to `C:\Users\<user>\AppData\Local\website_downloader`)
- **Entry Point**: `package.json` main is `src/main.js`

---

## Key Dependencies & Why

| Dependency | Purpose |
|------------|---------|
| `puppeteer` | Headless browser rendering for JS-heavy sites, XHR/fetch interception |
| `jszip` | ZIP archive creation for offline export |
| `electron` | Desktop app framework (UI + cross-platform packaging) |
| `ntsuspend` | Windows process suspend/resume (for pause/resume feature) |
| `electron-packager` | Builds standalone Windows executable |
| `electron-installer-windows` | Creates Windows installer with NSIS |

---

## Performance Tuning: Concurrency & Dynamic Wait Time (dwt)

### Understanding the Parameters

**Concurrency (`--concurrency=N`)**

- Controls the **maximum number of parallel resource downloads** at the same time
- Also affects Puppeteer's internal resource requests (images, scripts, etc.)

- Higher values ​​= faster, but higher memory consumption and network load

- Lower values ​​= slower, but more stable on weak systems

**Dynamic Wait Time (dwt - `--dyn_wait_time=N` in ms)**

- Time the browser waits **after loading the page** before starting the next download

- Gives JavaScript code time to load additional resources via XHR/Fetch

- Important for Single-Page Applications (SPAs) and lazy-loading techniques

- Too short = resources are missed; Too long = unnecessary delay

### Recommended configurations by page type

#### 1. **Static Websites** (HTML/CSS/JS hardcoded)
```
Concurrency: 16–24
DWT: 1000ms (minimal, as no dynamic content is expected)
Reason: Low JS processing → more aggressive parallelization is safe
```
#### 2. **Classic server-side rendered pages** (PHP, Django, Rails)
```
Concurrency: 12–16
DWT: 2000–3000ms (default)
Reason: Little dynamic content, but occasional AJAX messages
```
#### 3. **React/Vue/Angular SPAs** (client-side rendered)
```
Concurrency: 8–12
DWT: 4000–6000ms (increased)
Reason: JS framework loads initial bundle, additional chunks via XHR; browser needs time to render
```
#### 4. **Lazy-loading / Infinite-scroll pages** (e.g., social media, e-commerce)
```
Concurrency: 4–8
DWT: 5000–8000ms (high)
Reason: Assets are loaded after scrolling/clicking; takes a long time to load completely
Note: Recursive crawling is not recommended, as content is potentially unlimited
```
#### 5. **GraphQL / API-heavy pages** (e.g., modern web apps)
```
Concurrency: 6–10
DWT: 5000–7000ms
Reason: GraphQL queries take time; Many parallel requests can lead to rate limiting.
```
#### 6. **High-Performance / CDN-Optimized Sites** (e.g., Netflix, YouTube)
```
Concurrency: 1–4 (with caution)
DWT: 3000–5000 ms
Reason: High CPU/memory demands; Aggressive caching can lead to blocking
```

### Practical Optimization Strategies

#### **Optimize Memory**
- If the download fails or an "Out of Memory" error occurs:
  - **Reduce concurrency** (e.g., 12 → 8 or even 4)
  - **Increase DWT** (gives garbage collection time)
  - Enable debug mode (`Ctrl+Shift+D`) → monitor memory usage in the logger

#### **Optimize Speed**
- Start with **conservative values** (Concurrency: 8, DWT: 3000)
- **Increase gradually**: +2 for concurrency, -500ms for DWT after a successful test run
- Stop if errors occur or browser crashes

#### **For Recursive Crawling** (`--recursive`)
- **Lower concurrency** than for single-page crawls (Reduce by 30-50%)
- **Slightly increase DWT** (e.g., from 3000ms to 4000ms), as multiple page transitions occur
- **Set Max Depth** (`--depth=3` or `--depth=5`) to prevent an explosion in the number of downloads

#### **For weak systems** (< 8 GB RAM)
```
Standard recommendation:
- Concurrency: 4–6
- DWT: 3000–4000ms
- Enable folder cleanup (--clean) to free up memory
- Use ZIP export only when necessary
```

### Troubleshooting

| Problem | Cause | Solution |
|---------|--------|--------|
| Browser crashes during download | Concurrency or DWT too high | Halve concurrency, increase DWT by 1000ms |
| Overlooked resources | DWT too short | Increase DWT by 2000–3000ms, check debug mode if necessary |
| Extremely slow speed | Concurrency too low | Double concurrency (max 24), but monitor memory |
| HTTP 429 (Too Many Requests) | Server-limited rate | Drastically reduce concurrency (to 2–4) |
| Timeouts with large files | Network overloaded | Reduce concurrency, possibly process only a single page instead of recursively |
| ZIP creation freezes | Insufficient memory | Reduce concurrency, exclude PDF/media files (manually edit) |

### Tips for Special Scenarios

**Internationalized Pages (Multilingual)**
- Often treated as separate URLs (e.g., `/en/`, `/de/`)
- Combine with `--recursive` + `--depth=2`
- Concurrency: 8–12, DWT: 3000ms

**Pages with API Keys / Auth Tokens**

- Token may expire during long DWT waits
- Do *not* increase DWT above 5000ms

- Keep Concurrency moderate (8–10)

**Pages with WebSockets / Real-time Features**

- WebSocket connections are *not* retained in offline copies

- DWT should only wait for HTTP-based assets (3000–4000ms)

- Note: Download.js does not automatically support WebSockets

