# <img src="src/img/electron.svg" width="50" height="50"> Website Downloader

Website Downloader is a powerful tool for downloading entire websites, including all resources, for offline use. It supports modern web technologies and has been continuously enhanced to ensure that all relevant assets for a page are stored locally.

## ⚙️ Features
- **Complete Website Download:** Loads HTML pages and all resources referenced within them (images, CSS, JS, fonts, videos, etc.).
- **Recursive Depth-First Search:** Optionally, pages can be linked to any depth and downloaded.
- **Dynamic Content:** Detects and loads content that was dynamically loaded via JavaScript.
- **Manifest.json Support:** Detects and processes web app manifest files (`manifest.json`) and loads icons, start URLs, and splash screens referenced from them.
- **Intelligent Asset Detection:** Extracts resources from HTML, CSS (`url(...)` and `@import`), meta tags (e.g., OpenGraph, Twitter), link tags (icons, Apple Touch Icons, manifest), srcset, poster, etc.
- **Index.html Support:** Optional automatic renaming of link targets without file extensions to `index.html` for better offline display.
- **Error and Progress Logging:** Progress, errors, and download lists are logged; can optionally be saved as a file.
- **ZIP Export:** Optionally, a ZIP archive of the entire site can be created upon completion.
- **Sitemap Export:** Optionally, a sitemap.json file with all downloaded pages and assets is created.
- **Folder Cleanup:** The target folder can be emptied before downloading.
- **Concurrency:** Adjustable number of parallel downloads (2–50, default: 12).
- **Adjustable wait time for dynamic content** (dwt): Time delay after HTML parsing to detect newly downloaded files.
- **History function for input fields:**
  - **What is it?** All text fields (such as "URL" and "Target Folder") remember previous entries.
  - **How ​​does it work?** You can navigate through the history using the
  `[Arrow Up]`/`[Arrow Down]` keys; `[Delete]` deletes an entry.
  - The history is saved for each field in `localStorage` and automatically restored at startup.
  - Implemented via a custom, robust `History` class in the GUI (`renderer.js`).

## <img src="src/img/install.svg" width="25" height="25" /> Installation
I assume you have node.js, npm and git already installed.
First, clone the repository (or download the ZIP file) and install the dependencies:
```cmd
git clone https://github.com/ManuelPeh76/website-downloader.git

cd website-downloader

npm install
```
Now you can run the app with `npm start`.
If you want to make changes to its code, run `npm run dev` instead. Everything will work normally, but now the tool will be reloaded every time one of its files change.

To use this tool as a real standalone app, you have to create an app package. This works for windows users only:
```cmd
npm run build
```
This creates the app in `.\dist\website-downloader-win32-x64`, containing the app as an .exe file.
Just step inside and start `website-downloader.exe`.

## 🔧 Build a Windows Installer (optional)
```cmd
npm run setup
```
Thist creates a windows installer package from the app. When you start the .exe (or .msi) file inside the `.\dist\installers` folder, please wait until the setup is finished completely (the icon in mid screen disappears), even if the app starts while the install process is still going. After installation is complete, the app will be restarted (would be unfortunally, if you'd already download anything ;) ).<br>
The app will be installed to `C:\Users\<username>\AppData\Local\website_downloader`.

## 💻 Usage

1. **Specify URL and target folder**:<br>
Specify the website address and the local target folder. These fields have a history for easy reuse.
2. **Select options**:<br>
Depth, recursive, ZIP, sitemap, logging, Index.html, clean folder, concurrency, dwt time...
3. **Start download**:<br>
One click downloads the entire page (including dynamically loaded content and all assets) to the target folder.
4. **Monitor progress and errors**:<br>
Progress is displayed and can be saved as a file.
5. **Optional ZIP/Sitemap export:**<br>
After downloading, the data can be saved as a ZIP archive and/or sitemap.

## 🚀 Enhancements since the first version
- **Manifest.json support**:<br> Automatic detection and download of all icons, start URLs, and splash screens referenced in the manifest.
- **History for input fields**:<br> Convenient, persistent history for the `URL` and `Target Folder` text fields, keyboard navigation.
- **Better asset detection**:<br> Meta tags, srcset, link tags, etc. are now fully considered.
- **Fine-grained logging options**: Progress, errors, and sitemap can be enabled/disabled.
- **Multiplatform GUI:** Electron frontend with theme switcher, tooltips, automatic settings saving function, and history.

## 🔎Technical Details
- **Node.js** Backend
- **Electron** Frontend
- Uses **Puppeteer** for true browser rendering (dynamic content is also recognized)
- **JSZip** for ZIP export

## 🗺️ Notes
- Some very specific dynamic content (e.g., after clicks, mouseovers) may not be automatically recognized.
- For very large pages, a high `concurrency` value and sufficient memory are recommended.

## <img src="src/img/license.svg" width="25" height="25" /> MIT License
© 2025 Manuel Pelzer

---
**Quellcode & weitere Infos:**
[GitHub: ManuelPeh76/Website-Downloader](https://github.com/ManuelPeh76/Website-Downloader)
