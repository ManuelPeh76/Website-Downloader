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
let minimizedModals = 0;

function minimize() {
    if (this.modal.dataset.status !== "normal") {
        this.modal.style.left = this.temp.left;
        this.modal.style.top = this.temp.top;
        this.modal.style.width = this.temp.width;
        this.modal.style.height = this.temp.height;
        this.modal.style.opacity = 1;
        this.minimizer.innerHTML = this.icons.minimize;
        this.minimizer.title = this.title.minimize;
        minimizedModals--;
        setTimeout(() => {
            this.modal.style.transition = this.temp.transition;
            if (this.modal.dataset.status === "maximized") {
                this.maximizer.innerHTML = this.icons.maximize;
                this.maximizer.title = this.title.maximize;
                setTimeout(() => this.minimizer.click(), 10);
            }
            this.modal.dataset.status = "normal";
          }, 400);
    } else {
        this.temp.status = this.modal.dataset.status;
        this.temp.left = this.modal.style.left;
        this.temp.top = this.modal.style.top;
        this.temp.width = this.modal.style.width;
        this.modal.style.transition = "all 0.4s ease";
        this.modal.style.left = (30 + 15 * minimizedModals) + "%";
        this.modal.style.top = "calc(100vh - 30px)";
        this.modal.style.width = "225px";
        this.modal.style.opacity = 0.5;
        this.modal.dataset.status = "minimized";
        this.minimizer.innerHTML = this.icons.restore;
        this.minimizer.title = this.title.restore;
        minimizedModals++;
    }
}

function maximize() {
    this.modal.style.opacity = 1;
    if (this.modal.dataset.status !== "normal") {
        this.modal.style.width = this.temp.width;
        this.modal.style.height = this.temp.height;
        this.modal.style.left = this.temp.left;
        this.modal.style.top = this.temp.top;
        this.maximizer.innerHTML = this.icons.maximize;
        this.maximizer.title = this.title.maximize;
        setTimeout(() => {
            this.modal.style.transition = this.temp.transition;
            if (this.modal.dataset.status === "minimized") {
                this.minimizer.innerHTML = this.icons.minimize;
                this.minimizer.title = this.title.minimize;
                minimizedModals--;
                setTimeout(() => this.maximizer.click(), 10);
            }
            this.modal.dataset.status = "normal";
        }, 400);
    } else {
        this.temp.status = this.modal.dataset.status;
        this.temp.left = this.modal.style.left;
        this.temp.top = this.modal.style.top;
        this.modal.style.transition = "all 0.4s ease";
        this.modal.style.width = "100vw";
        this.modal.style.height = "100vh";
        this.modal.style.left = "0";
        this.modal.style.top = "30px";
        this.modal.dataset.status = "maximized";
        this.maximizer.innerHTML = this.icons.restore;
        this.maximizer.title = this.title.restore;
    }
}

function close() {
    if (!this.isClosable()) return;
    this.hide();
}

function modalMouseDown() {
    if (this.modal.style.zIndex && this.modal.style.zIndex < globalZIndex) this.modal.style.zIndex = ++globalZIndex;
}

function titlebarMouseDown(e) {

    if (e.button !== 0 ||
        [this.minimizer, this.maximizer, this.closer].includes(e.target) ||
        this.modal.dataset.status !== "normal"
    ) return;
    if (this.modal.style.zIndex && this.modal.style.zIndex < globalZIndex) this.modal.style.zIndex = ++globalZIndex;
    this.isDragging = true;
    const rect = this.modal.getBoundingClientRect();
    [this.offsetX, this.offsetY] = [e.clientX - rect.left, e.clientY - rect.top];
    this.modal.style.transition = "none";
    document.body.style.userSelect = "none"; // Prevent text selection
}

function footerMouseDown(e) {
    if (e.button !== 0 || this.modal.dataset.status !== "normal") return;
    this.isResizing = true;
    const rect = this.modal.getBoundingClientRect();
    [this.offsetX, this.offsetY, this.offsetW, this.offsetH] = [e.clientX - rect.left, e.clientY - rect.top, e.clientX - rect.width, e.clientY - rect.height];
    this.modal.style.transition = "none";
    document.body.style.userSelect = "none"; // Prevent text selection
}

function mouseMove(e) {
    if (!this.isDragging && !this.isResizing) return;
    if (!this.dragTimer && !this.modal.style.boxShadow) this.dragTimer = setTimeout(() => this.modal.style.boxShadow = "0 0", 200);
    // Calculate screen boundaries
    const vw = innerWidth;
    const vh = innerHeight;
    const rect = this.modal.getBoundingClientRect();
    const margin = 1;
    if (this.isDragging) {
        let newX = e.clientX - this.offsetX;
        let newY = e.clientY - this.offsetY;
        newX = newX < margin ? margin :  newX + rect.width > vw - margin ? vw - rect.width - margin :  newX;
        newY = newY < margin ? margin :  newY + rect.height > vh - margin ? vh - rect.height - margin :  newY;
        this.modal.style.left = `${newX}px`;
        this.modal.style.top = `${newY}px`;
    } else { // Resizing
        let newX = e.clientX - this.offsetW;
        let newY = e.clientY - this.offsetH;
        newX = newX < margin ? margin :  newX > vw - margin ? vw - margin :  newX;
        newY = newY < margin ? margin :  newY > vh - margin ? vh - margin :  newY;
        this.modal.style.width = this.temp.width = `${newX}px`;
        this.modal.style.height = this.temp.height = `${newY}px`;
    }
}

function mouseUp() {
    if (!this.isDragging && !this.isResizing) return;
    clearTimeout(this.dragTimer);
    this.dragTimer = 0;
    this.isDragging = false;
    this.isResizing = false;
    this.modal.style.transition = "all 0.4s ease";
    this.modal.style.boxShadow = "";
    document.body.style.userSelect = "";
}
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
    constructor(options) {
        options = options || {};
        !options.isClosable && (options.isClosable = ()=>{});
        !options.title && (options.title = "Modal Window");
        !options.footer && (options.footer = `Modal Window &copy;${new Date().getFullYear()}`);

        const { isClosable, title, footer } = options;
        const modals = document.querySelectorAll(".modal");
        this.id = "modal_" + modals.length;
        document.body.insertAdjacentHTML("beforeend", this.html().replace(/%id%/, this.id));

        this.dragTimer = 0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.offsetH = 0;
        this.offsetW = 0;
        this.isDragging = false;
        this.isResizing = false;
        this.modal = document.getElementById(this.id);
        this.modal.dataset.status = "normal";
        this.titlebar = this.modal.querySelector(".dev-head");
        this.footer = this.modal.querySelector(".dev-footer");
        this.minimizer = this.modal.querySelector(".dev-minimizer");
        this.maximizer = this.modal.querySelector(".dev-maximizer");
        this.closer = this.modal.querySelector(".dev-closer");
        this.log = this.modal.querySelector(".dev-content");
        this.isClosable = isClosable;
        this.temp = {};
        this.modal.querySelector(".dev-title").innerHTML = title;
        this.footer.innerHTML = footer;

        this.title = {
            minimize:  "Minimize",
            maximize:  "Maximize",
            restore:  "Restore",
            close:  "Close"
        };

        this.icons = {
          minimize:  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><line x1="5" y1="24" x2="44" y2="24" stroke-width="5" /></svg>`,
          restore:   `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect x="5" y="14" width="28" height="28" fill="none" stroke-width="5" /><g stroke-width="4"><line x1="14" y1="14" x2="14" y2="5" /><line x1="14" y1="5" x2="42" y2="5" /><line x1="42" y1="5" x2="42" y2="34" /><line x1="42" y1="34" x2="32" y2="34" /></g></svg>`,
          maximize:  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect x="5" y="5" width="38" height="38" fill="none" stroke-width="5"/></svg>`
        };

        if (!document.getElementById("modal-style")) {
            const style = document.createElement("style");
            style.id = "modal-style";
            style.textContent = this.css();
            document.head.appendChild(style);
        }

        this.initDragAndResize();
        return this;
    }

    show() {
        this.modal.style.display = "flex";
        setTimeout(() => this.modal.style.opacity = 1, 0);
        this.temp = this.getStyle();
        const rect = this.modal.getBoundingClientRect();
        this.modal.style.left = `${rect.left}px`;
        this.modal.style.top = `${rect.top}px`;
        this.modal.style.transform = "none";
        this.modal.style.zIndex = ++globalZIndex;
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
            this.minimizer.title = this.title.minimize;
            this.maximizer.title = this.title.maximize;
            this.minimizer.innerHTML = this.icons.minimize;
            this.maximizer.innerHTML = this.icons.maximize;
            this.modal.style.left = "";
            this.modal.style.top = "";
            this.modal.style.width = "";
            this.modal.style.height = "";
            this.modal.style.transform = "";
            this.modal.style.transition = "";
        }, 400);
        return this;
    }

    clear() {
        this.log.value = "";
        return this;
    }

    isOpen() {
        return this.modal.style.display === "flex";
    }

    add(msg) {
        let ok = 0;
        if (Math.abs(this.log.scrollHeight - this.log.clientHeight - this.log.scrollTop) < 50) ok = 1;
        this.log.value += msg;
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
    initDragAndResize() {
      this.minimizer.title = this.title.minimize;
      this.maximizer.title = this.title.maximize;
      this.closer.title = this.title.close;

      this.minimizer.addEventListener("click", () => minimize.call(this));
      this.maximizer.addEventListener("click", () => maximize.call(this));
      this.closer.addEventListener("click", () => close.call(this));
      this.titlebar.addEventListener("mousedown", e => titlebarMouseDown.call(this, e));
      this.modal.addEventListener("click", () => modalMouseDown.call(this));
      this.footer.addEventListener("mousedown", e => footerMouseDown.call(this, e));
      document.addEventListener("mousemove", e => mouseMove.call(this, e));
      document.addEventListener("mouseup", () => mouseUp.call(this));
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

    html() {
      return `<div id="%id%" class="modal draggable">
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
        <textarea class="dev-content" readonly onfocus="this.blur()"></textarea>
    </div>
    <div class="dev-footer"></div>
</div>`;
    }

    css() {
        return `@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@300..700&display=swap');
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
.modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%,-50%);
    min-width: 225px;
    min-height: 200px;
    width: 640px;
    height: 200px;
    max-height: 90vh;
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
    transition: opacity, top, left .4s ease;
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
    width: inherit;
    height: inherit;
}

.dev-content {
    width: 100%;
    height: calc(100% - 30px);
    font-size: 14px;
    line-height: 1.5;
    padding: 10px 15px;
    white-space: nowrap;
    border: none;
    border-top: #fff4 1px solid;
    border-bottom: #fff4 1px solid;
    cursor: default;
}
.dev-footer {
    background: linear-gradient(to top, var(--dev-accent), var(--dev-bg));
    padding: 6px 10px;
    font-size: 12px;
    text-align: right;
    color: var(--dev-fg);
}`;
    }
}
