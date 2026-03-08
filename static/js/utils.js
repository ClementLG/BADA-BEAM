/**
 * =============================================================================
 * utils.js — Bada-Beam
 * =============================================================================
 * Shared utility helpers used by both workbench.js and viewer3d.js.
 * All exported members are pure functions (no side-effects on globals).
 *
 * Author : Clement
 * Date   : 2026-03-08
 * License: MIT
 * =============================================================================
 */

"use strict";

/* =============================================================================
 * Math helpers
 * =========================================================================== */

/**
 * Convert degrees to radians.
 * @param {number} deg - Angle in degrees.
 * @returns {number} Angle in radians.
 */
function degToRad(deg) {
    return (deg * Math.PI) / 180;
}

/**
 * Convert radians to degrees.
 * @param {number} rad - Angle in radians.
 * @returns {number} Angle in degrees.
 */
function radToDeg(rad) {
    return (rad * 180) / Math.PI;
}

/**
 * Clamp a value to the [min, max] range.
 * @param {number} val - Value to clamp.
 * @param {number} min - Lower bound.
 * @param {number} max - Upper bound.
 * @returns {number} Clamped value.
 */
function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
}

/**
 * Linear interpolation between two values.
 * @param {number} a - Start value.
 * @param {number} b - End value.
 * @param {number} t - Parameter in [0, 1].
 * @returns {number} Interpolated value.
 */
function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Compute the Euclidean distance between two 2-D points.
 * @param {{x: number, y: number}} p1
 * @param {{x: number, y: number}} p2
 * @returns {number} Distance in the same units as the input.
 */
function distance2D(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/* =============================================================================
 * DOM helpers
 * =========================================================================== */

/**
 * Query a single DOM element; throws if not found.
 * @param {string} selector - CSS selector.
 * @param {ParentNode} [root=document] - Optional root element to search within.
 * @returns {Element} The matching element.
 * @throws {Error} If the selector matches nothing.
 */
function qs(selector, root = document) {
    const el = root.querySelector(selector);
    if (!el) throw new Error(`qs: no element for selector "${selector}"`);
    return el;
}

/**
 * Get the mouse position relative to a canvas element, accounting for
 * devicePixelRatio scaling.
 * @param {HTMLCanvasElement} canvas - Target canvas.
 * @param {MouseEvent}        event  - The mouse event.
 * @returns {{x: number, y: number}} Position in CSS pixels.
 */
function getCanvasMousePos(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
    };
}

/* =============================================================================
 * File & download helpers
 * =========================================================================== */

/**
 * Programmatically trigger a file download in the browser.
 * @param {Blob}   blob     - File content.
 * @param {string} filename - Suggested file name for the download dialog.
 */
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Read an image file selected via an <input type="file"> and return a
 * HTMLImageElement with the decoded bitmap.
 * @param {File} file - Image file to load.
 * @returns {Promise<HTMLImageElement>} Resolved with the loaded image.
 */
function loadImageFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("Failed to decode image."));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error("Failed to read file."));
        reader.readAsDataURL(file);
    });
}

/* =============================================================================
 * Toast notification
 * =========================================================================== */

/**
 * Display a transient toast notification at the bottom-right of the screen.
 *
 * Requires a `#toast-container` element in the HTML.
 *
 * @param {string} message                              - Text to display.
 * @param {"info"|"success"|"warning"|"error"} [type]  - Visual style.
 * @param {number} [duration=3000]                      - Auto-dismiss delay (ms).
 */
function showToast(message, type = "info", duration = 3000) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = "opacity 300ms ease, transform 300ms ease";
        toast.style.opacity = "0";
        toast.style.transform = "translateX(20px)";
        setTimeout(() => container.removeChild(toast), 310);
    }, duration);
}
