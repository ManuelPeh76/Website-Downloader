/**
 * @name Website Downloader
 *
 * @author Manuel Pelzer
 * @file modal.js
 * @copyright © 2025 By Manuel Pelzer
 * @license MIT
 */

"use strict";

let globalZIndex = 10;

function saveAttributes(m) {
    m.temp.style = {
        status: m.modal.dataset.status,
        left: m.modal.style.left,
        top: m.modal.style.top,
        width: m.modal.style.width,
        height: m.modal.style.height,
        transition: m.modal.style.transition
    };
}

function loadAttributes(m) {
    m.modal.style.left = m.temp.style.left;
    m.modal.style.top = m.temp.style.top;
    m.modal.style.width = m.temp.style.width;
    m.modal.style.height = m.temp.style.height;
    m.modal.style.opacity = 1;
}

function minimize(m) {
    if (m.modal.dataset.status === "normal") {
        saveAttributes(m);
        m.modal.style.transition = "all 0.4s ease";
        m.modal.style.left = "30%";
        m.modal.style.top = "calc(100vh - 30px)";
        m.modal.style.width = "225px";
        m.modal.style.opacity = 0.5;
        m.modal.dataset.status = "minimized";
        m.minimizer.innerHTML = icons.restore;
        m.minimizer.title = title.restore;
    } else {
        loadAttributes(m);
        m.minimizer.innerHTML = icons.minimize;
        m.minimizer.title = title.minimize;
        setTimeout(() => {
            m.modal.style.transition = m.temp.style.transition;
            if (m.modal.dataset.status === "maximized") {
                m.maximizer.innerHTML = icons.maximize;
                m.maximizer.title = title.maximize;
                setTimeout(() => m.minimizer.click(), 10);
            }
            m.modal.dataset.status = "normal";
          }, 400);
    }
}
/**
 * Toggle the "maximized" state of a modal element.
 *
 * @function maximize
 * @this {Object}
 * @returns {void}
 * @example
 * // Invoke on an object that provides the required properties and helper functions:
 * // maximize.call(myModalController);
 */
function maximize(m) {
    m.modal.style.opacity = 1;
    if (m.modal.dataset.status === "normal") {
        saveAttributes(m);
        m.modal.style.transition = "all 0.4s ease";
        m.modal.style.width = "100vw";
        m.modal.style.height = "calc(100% - 30px)";
        m.modal.style.left = "0";
        m.modal.style.top = "36px";
        m.modal.dataset.status = "maximized";
        m.maximizer.innerHTML = icons.restore;
        m.maximizer.title = title.restore;
    } else {
        loadAttributes(m);
        m.maximizer.innerHTML = icons.maximize;
        m.maximizer.title = title.maximize;
        setTimeout(() => {
            m.modal.style.transition = m.temp.style.transition;
            if (m.modal.dataset.status === "minimized") {
                m.minimizer.innerHTML = icons.minimize;
                m.minimizer.title = title.minimize;
                setTimeout(() => m.maximizer.click(), 10);
            }
            m.modal.dataset.status = "normal";
        }, 400);
    }
}

function close(m) {
    if (!m.isClosable()) return;
    m.hide();
}

function modalMouseDown(m) {
    if (m.modal.style.zIndex && m.modal.style.zIndex < globalZIndex) m.modal.style.zIndex = ++globalZIndex;
}

function titlebarMouseDown(m, e) {
    if (e.button !== 0 ||
        [m.minimizer, m.maximizer, m.closer].includes(e.target) ||
        m.modal.dataset.status !== "normal"
    ) return;
    if (m.modal.style.zIndex && m.modal.style.zIndex < globalZIndex) m.modal.style.zIndex = ++globalZIndex;
    m.isDragging = true;
    const rect = m.modal.getBoundingClientRect();
    [m.offset.x, m.offset.y] = [e.clientX - rect.left, e.clientY - rect.top];
    m.modal.style.transition = "none";
    document.body.style.userSelect = "none"; // Prevent text selection
}

function footerMouseDown(m, e) {
    if (e.button !== 0 || m.modal.dataset.status !== "normal") return;
    m.isResizing = true;
    const rect = m.modal.getBoundingClientRect();
    m.offset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        w: e.clientX - rect.width,
        h: e.clientY - rect.height
    }
    m.modal.style.transition = "none";
    document.body.style.userSelect = "none"; // Prevent text selection
}

function mouseMove(m, e) {
    if (!m.isDragging && !m.isResizing) return;
    if (!m.dragTimer && !m.modal.style.boxShadow) m.dragTimer = setTimeout(() => m.modal.style.boxShadow = "0 0", 200);
    // Calculate screen boundaries
    const vw = innerWidth;
    const vh = innerHeight;
    const rect = m.modal.getBoundingClientRect();
    const margin = -10;
    if (m.isDragging) {
        let x = e.clientX - m.offset.x;
        let y = e.clientY - m.offset.y;
        x = x < margin ? margin :  x + rect.width > vw - margin ? vw - rect.width - margin :  x;
        y = y < margin ? margin :  y + rect.height > vh - margin ? vh - rect.height - margin :  y;
        m.modal.style.left = `${x}px`;
        m.modal.style.top = `${y}px`;
    } else { // Resizing

        let x = e.clientX - m.offset.w;
        let y = e.clientY - m.offset.h;
        x = x < margin ? margin :  x > vw - margin ? vw - margin :  x;
        y = y < margin ? margin :  y > vh - margin ? vh - margin :  y;
        m.modal.style.width = m.temp.style.width = `${x}px`;
        m.modal.style.height = m.temp.style.height = `${y}px`;
    }
}

function mouseUp(m) {
    if (!m.isDragging && !m.isResizing) return;
    clearTimeout(m.dragTimer);
    m.dragTimer = null;
    m.isDragging = false;
    m.isResizing = false;
    m.modal.style.transition = "all 0.4s ease";
    m.modal.style.boxShadow = "";
    document.body.style.userSelect = "";
}

const title = {
    minimize:  "Minimize",
    maximize:  "Maximize",
    restore:  "Restore",
    close:  "Close"
};

const icons = {
  minimize:  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><line x1="5" y1="24" x2="44" y2="24" stroke-width="5" /></svg>`,
  restore:   `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect x="5" y="14" width="28" height="28" fill="none" stroke-width="5" /><g stroke-width="4"><line x1="14" y1="14" x2="14" y2="5" /><line x1="14" y1="5" x2="42" y2="5" /><line x1="42" y1="5" x2="42" y2="34" /><line x1="42" y1="34" x2="32" y2="34" /></g></svg>`,
  maximize:  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect x="5" y="5" width="38" height="38" fill="none" stroke-width="5"/></svg>`
};

/**
 * Class representing a draggable, minimizable, maximizable, and closable modal window.
 *
 * @class
 * @example
 * const modal = new Modal({ isClosable: () => !isActive, title: "Title Text", footerText: "Footer Text" });
 * modal.add("<b>This bold text is added to the modals body.</b>");
 * modal.show();
 */
export class Modal {
    constructor({
        isClosable = ()=>{},
        title = "Modal Window",
        footerText = `Modal Window &copy;${new Date().getFullYear()}`,
        logType = "div", css = null, html = null
    }) {
        if (css === null) css = this.templates.css;
        if (html === null) html = this.templates.html;
        if (!["div", "textarea"].includes(logType)) logType = "textarea";

        const modals = document.querySelectorAll(".modal");
        this.id = "modal_" + modals.length;

        (this.style = document.getElementById("modal-style")) || (
            this.style = document.createElement("style"),
            this.style.id = "modal-style",
            this.style.textContent = css,
            document.head.appendChild(this.style)
        );

        document.body.insertAdjacentHTML("beforeend", html.replace(/%id%/, this.id).replace(/%log%/, this.templates[logType]));

        this.offset = { x: 0, y: 0, h: 0, w: 0 };
        this.dragTimer = 0;
        this.isDragging = false;
        this.isResizing = false;
        this.logType = logType;
        this.temp = {};

        this.modal = document.getElementById(this.id);
        this.modal.querySelector(".dev-title").innerHTML = title;
        this.modal.dataset.status = "normal";

        this.titlebar = this.modal.querySelector(".dev-head");
        this.body = this.modal.querySelector(".dev-body");
        this.footer = this.modal.querySelector(".dev-footer");
        this.minimizer = this.modal.querySelector(".dev-minimizer");
        this.maximizer = this.modal.querySelector(".dev-maximizer");
        this.closer = this.modal.querySelector(".dev-closer");
        this.log = this.modal.querySelector(".dev-content");

        this.footer.innerHTML = footerText;
        this.minimizer.title = title.minimize;
        this.maximizer.title = title.maximize;
        this.closer.title = title.close;
        this.isClosable = isClosable;

        this.initEvents();

        return this;
    }

    show() {
        this.temp.style = this.getStyle();
        const rect = this.modal.getBoundingClientRect();
        this.modal.style.left = `${rect.left}px`;
        this.modal.style.top = `${rect.top}px`;
        this.modal.style.transform = "none";
        this.modal.style.zIndex = ++globalZIndex;
        this.modal.style.display = "flex";
        this.modal.style.opacity = 1;
        return this;
    }

    hide() {
      /**
       * Hide the modal and reset its style completely, so it is in
       * the right shape, if opened again.
       */
        if (!this.isClosable()) return;
        this.modal.style.transition = "opacity 0.4s ease";
        this.modal.style.opacity = 0;
        setTimeout(() => {
            this.modal.style.display = "none";
            this.modal.dataset.status = "normal";
            this.minimizer.title = title.minimize;
            this.maximizer.title = title.maximize;
            this.minimizer.innerHTML = icons.minimize;
            this.maximizer.innerHTML = icons.maximize;
            this.modal.style.left = "";
            this.modal.style.top = "";
            this.modal.style.width = "";
            this.modal.style.height = "";
            this.modal.style.transition = "";
        }, 400);
        return this;
    }

    clear() {
        this.log/*[this*/./*logType === "div" ? "*/innerHTML/*" : "value"]*/ = "";
        return this;
    }

    close() {
        this.modal.remove();
        return this;
    }

    open() {
        if (!document.body.contains(this.modal)) document.body.appendChild(this.modal);
        this.show();
        return this;
    }

    isOpen() {
        return this.modal.style.display === "flex";
    }

    /**
     * Create, configure and append an input[type="button"] element according to the provided options.
     *
     * @param {Object} options - Configuration for the button.
     * @param {string} [options.label] - Text label for the button. Default: "Button".
     * @param {string} [options.title] - Tooltip/title attribute for the button.
     * @param {((MouseEvent) => void)|null} [options.onClick] - Click handler to assign to element.onclick (may be null).
     * @param {string} [options.style] - Inline CSS text to apply to the element.
     * @param {'body'|'footer'} [options.parent] - "body" or "footer": Container name to append the button to. Defaults to "footer".
     * @param {function(): boolean} [options.showOn] - Optional function that returns a boolean indicating whether the button should be shown.
     *
     * @returns {HTMLInputElement} The created input button element (already appended to the selected parent).
     */
    button(options) {
        const btn = document.createElement("input");
        btn.type = "button";
        btn.className = "dev-btn";
        btn.value = options.label || "Button";
        btn.title = options.title || "";
        btn.onclick = options.onClick || null;
        btn.style = options.style || "";
        btn.style.transition = "all 0.4s ease";
        const parent = options.parent && ["body", "footer"].includes(options.parent) ? options.parent : "footer";
        this[parent].appendChild(btn);
        if (options.showOn && typeof options.showOn === "function") {
            const observer = new MutationObserver(() => {
                const show = options.showOn();
                btn.style.opacity = show ? "1" : "0";
                btn.style.pointerEvents = show ? "auto" : "none";
            });
            observer.observe(this.log, { childList: true, subtree: true, characterData: true });
            // Initial state
            const show = options.showOn();
            btn.style.opacity = show ? "1" : "0";
            btn.style.pointerEvents = show ? "auto" : "none";
        }
        return btn;
    }

    add(msg) {
        let ok = 0;
        if (Math.abs(this.log.scrollHeight - this.log.clientHeight - this.log.scrollTop) < 50) ok = 1;
        if (this.logType === "div") msg += "<br>";
        else msg = msg.replace(/(<style.*?\/style>)|(<.*?>)/g, "");
        this.log.innerHTML += msg;
        if (ok) this.log.scrollTop = this.log.scrollHeight;
        return this;
    }

    isEmpty() {
        return (this.logType === "div" ? this.log.textContent : this.log.value).trim() === "";
    }

    text() {
        return this.logType === "div" ? this.log.innerHTML.replace(/(<style.*?\/style>)|(<.*?>)/g, "") : this.log.value;
    }

    html() {
        return this.log.innerHTML;
    }

    /**
     * Initializes drag, resize, minimize, maximize, and close event listeners for the modal.
     *
     * @returns {void}
     */
    initEvents() {
      this.minimizer.addEventListener("click", () => minimize(this));
      this.maximizer.addEventListener("click", () => maximize(this));
      this.closer.addEventListener("click", () => close(this));
      this.titlebar.addEventListener("mousedown", e => titlebarMouseDown(this, e));
      this.log.addEventListener("click", () => modalMouseDown(this));
      this.footer.addEventListener("mousedown", e => footerMouseDown(this, e));
      document.addEventListener("mousemove", e => mouseMove(this, e));
      document.addEventListener("mouseup", () => mouseUp(this));
    }

    getStyle() {
        let style = getComputedStyle(this.modal);
        return {
          width: style.width,
          height: style.height,
          top: style.top,
          left: style.left,
          transition: style.transition
        }
    }

    templates = {
        html: `<div id="%id%" class="modal draggable">
        <div class="dev-head">
            <div class="dev-titlebar">
                <div class="dev-title"></div>
                <div class="dev-minimizer">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><line x1="5" y1="24" x2="44" y2="24" stroke-width="5" /></svg>
                </div>
                <div class="dev-maximizer">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect x="5" y="5" width="38" height="38" fill="none" stroke-width="5"/></svg>
                </div>
                <div class="dev-closer">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><line x1="5" y1="5" x2="38" y2="38" stroke-width="5" /><line x1="5" y1="38" x2="38" y2="5" stroke-width="5" /></svg>
                </div>
            </div>
        </div>
        <div class="dev-body">
            %log% <!-- <textarea class="dev-content" readonly onfocus="this.blur()"></textarea> -->
        </div>
        <div class="dev-footer"></div>
    </div>`,
        div: `<div class="dev-content"></div>`,
        textarea: `<textarea class="dev-content" readonly onfocus="this.blur()"></textarea>`,
        css: `@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@300..700&display=swap');
        :root {
            color-scheme: light dark;
        }
        @media(prefers-color-scheme: dark) {
            : root: not([data-theme]){
                --dev-bg:  #1f2937;
                --dev-fg: #f9fafb;
                --dev-accent: #355599;
                --dev-log-bg: #32364b;
                --dev-border: #4b5563;
                --dev-shadow: rgba(200, 200, 200, 0.3);
            }
        }
        :root[data-theme=light] {
            --dev-bg: #f9fafb;
            --dev-fg: #111;
            --dev-accent: #92cdff;
            --dev-log-bg: #bdd1ff;
            --dev-border: #d1d5db;
            --dev-shadow: rgba(32, 32, 32, 0.3)
        }
        :root[data-theme=dark] {
            --dev-bg: #1f2937;
            --dev-fg: #ddd;
            --dev-accent: #355599;
            --dev-log-bg: #32364b;
            --dev-border: #4b5563;
            --dev-shadow: rgba(200, 200, 200, 0.3);
        }

        * {
            box-sizing: border-box;
        }

        .modal {
            position: fixed;
            top: 25vh;
            left: 5vw;
            width: 480px;
            height: 25vh;
            min-width: 225px;
            min-height: 90px;
            background: var(--dev-log-bg);
            border: 1px solid var(--dev-border);
            border-radius: 8px;
            box-shadow: 0 10px 30px var(--dev-shadow);
            overflow: hidden;
            font-family: "Fira Code", monospace;
            color: var(--dev-fg);
            opacity: 0;
            display: none;
            flex-direction: column;
            transition: all 400ms ease;
        }
        .draggable {
            -webkit-app-region: no-drag;
        }
        .dev-head {
            display: flex;
            flex-direction: column;
            background: linear-gradient(to bottom, var(--dev-accent), var(--dev-bg));
            color: var(--dev-fg);
            padding: 0;
        }
        .dev-titlebar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            height: 36px;
            padding: 0 8px;
            user-select: none;
        }
        .dev-title {
            font-size: 14px;
            font-weight: 500;
            flex: 1;
        }
        .dev-closer, .dev-maximizer, .dev-minimizer {
            width: 46px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            -webkit-app-region: no-drag;
            transition: background .2s ease;
        }
        .dev-minimizer:hover, .dev-maximizer:hover {
            background: rgba(255,255,255,.2);
        }
        .dev-closer:hover {
            background: #e81123;
        }
        .dev-closer svg, .dev-maximizer svg, .dev-minimizer svg {
            width: 14px;
            height: 14px;
            pointer-events: none;
        }

        .dev-body {
            position: relative;
            width: 100%;
            height: 100%;
        }

        .dev-content {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            font-size: 14px;
            line-height: 1.5;
            padding: 10px 15px;
            white-space: nowrap;
            overflow: auto;
            border: none;
            border-top: #fff4 1px solid;
            border-bottom: #fff4 1px solid;
            cursor: default;
        }

        .dev-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: linear-gradient(to top, var(--dev-accent), var(--dev-bg));
            padding: 6px 10px;
            color: var(--dev-fg);
            font-size: 12px;
            bottom: 0;
            text-align: right;
            height: 30px;
        }
        .dev-btn {
            font-family: inherit;
            font-variant: inherit;
            background: var(--dev-accent2);
            border: none;
            color: var(--dev-fg);
            padding: 2px 4px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: all .4s ease;
        }
        .dev-btn:hover {
            background: var(--dev-fg);
            color: var(--dev-accent);
        }`
    };
}
