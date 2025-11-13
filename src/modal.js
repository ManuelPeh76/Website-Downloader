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

function saveAttributes(modal) {
    modal.temp = {
        status: modal.modal.dataset.status,
        left: modal.modal.style.left,
        top: modal.modal.style.top,
        width: modal.modal.style.width,
        height: modal.modal.style.height,
        transition: modal.modal.style.transition
    };
}

function loadAttributes(modal) {
    modal.modal.style.left = modal.temp.left;
    modal.modal.style.top = modal.temp.top;
    modal.modal.style.width = modal.temp.width;
    modal.modal.style.height = modal.temp.height;
    modal.modal.style.opacity = 1;
}

function minimize(e) {
    if (e.modal.dataset.status === "normal") {
        saveAttributes(e);
        e.modal.style.transition = "all 0.4s ease";
        e.modal.style.left = "30%";
        e.modal.style.top = "calc(100vh - 30px)";
        e.modal.style.width = "225px";
        e.modal.style.opacity = 0.5;
        e.modal.dataset.status = "minimized";
        e.minimizer.innerHTML = icons.restore;
        e.minimizer.title = title.restore;
    } else {
        loadAttributes(e);
        e.minimizer.innerHTML = icons.minimize;
        e.minimizer.title = title.minimize;
        setTimeout(() => {
            e.modal.style.transition = e.temp.transition;
            if (e.modal.dataset.status === "maximized") {
                e.maximizer.innerHTML = icons.maximize;
                e.maximizer.title = title.maximize;
                setTimeout(() => e.minimizer.click(), 10);
            }
            e.modal.dataset.status = "normal";
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
function maximize(e) {
    e.modal.style.opacity = 1;
    if (e.modal.dataset.status === "normal") {
        saveAttributes(e);
        e.modal.style.transition = "all 0.4s ease";
        e.modal.style.width = "100vw";
        e.modal.style.height = "calc(100% - 30px)";
        e.modal.style.left = "0";
        e.modal.style.top = "36px";
        e.modal.dataset.status = "maximized";
        e.maximizer.innerHTML = icons.restore;
        e.maximizer.title = title.restore;
    } else {
        loadAttributes(e);
        e.maximizer.innerHTML = icons.maximize;
        e.maximizer.title = title.maximize;
        setTimeout(() => {
            e.modal.style.transition = e.temp.transition;
            if (e.modal.dataset.status === "minimized") {
                e.minimizer.innerHTML = icons.minimize;
                e.minimizer.title = title.minimize;
                setTimeout(() => e.maximizer.click(), 10);
            }
            e.modal.dataset.status = "normal";
        }, 400);
    }
}

function close(modal) {
    if (!modal.isClosable()) return;
    modal.hide();
}

function modalMouseDown(modal) {
    if (modal.modal.style.zIndex && modal.modal.style.zIndex < globalZIndex) modal.modal.style.zIndex = ++globalZIndex;
}

function titlebarMouseDown(modal, e) {
    if (e.button !== 0 ||
        [modal.minimizer, modal.maximizer, modal.closer].includes(e.target) ||
        modal.modal.dataset.status !== "normal"
    ) return;
    if (modal.modal.style.zIndex && modal.modal.style.zIndex < globalZIndex) modal.modal.style.zIndex = ++globalZIndex;
    modal.isDragging = true;
    const rect = modal.modal.getBoundingClientRect();
    [modal.offset.x, modal.offset.y] = [e.clientX - rect.left, e.clientY - rect.top];
    modal.modal.style.transition = "none";
    document.body.style.userSelect = "none"; // Prevent text selection
}

function footerMouseDown(modal, e) {
    if (e.button !== 0 || modal.modal.dataset.status !== "normal") return;
    modal.isResizing = true;
    const rect = modal.modal.getBoundingClientRect();
    modal.offset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        w: e.clientX - rect.width,
        h: e.clientY - rect.height
    }
    modal.modal.style.transition = "none";
    document.body.style.userSelect = "none"; // Prevent text selection
}

function mouseMove(modal, e) {
    if (!modal.isDragging && !modal.isResizing) return;
    if (!modal.dragTimer && !modal.modal.style.boxShadow) modal.dragTimer = setTimeout(() => modal.modal.style.boxShadow = "0 0", 200);
    // Calculate screen boundaries
    const vw = innerWidth;
    const vh = innerHeight;
    const rect = modal.modal.getBoundingClientRect();
    const margin = -10;
    if (modal.isDragging) {
        let x = e.clientX - modal.offset.x;
        let y = e.clientY - modal.offset.y;
        x = x < margin ? margin :  x + rect.width > vw - margin ? vw - rect.width - margin :  x;
        y = y < margin ? margin :  y + rect.height > vh - margin ? vh - rect.height - margin :  y;
        modal.modal.style.left = `${x}px`;
        modal.modal.style.top = `${y}px`;
    } else { // Resizing

        let x = e.clientX - modal.offset.w;
        let y = e.clientY - modal.offset.h;
        x = x < margin ? margin :  x > vw - margin ? vw - margin :  x;
        y = y < margin ? margin :  y > vh - margin ? vh - margin :  y;
        modal.modal.style.width = modal.temp.width = `${x}px`;
        modal.modal.style.height = modal.temp.height = `${y}px`;
    }
}

function mouseUp(modal) {
    if (!modal.isDragging && !modal.isResizing) return;
    clearTimeout(modal.dragTimer);
    modal.dragTimer = null;
    modal.isDragging = false;
    modal.isResizing = false;
    modal.modal.style.transition = "all 0.4s ease";
    modal.modal.style.boxShadow = "";
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
 * const modal = new Modal({ isClosable:  () => !isActive, title:  "Title Text", footer:  "Footer Text" });
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
        this.temp = this.getStyle();
        const rect = this.modal.getBoundingClientRect();
        this.modal.style.left = `${rect.left}px`;
        this.modal.style.top = `${rect.top}px`;
        this.modal.style.transform = "none";
        this.modal.style.zIndex = ++globalZIndex;
        this.modal.style.display = "flex";
        setTimeout(() => this.modal.style.opacity = 1, 0);
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
        this.log[this.logType === "div" ? "innerHTML" : "value"] = "";
        return this;
    }

    close() {
        return this.modal.remove();
    }

    open() {
        if (!document.body.contains(this.modal)) document.body.appendChild(this.modal);
        this.show();
        return this;
    }

    isOpen() {
        return this.modal.style.display === "flex";
    }

    add(msg) {
        let ok = 0;
        if (Math.abs(this.log.scrollHeight - this.log.clientHeight - this.log.scrollTop) < 50) ok = 1;
        const log = this.logType === "div" ? "innerHTML" : "value";
        log === "innerHTML" && (msg += "<br>");
        this.log[log] += msg;
        if (ok) this.log.scrollTop = this.log.scrollHeight;
        return this;
    }

    /**
     * Initializes drag, minimize, maximize, and close event listeners for the modal.
     * Changes 'Minimize' or 'Maximize' icon to 'Restore' depending on current state.
     *
     * - **Dragging: ** Allows repositioning the modal within viewport boundaries.
     * - **Resizing: ** Allows resizing the modal
     * - **Minimize: ** Slides modal to bottom and lowers opacity.
     * - **Maximize: ** Expands modal to max size and toggles back.
     * - **Close: ** Hides modal with fade-out if no download is active.
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
          width:  style.width,
          height:  style.height,
          top:  style.top,
          left:  style.left,
          transition:  style.transition
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
            -webkit-app-region: drag;
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
            background: linear-gradient(to top, var(--dev-accent), var(--dev-bg));
            padding: 6px 10px;
            color: var(--dev-fg);
            font-size: 12px;
            bottom: 0;
            text-align: right;
            height: 30px;
        }`
    };
}
