/**
 * @name Website Downloader
 *
 * @author Manuel Pelzer
 * @file history.js
 * @copyright © 2025 By Manuel Pelzer
 * @license MIT
 */
"use strict";
/**
 * History
 *
 * Manages a per-input history stack with keyboard navigation and persistence to localStorage.
 * Attaches to an input/textarea element by id, intercepts its onchange and onkeydown handlers
 * (preserving any previously assigned handlers), and stores entered values in a history array
 * saved in localStorage.
 *
 * Usage:
 *   const h = new History('myInputId');
 *
 * Behavior summary:
 * - Records the element's value when it changes and persists the history.
 * - Up/Down arrow keys navigate back and forward through recorded values.
 * - Delete (while focused on the element) removes the currently selected value from history.
 * - clear() empties stored history; remove(e) removes the currently selected entry.
 *
 * @class
 *
 * @param {string} id - The id of the input/textarea element to attach history handling to.
 *
 * @property {string} id - The id passed to the constructor.
 * @property {(HTMLInputElement|HTMLTextAreaElement|null)} element - The DOM element found by id; null if not found.
 * @property {string[]} history - Array of stored values for this element (loaded from localStorage).
 * @property {number} pointer - Index into `history` representing the current selection; may be history.length - 1
 *                              when the currently shown value is the most recent entry or point at an empty value.
 * @property {(function|null)} oldOnChange - Previously assigned onchange handler on the element (if any).
 * @property {(function|null)} oldOnKeyDown - Previously assigned onkeydown handler on the element (if any).
 *
 * Public instance methods:
 *
 * @method add
 * @returns {History} this - Adds the current element value to the end of the history (if different from last entry),
 *                          updates the pointer to the new last index, and persists the history.
 * @method forward
 * @returns {History} this - Moves the pointer forward by one. If the pointer moves past the last stored entry,
 *                          the element's value is cleared and the pointer is clamped to history.length.
 * @method back
 * @returns {History} this - Moves the pointer back by one (clamped to 0) and sets the element's value to the
 *                          history entry at the new pointer.
 * @method clear
 * @returns {History} this - Clears the persisted history for this id (removes the localStorage key and empties
 *                          the in-memory history array), and resets the pointer to 0.
 * @method remove
 * @returns {History} this - Removes the last occurrence of the element's current value from history (if present),
 *                          updates/persists the history and pointer, and sets the element value to the new selected entry.
 * @method destroy
 * @returns {void} - Restores the element's original onchange handler and the document's original onkeydown handler,
 *                   clears internal history/pointer references, and detaches behavior.
 *
 * Notes:
 * - If no DOM element is found for the supplied id, the constructor returns early and the instance will not manage history.
 * - The class preserves and calls any previously attached onchange and onkeydown handlers for the element.
 * - The implementation assumes the element exposes a 'value' property (e.g., input or textarea).
 */
export class History {
  // prettier-ignore-start
  oldOnChange = null;
  oldOnKeyDown = null;
  constructor(id) {
    this.id = id instanceof Element ? id.id : id;
    this.element = id instanceof Element ? id : document.getElementById(id);
    if (!this.element) return;
    this.history = this.#fromStore(`${id}-history`) || [];
    this.pointer = (this.element.value && this.history.includes(this.element.value) ? this.history.indexOf(this.element.value) : this.history.length ? this.history.length - 1 : 0);
    this.#handleEvents();
    return this;
  }
  add = () => {
    if (!this.history.length || this.history[this.history.length - 1] !== this.element.value) {
      this.history.push(this.element.value);
      this.pointer = this.history.length - 1;
      this.#toStore(`${this.id}-history`, this.history);
    }
    return this;
  };
  forward = () => {
    this.pointer += 1;
    if (this.pointer >= this.history.length) {
      this.pointer = this.history.length;
      this.element.value = "";
      return this;
    }
    this.element.value = this.history[this.pointer] || "";
    return this;
  };
  back = () => {
    this.pointer -= 1;
    if (this.pointer < 0) this.pointer = 0;
    this.element.value = this.history[this.pointer] || this.element.value;
    return this;
  };
  toHistory = e => {
    this.add(e);
    return this;
  }
  clear = () => {
    localStorage[`${this.id}-history`] = "";
    this.history = [];
    this.pointer = 0;
    return this;
  };
  remove = e => {
    if (!this.history.includes(this.element.value)) return this;
    e.preventDefault();
    this.pointer = this.history.lastIndexOf(this.element.value);
    this.history.splice(this.pointer, 1);
    if (this.pointer >= this.history.length) this.pointer = this.history.length - 1;
    this.#toStore(`${this.id}-history`, this.history.length ? this.history : "");
    this.element.value = this.history[this.pointer] || "";
    return this;
  };
  destroy = () => {
    if (this.element) {
      // Setzt die Event-Handler auf die zuvor gespeicherten Original-Handler oder entfernt sie komplett
      this.element.onchange = this.oldOnChange || null;
      this.element.onkeydown = this.oldOnKeyDown || null;
    }
    this.history = null;
    this.pointer = null;
    this.oldOnChange = null;
    this.oldOnKeyDown = null;
  };
  #handleEvents() {
    this.oldOnChange = this.element.onchange;
    this.oldOnKeyDown = this.element.onkeydown;
    this.element.onkeydown = e => {
      this.#keyDown(e);
      this.oldOnKeyDown && this.oldOnKeyDown(e);
    };
    this.element.onchange = e => {
      this.add();
      this.oldOnChange && this.oldOnChange(e);
    };
  }
  #keyDown(e) {
    const key = e.key;
    const element = e.target;
    if (element !== this.element) return;
    if (["ArrowUp", "ArrowDown", "Delete"].includes(key)) e.preventDefault();
    if (key === "ArrowUp") this.back();
    else if (e.key === "ArrowDown") this.forward();
    else if (e.key === "Delete") this.remove(e);
  }
  #storage = window.localStorage || {};
  #toStore = (item, value) => {
    this.#storage[item] = JSON.stringify(value);
    return value;
  };
  #fromStore = item => {
    try {
      return JSON.parse(this.#storage[item]);
    } catch {
      return false;
    }
  };
}
