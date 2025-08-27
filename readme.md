# <img src="src/img/electron.svg" width="50" height="50"> Website-Downloader
A fast and universal downloader for dynamic websites, created with electron.

## Features
- 🔎 Dynamic Loading: Catches files that are dynamically loaded (e.g. from a script).
- 🚀 Fast Loading: Up to 25 files are downloaded simultaneously.
- 🔁 Recursive Download: Searches linked pages and downloads files found there.
- 📏 Limit Depth: Specifies how deep links should be traced.
- 🧹 Cleanup Mode: Empties the destination folder before saving downloads.
- 🗺️ Sitemap Export: Exports a sitemap of the downloaded website.
- 🪵 Log Export: Exports a log with any error messages.
- 📦 ZIP Export: Creates a ZIP archive containing the entire website after downloads are complete.
- 🔧 Progress Status: Displays the current status of the download process.
- 💻 GUI or CLI usage.
- 🌐 Offline support: Adapts all links inside the HTML files, so the website can be used offline.
- 🌓 Supports Light Mode and Dark Mode

## Installation
I assume you have node.js, npm and git already installed.
1. Open a command window (`cmd` on windows machines).

2. Clone this repository:
```
git clone https://github.com/ManuelPeh76/website-downloader.git
```
3. Switch into the newly created folder with `cd website-downloader`

4. Install the dependencies:
```
npm install
```

## Usage
#### GUI
<img src="src/img/app.png" width="400">

  1. Start the GUI with `npm start`.
  2. Enter the URL of the website you want to download.
  3. Select the desired options.
  4. Choose the target folder, in which the website folder will be created.
  5. Start the download with the `Start` button.

#### CLI
 Start the tool from the command line with
 ```bash
 node downloader.js <url> [options]
 ```

#### Options
| Option | Description |
| --- | --- |
| `-d=<number>`, `--depth=<number>` | The depth of links to consider (default: infinity). |
| `-dwt=<ms>`, `--dyn_wait_time=<ms>` | The time in ms the tool waits for dynamic content to load after the page is loaded (default 3000). |
| `-r`, `--recursive` | Enables recursive downloading of linked pages (default: true). |
| `-z`, `--zip` | Creates a ZIP archive after downloads are complete (default: false). |
| `-c`, `--clean` | Empties the destination folder before saving downloads (default: false). |
| `-o=<path>`, `--outdir=<path>` | The full path to the folder the website is saved to (default: repo folder).
| `-s=<number>`, `--simultaneous=<number>` | The amount of simultaneously active downloads (default: 8).

## Example
To download a web page with a link depth of 1, recursion and ZIP export, use the following command:
```bash
node downloader.js https://example.com --depth=1 --recursive --zip --outdir=C:\Users\<username>\documents
```

## Some Infos about this Tool

- Files that are dynamically loaded during the website's runtime are only recorded if the request occurs within the dynamical wait time (3000ms by default) after opening the page. Understandably, the downloader cannot wait forever for such a request to occur, as this would block the corresponding download channel.
- CSS files (whether linked or dynamically loaded) are searched for 'url(...)' to include fonts and images that are loaded by the CSS.
- Only files whose storage location matches that of the website are saved.
- When a file has been downloaded, the tool checks, if the containing links are absolute or relative, in order to adapt them if necessary. If absolute links are found, and they point to the same origin, they are changed to relative links. Thus the functionality of that site remains intact (works offline, except for files that are loaded from other sources).
- When using the GUI, all settings you change (incl. the url) are saved via local storage. The next time you start the GUI your own settings will be restored.

## Build the App
You can build this tool using electron, so you can run an .exe file to start it:
```bash
npm run build
```
A 'dist' folder will be created, containing the tool.
Unfortunately, to make it run propperly, you have to put a copy of the download.js directly into the dist/website-downloader-win32-x64 folder (where the website-downloader.exe file is located).

## Build a Windows Installer
```bash
npm run build
npm run setup
```
Thist creates a windows installer package from the app.

## License
This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).

---

