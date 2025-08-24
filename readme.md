# <img src="electron.svg" width="50" height="50"> Website-Downloader
A fast and universal downloader for dynamic websites, created with Puppeteer.

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
```cmd
git clone https://github.com/ManuelPeh76/website-downloader.git
```
3. Switch into the newly created folder with `cd website-downloader`

4. Install the dependencies:
```cmd
npm install
```

## Usage
#### GUI
<img src="app.png" width="600">

  1. Start the GUI with `npm start`.
  2. Enter the URL of the website you want to download.
  3. Select the desired options.
  4. Choose the target folder, in which the website folder will be created.
  5. Start the download with the `Start` button.

#### CLI
 Start the tool from the command line with
 ```cmd
 node download <url> [options]
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
| `-u`, `--use-index` | Append '/index.html' to urls, if no file extension is found.

## Example
To download a web page with a link depth of 1, recursion and ZIP export, use the following command:
```cmd
node download https://example.com --depth=1 --recursive --zip --outdir=C:\Users\<username>\documents
```

## Some Infos about this Tool

- Files that are dynamically loaded during the website's runtime are only downloaded if the request occurs within the dynamical wait time (3000ms by default) after opening the page.
- The opened pages are scrolled down to catch file requests triggered by an onscroll event.
- All CSS files (whether linked or dynamically loaded) are searched for dynamic content (url(...)) and, if found, those files are downloaded as well.
- Only files whose storage location matches that of the website are saved.
- All links in downloaded pages are adjusted to make the pages work offline.
- When using the GUI, all settings (incl. the url) are saved via local storage. The next time you start the GUI your own settings will be restored.
- If no file extension is found in a URL, it is assumed that an index.html file is being requested and '/index.html' is appended to the URL. This behavior can be enabled or disabled in the GUI. It is disabled by default via the CLI and can be enabled with '--use-index'.
- To close the window: Right click on the electron icon => Close (working on that).
- To drag the window click and hold the left mouse button on the electron icon.
## Build an App Package
```cmd
npm run build
```
This step is required, if you want to create the windows installer (exe and msi) which is described in the next step. 
A new folder will be created containing everything that's needed to run this tool without any further dependencies (not even node.js).
When finished, you can start the Website-Downloader.exe inside of the newly created dist/Website-Downloader-win32-x64/ folder.


## Build the Windows Installer
```cmd
npm run build
npm run setup
```
Thist creates a windows installer package from the app in the folder dist/Installers/.
You can use the .exe or the .msi installer package, both do the same: Installing the Website Downloader fully automatic (in C:\Users\<username>\AppData\Local\Website_Downloader), register it and create a start menu entry.
Wait until the installation is complete, even if the tool has already started during the installation. It will restart after the installation is complete.

## License
This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).

---








