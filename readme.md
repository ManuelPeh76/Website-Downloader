---
# <img src="electron.svg" width="50" height="50" style="transform: translate(0, 10px)"> Website-Downloader
A universal downloader for dynamic websites, created with electron.

## Features

- 🚀 Dynamic Loading: Also loads assets that are loaded during page loading.
- 🔁 Recursive Download: Searches linked pages and downloads files found there.
- 📏 Limit Depth: Specifies how deep links should be traced.
- 🧹 Cleanup Mode: Empties the destination folder before saving downloads.
- 🗺️ Sitemap Export: Exports a sitemap of the downloaded website.
- 🪵 Log Export: Exports a log with any error messages.
- 📦 ZIP Export: Creates a ZIP archive containing the entire website after downloads are complete.
- 🔧 Progress Status: Displays the current status of the download process.
- 💻 GUI or CLI usage.
- 🌐 Offline support: Adapts all links inside the HTML files, so the website can be used offline.

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
1. Start the GUI with `npm start`.
2. Enter the URL of the website you want to download.
3. Select the desired options (link depth, recursive download, ZIP export, cleanup mode).
4. Choose the target folder, in which the website folder will be created.
5. Start the download with the `Start` button.

#### CLI
Start the tool from the command line with 
```
node downloader.js <url> [options]
``` 

#### Options
| Option | Description |
| --- | --- |
| `-d`, `--depth` | The depth of links to consider (default: 0[=infinity]). |
| `-r`, `--recursive` | Enables recursive downloading of linked pages (default: false). |
| `-z`, `--zip` | Creates a ZIP archive after downloads are complete (default: false). |
| `-c`, `--clean` | Empties the destination folder before saving downloads (default: false). |
| `-o`, `--outdir` | The full path to the folder the website is saved in.

## Example

To download a web page with a link depth of 1, recursion and ZIP export, use the following command:
```
node downloader.js https://example.com -d=1 -r -z -o=C:\Users\<username>\documents
```

## Build the App

You can build this tool using electron, so you can run an .exe file to start it. Type:
```
npm run build
```
A 'dist' folder will be created, containing the tool. 
Unfortunately, to make it run propperly, you have to put a copy of the download.js directly into the dist/website-downloader-win32-x64 folder (where the website-downloader.exe file is located).

## Build a Windows Installer

Simply run:
```
npm run setup
```
to create a windows installer package from the app.

---
## License
This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).

---
