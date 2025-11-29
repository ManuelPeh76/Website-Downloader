# Website Downloader

## Projektübersicht
**Website Downloader** ist eine Electron-basierte Desktop-Anwendung, die ganze Websites (einschließlich dynamischer Inhalte) zur Offline-Nutzung herunterlädt. Sie kombiniert Puppeteer zum Rendern und Crawlen mit Node.js-Backend-Verarbeitung und einer Electron-GUI.

### Tech Stack
- **Frontend**: Electron (HTML/CSS/JS in `src/gui.html` + `src/renderer.js`)
- **Backend**: Node.js (`src/download.js`)
- **Wichtige Abhängigkeiten**: Puppeteer (Rendern), JSZip (Archivierung), ntsuspend (Prozessverwaltung)
- **Build-Tools**: electron-packager, electron-installer-windows

---

## Architektur & Datenfluss

### Drei-Prozess-Architektur

```
┌─ Electron-Hauptprozess (src/main.js)
│   ├─ Erstellt BrowserWindow mit contextIsolation=true
│   ├─ Verwaltet IPC-Kanäle (start-download, select-folder, abort, pause, resume)
│   └─ Startet Kind-Node-Prozess für große Downloads
│
├─ Electron-Renderer-Prozess (src/renderer.js)
│   ├─ GUI-Eingabeverarbeitung, Verlauf, Design, Fenster
│   ├─ Echtzeit-Fortschrittsanzeige
│   └─ Sendet Download-Konfiguration → Main via IPC
│
└─ Node.js-Kind-Prozess (src/download.js)
    ├─ Startet Puppeteer-Browser
    ├─ Crawlt & lädt Ressourcen gleichzeitig herunter
    ├─ Emittiert Fortschritt über stdout (an Renderer gepiped)
    └─ Verwaltet ZIP-Export & Sitemap-Generierung
```

### Kritische IPC-Brücken (preload.js)
- **Renderer → Main**: `startDownload()`, `selectFolder()`, `abortDownload()`, `pauseDownload()`, `resumeDownload()`, `saveProgress()`
- **Main → Renderer**: `onLog()`-Listener für stdout-Streaming
- **Sicherheitsmodell**: `contextIsolation=true`, `nodeIntegration=false` — preload.js für alle Node-API-Zugriffe verwenden

---

## Download-Fluss & Konfiguration

### Einstiegspunkt: renderer.js → download.js
1. Benutzer füllt Formular in GUI aus → `startDownload()` wird mit Config-Objekt aufgerufen
2. Hauptprozess startet `node src/download.js <url> [options]`
3. Optionen werden als CLI-Flags übergeben (z.B. `--folder=`, `--depth=`, `--recursive`, `--zip`, `--debug`)
4. download.js streamt Fortschrittszeilen zu stdout → gepipet zu Renderer's `onLog()`-Listener

### Wichtige Parallelisierungs- & Ressourcenmuster
- **Parallelisierungskontrolle**: Nutzt `pLimit(CONCURRENCY)` — begrenzt parallele Downloads (Standard 8, konfigurierbar 1-32)
- **Ressourcentabelle**: Speichert `resourceMap<url → localPath>` — dedupliziert Anfragen
- **Visited Set**: Verfolgt gecrawlte HTML-Seiten (`visited<url>`) — verhindert unendliche Rekursion
- **Ordnerbenennung**: Erstellt automatisch Unterverzeichnis benannt nach Hostname: `output_folder/example.com/`

### Behandlung dynamischer Inhalte
- **Puppeteer-Ansatz**: Rendert Seiten über Headless-Browser, nicht HTML-Parsing
- **DYNAMIC_WAIT_TIME (dwt)**: Nach Seitenladevorgang wartet N ms auf XHR/fetch-geladene Assets (Standard 3000ms, benutzerkonfigurierbar)
- **Asset-Erkennung**: Extrahiert aus:
  - HTML `<img>`, `<script>`, `<link>`, `<source>`, `<iframe>` Tags
  - CSS `url()` und `@import` Deklarationen
  - Manifest.json (Web-App-Manifeste, Icons, Splash Screens)
  - Meta-Tags (OpenGraph, Twitter Cards)
  - `srcset`, `poster` Attribute

### Rekursives Crawling
- Wenn `--recursive`-Flag gesetzt: extrahiert Links von jeder heruntergeladenen Seite bis zu `--depth` (Standard Infinity)
- **Tiefensuche (DFS)**-Ansatz: verarbeitet Warteschlange Seite für Seite

---

## Dateistruktur & Verantwortlichkeiten

| Datei | Zweck |
|------|---------|
| `src/main.js` | Electron-App-Lebenszyklus, Fenstereinrichtung, IPC-Handler, Kind-Prozess-Start |
| `src/renderer.js` | GUI-Interaktion, Formularstatus, History/Modal-Klassen, Fortschrittsanzeige, API-Aufrufe zum Main |
| `src/download.js` | Kern-Download-Logik: Puppeteer-Browser-Kontrolle, Ressourcen-Abruf, URL-Umschreiben, Export (ZIP/Sitemap) |
| `src/preload.js` | Sicherheitsbrücke: exponiert IPC-Methoden zu Renderer via `window.api` |
| `src/gui.html` | UI-Markup, Formulareinträge, Fortschrittsanzeige, Debug-Modus |
| `src/history.js` | `History`-Klasse: verwaltet Eingabeverlauf mit Pfeiltaste-Navigation + localStorage-Persistenz |
| `src/modal.js` | `Modal`-Klasse: Fensterverwaltung (minimieren/maximieren/wiederherstellen/Modal schließen) |
| `src/style.css` | CSS + Design-Variablen für Dark/Light-Modus |

---

## Entwicklungs-Workflows

### App ausführen
```bash
npm start          # Starte Electron-App (Production)
npm run dev        # Starte mit Auto-Reload (electronmon)
npm run build      # Paketiere als Windows .exe (electron-packager)
npm run setup      # Erstelle Windows-Installer (electron-installer-windows)
```

### Wichtige Debug-Ansätze
1. **Debug-Modus**: Drücke `Ctrl+Shift+D` in der GUI, um Debug-Checkbox zu aktivieren → öffnet Modal mit detaillierten Logs
2. **stdout-Streaming**: Alle download.js-Logs emittieren zu process.stdout → gepipet via IPC zu Renderer

### Test-/Entwicklungsmuster
- **Renderer.js**: Hat Fallback `window.api` Mock für Browser-Tests (siehe Zeilen ~28-45) — ermöglicht GUI-Tests ohne Electron
- **Prozess-Argumente**: download.js parst CLI-Flags — kann standalone getestet werden via `node src/download.js <url> [flags]`

---

## Projektspezifische Muster & Konventionen

### 1. **IPC-Befehlsstruktur**
Argumente in einzelnem Config-Objekt gebündelt (nicht mehrere Parameter):
```javascript
// src/renderer.js sendet das:
window.api.startDownload({ url, zip, clean, depth, recursive, folder, concurrency, dwt, useIndex, log, sitemap, debug })

// src/main.js entpackt und konvertiert zu CLI-Flags für Kind-Prozess
```

### 2. **Output-Verzeichnis-Logik**
- Wenn Benutzer `--folder=/home/downloads` angibt, wird finaler Pfad zu `/home/downloads/example.com/`
- Hostname wird automatisch angefügt: `new URL(TARGET_URL).hostname`
- Pfade intern zu POSIX-Format normalisiert: `.replace(/\\/g, '/').replace(/\/+$/, '')`

### 3. **Verlauf & Eingabestatus**
- `History`-Klasse (src/history.js): hüllt DOM-Input-Elemente ein
- Persistiert zu `localStorage` pro Input-ID
- Pfeiltaste Oben/Unten navigiert, Delete entfernt Einträge
- Verwendet für URL + Zielordner-Felder

### 4. **Logging-Architektur**
- **Fortschritts-Logs**: Von download.js während Ausführung gestreamt
- **Optionales Error-Log**: Wenn `--log` Flag, Fehler gespeichert zu `errors.txt` im Output-Ordner
- **Sitemap-Export**: Wenn `--sitemap` Flag, generiert `sitemap.json` mit allen heruntergeladenen Ressourcen

### 5. **Prozess-Lebenszyklus**
- Main startet Kind-Prozess, erfasst stdout/stderr
- Renderer lauscht auf `ipcMain.send('log', data)` zur Echtzeit-Anzeige
- Download.js kann stdin-Befehle für pause/resume/abort empfangen (siehe stdin-Handler in download.js)

---

## Wichtige Implementierungshinweise

### Asset-Umschreiben
Beim Herunterladen von Ressourcen schreibt download.js URLs in HTML/CSS um:
- `href="/styles/main.css"` → `href="styles/main.css"` (relative Pfade)
- Externe URLs → zugeordnet zu lokalen Pfaden in `resourceMap` gespeichert
- Index.html Spezialbehandlung: wenn `--use-index`, URLs ohne Erweiterung werden zu `index.html` für Offline-Kompatibilität

### Parallele Download-Limits
- Standard-Parallelisierung: 8 parallele Downloads
- Konfigurierbar via `--concurrency=N` (beeinträchtigt Puppeteer-Ressourcen-Abruf + Asset-Downloads)
- Nutze `pLimit` aus p-limit-Bibliothek für Warteschlangen-Verwaltung

### Manifest.json & Web-Apps
- Wenn Ziel-URL eine PWA ist, extrahiert download.js `manifest.json`
- Verarbeitet Icons, Splash Screens, Start-URLs aus Manifest
- Ermöglicht Offline-PWA-Funktionalität

### Fehlerbehandlung
- Fehlgeschlagene Downloads protokolliert zu `logs` Array
- HTTP-Status-Codes zugeordnet zu Namen (500+-Fehler prominent im Debug-Modus gekennzeichnet)
- Fehlerhafte URLs zu `failed` Set hinzugefügt, um Wiederholung zu vermeiden

---

## Häufige Aufgaben für KI-Agenten

### Hinzufügen einer neuen Download-Option
1. Füge Checkbox/Input zu `src/gui.html` hinzu
2. Füge State-Variable + Preferences-Standard in `src/renderer.js` hinzu
3. Füge CLI-Flag-Parsing in `src/download.js` hinzu (Args-Array-Handling)
4. Gebe Flag an Kind-Prozess via `args.push()` in `src/main.js` weiter
5. Implementiere Logik in download.js-Funktion, die das Flag nutzt

### Debug von Download-Problemen
1. Aktiviere `--debug` Flag in GUI um detaillierte Logs zu sehen
2. Überprüfe `logs` Array in download.js auf erfasste Fehler
3. Verifiziere, dass `resourceMap` erwartete URL-Zuordnungen enthält
4. Nutze Debug-Modal (Ctrl+Shift+D), um Live-Prozessstatus zu inspizieren

### Ändern der Asset-Erkennung
- Bearbeite Asset-Extraktions-Logik in `src/download.js` (suche nach `extractResourcesFromHTML`, `extractFromCSS`)
- Teste mit Seiten, die spezifische Asset-Typen nutzen (iframes, srcset, etc.)
- Verifiziere, dass umgeschriebene URLs in Offline-Kopie noch funktionieren

---

## Build & Distribution

- **Windows EXE**: `npm run build` erstellt ausführbare Datei in `dist/website-downloader-win32-x64/`
- **Installer**: `npm run setup` wickelt EXE mit Windows-Installer ein (installiert zu `C:\Users\<user>\AppData\Local\website_downloader`)
- **Einstiegspunkt**: `package.json` main ist `src/main.js`

---

## Wichtige Abhängigkeiten & Warum

| Abhängigkeit | Zweck |
|------------|---------|
| `puppeteer` | Headless-Browser-Rendering für JS-lastige Sites, XHR/fetch-Abfangung |
| `jszip` | ZIP-Archiv-Erstellung für Offline-Export |
| `electron` | Desktop-App-Framework (UI + Cross-Platform-Verpackung) |
| `ntsuspend` | Windows-Prozess-Suspend/Resume (für Pause/Resume-Feature) |
| `electron-packager` | Erstellt eigenständige Windows-ausführbare Datei |
| `electron-installer-windows` | Erstellt Windows-Installer mit NSIS |

---

## Performance-Tuning: Concurrency & Dynamische Wartezeit (dwt)

### Verständnis der Parameter

**Concurrency (`--concurrency=N`)**
- Steuert die **maximale Anzahl paralleler Ressourcen-Downloads** gleichzeitig
- Beeinflusst auch Puppeteers interne Ressourcen-Requests (Bilder, Skripte, etc.)
- Höhere Werte = schneller, aber höherer Speicherverbrauch und Netzwerkbelastung
- Niedrigere Werte = langsamer, aber stabiler auf schwachen Systemen

**Dynamische Wartezeit (dwt - `--dyn_wait_time=N` in ms)**
- Zeit, die der Browser **nach dem Laden der Seite wartet**, bevor der nächste Download startet
- Gibt JavaScript-Code Zeit, zusätzliche Ressourcen über XHR/Fetch nachzuladen
- Wichtig für Single-Page-Applications (SPAs) und lazy-loading Techniken
- Zu kurz = Ressourcen werden übersehen; zu lang = unnötige Verzögerung

### Empfohlene Konfigurationen nach Seitentyp

#### 1. **Statische Websites** (HTML/CSS/JS fest kodiert)
```
Concurrency: 16–24
DWT: 1000ms (minimal, da keine dynamischen Inhalte erwartet)
Begründung: Geringe JS-Verarbeitung → aggressivere Parallelisierung ist sicher
```

#### 2. **Klassische Server-seitig gerenderter Seiten** (PHP, Django, Rails)
```
Concurrency: 12–16
DWT: 2000–3000ms (Standard)
Begründung: Wenig dynamischer Content, aber gelegentliche AJAX-Nachrichten
```

#### 3. **React/Vue/Angular SPAs** (Client-seitig gerendert)
```
Concurrency: 8–12
DWT: 4000–6000ms (erhöht)
Begründung: JS-Framework lädt Initial-Bundle, zusätzliche Chunks über XHR; Browser muss Zeit zum Rendern haben
```

#### 4. **Lazy-Loading / Infinite-Scroll Seiten** (z.B. Social Media, E-Commerce)
```
Concurrency: 4–8
DWT: 5000–8000ms (hoch)
Begründung: Assets werden nach Scroll/Click geladen; braucht viel Zeit für vollständiges Laden
Hinweis: Kein rekursives Crawling empfohlen, da Inhalte potenziell unbegrenzt sind
```

#### 5. **GraphQL / API-lastigen Seiten** (z.B. moderne Web-Apps)
```
Concurrency: 6–10
DWT: 5000–7000ms
Begründung: GraphQL-Queries brauchen Zeit; viele parallele Requests können zu Rate-Limiting führen
```

#### 6. **High-Performance / CDN-optimierte Sites** (z.B. Netflix, YouTube)
```
Concurrency: 1–4 (mit Vorsicht)
DWT: 3000–5000ms
Begründung: Hohe Anforderungen an CPU/Memory; aggressives Caching kann zu Blocking führen
```

### Praktische Optimierungsstrategien

#### **Speicher optimieren**
- Wenn der Download abbricht oder "Out of Memory"-Fehler auftritt:
  - **Concurrency reduzieren** (z.B. 12 → 8 oder sogar 4)
  - **DWT erhöhen** (gibt Garbage Collection Zeit)
- Debug-Modus aktivieren (`Ctrl+Shift+D`) → beobachte Memory-Auslastung im Logger

#### **Geschwindigkeit optimieren**
- Starte mit **conservativen Werten** (Concurrency: 8, DWT: 3000)
- **Schrittweise erhöhen**: +2 bei Concurrency, -500ms bei DWT nach erfolgreicher Testlauf
- Stoppe, wenn Fehler auftauchen oder Browser-Crashes

#### **Für rekursives Crawling** (`--recursive`)
- **Concurrency niedriger** als bei Single-Page-Crawls (um 30-50% reduzieren)
- **DWT minimal erhöhen** (z.B. von 3000ms auf 4000ms), da mehrere Seiten-Übergänge stattfinden
- **Max-Depth setzen** (`--depth=3` oder `--depth=5`), um Explosion der Download-Anzahl zu vermeiden

#### **Für schwache Systeme** (< 8 GB RAM)
```
Standardempfehlung:
- Concurrency: 4–6
- DWT: 3000–4000ms
- Aktiviere Folder-Cleanup (--clean), um Speicher freizugeben
- Nutze ZIP-Export nur wenn nötig
```

### Fehlerbehebung

| Problem | Ursache | Lösung |
|---------|--------|--------|
| Browser crasht während Download | Zu hohe Concurrency oder DWT | Concurrency halbieren, DWT um 1000ms erhöhen |
| Ressourcen werden übersehen | DWT zu kurz | DWT um 2000–3000ms erhöhen, ggf. Debug-Modus prüfen |
| Extrem langsame Geschwindigkeit | Zu niedrige Concurrency | Concurrency verdoppeln (max 24), aber Memory monitoren |
| HTTP 429 (Too Many Requests) | Rate-Limiting durch Server | Concurrency drastisch reduzieren (auf 2–4) |
| Timeouts bei großen Dateien | Netzwerk ist überlastet | Concurrency reduzieren, ggf. nur einzelne Seite statt recursively |
| ZIP-Erstellung friert ein | Speicher insuffizient | Concurrency reduzieren, PDF/Media-Dateien ausschließen (manuell bearbeiten) |

### Tipps für spezielle Szenarien

**Internationalisierte Seiten (mehrsprachig)**
- Werden oft als separate URLs behandelt (z.B. `/en/`, `/de/`)
- Mit `--recursive` + `--depth=2` kombinieren
- Concurrency: 8–12, DWT: 3000ms

**Seiten mit API-Keys / Auth-Tokens**
- Token kann während langen dwt-Wartens ablaufen
- DWT *nicht* über 5000ms erhöhen
- Concurrency moderat halten (8–10)

**Seiten mit WebSockets / Real-time Features**
- WebSocket-Verbindungen werden *nicht* beibehalten in Offline-Kopie
- DWT sollte nur auf HTTP-basierte Assets warten (3000–4000ms)
- Beachte: Download.js supportet WebSockets nicht automatisch
