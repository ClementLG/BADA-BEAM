/**
 * =============================================================================
 * workbench.js — Bada-Beam
 * =============================================================================
 * 2-D tracing workbench.  Manages the HTML5 Canvas used to:
 *   1. Display the uploaded antenna polar-chart image.
 *   2. Let the user calibrate the polar grid (centre, 0 dB ring, angle-0).
 *   3. Trace the Azimuth and Elevation curves by clicking control points.
 *   4. Export the traced curves as [angle_deg, gain_dB] arrays for the backend.
 *
 * Dependencies (must be loaded before this script):
 *   - constants.js  (BB_CONSTANTS)
 *   - utils.js      (degToRad, distance2D, getCanvasMousePos, showToast, qs)
 *
 * Author : Clement
 * Date   : 2026-03-08
 * License: MIT
 * =============================================================================
 */

"use strict";

/* =============================================================================
 * ImageLoader
 * ===========================================================================
 * Handles loading a user-selected image onto the canvas and sizing it to fit.
 * =========================================================================== */

class ImageLoader {
    /**
     * @param {HTMLCanvasElement} canvas - Target canvas element.
     */
    constructor(canvas) {
        /** @type {HTMLCanvasElement} */
        this.canvas = canvas;
        /** @type {CanvasRenderingContext2D} */
        this.ctx = canvas.getContext("2d");
        /** @type {HTMLImageElement|null} */
        this.image = null;
    }

    /**
     * Load an image File and render it on the canvas, scaling to fit.
     * @param {File} file - The image file selected by the user.
     * @returns {Promise<void>}
     */
    async load(file) {
        this.image = await loadImageFile(file);
        this._fitToCanvas();
    }

    /**
     * Scale and centre the loaded image so it fills the canvas while
     * preserving the aspect ratio.
     * @private
     */
    _fitToCanvas() {
        if (!this.image) return;

        const cw = this.canvas.width;
        const ch = this.canvas.height;
        const iw = this.image.naturalWidth;
        const ih = this.image.naturalHeight;

        const scale = Math.min(cw / iw, ch / ih);
        const drawW = iw * scale;
        const drawH = ih * scale;
        const offX = (cw - drawW) / 2;
        const offY = (ch - drawH) / 2;

        this.ctx.clearRect(0, 0, cw, ch);
        this.ctx.drawImage(this.image, offX, offY, drawW, drawH);
    }

    /**
     * Re-render the background image (used after overlays are cleared).
     */
    redraw() {
        this._fitToCanvas();
    }

    /**
     * Whether an image is currently loaded.
     * @returns {boolean}
     */
    get hasImage() { return this.image !== null; }
}


/* =============================================================================
 * Calibration
 * ===========================================================================
 * 3-step click-based calibration of the polar grid:
 *   Step 1 — Centre point of the chart.
 *   Step 2 — Any point on the outer (0 dB) ring → defines the scale radius.
 *   Step 3 — The 0° reference direction (e.g. top of the chart).
 * =========================================================================== */

class Calibration {
    /**
     * @param {CanvasRenderingContext2D} ctx - Rendering context.
     */
    constructor(ctx) {
        /** @type {CanvasRenderingContext2D} */
        this.ctx = ctx;
        this._reset();
    }

    /** Reset calibration state to step 1. */
    _reset() {
        /** @type {{x:number,y:number}|null} Centre of the polar chart (px). */
        this.center = null;
        /** @type {number|null} Radius of the 0 dB ring in pixels. */
        this.ringRadius = null;
        /** @type {number|null} Angle offset so that the 0° direction aligns (rad). */
        this.angleOffset = null;
        /** @type {number} Minimum displayed gain (dB) — default −40 dB. */
        this.minGainDB = -40;
        /** @type {number} Current calibration step (1 | 2 | 3 | 4=done). */
        this.step = 1;
    }

    /** Whether all three calibration points have been set. */
    get isDone() { return this.step > 3; }

    /**
     * Register a click during calibration. Advances the step automatically.
     * @param {{x:number, y:number}} pos - Click position in canvas pixels.
     */
    registerClick(pos) {
        if (this.isDone) return;

        if (this.step === 1) {
            this.center = { x: pos.x, y: pos.y };
            this._drawCrossHair(pos);
            this.step = 2;

        } else if (this.step === 2) {
            this.ringRadius = distance2D(this.center, pos);
            this._drawRingReference(pos);
            this.step = 3;

        } else if (this.step === 3) {
            const dx = pos.x - this.center.x;
            const dy = pos.y - this.center.y;
            // Canvas Y-axis is inverted; angle-0 is "up" (−π/2 in Math atan2)
            this.angleOffset = Math.atan2(dy, dx);
            this._drawAngleReference(pos);
            this.step = 4;
        }
    }

    /**
     * Convert a canvas pixel position to polar coordinates [angle_deg, gain_dB]
     * using the current calibration.
     * @param {{x:number, y:number}} pos - Canvas position.
     * @returns {{angleDeg: number, gainDB: number}}
     */
    canvasToPolar(pos) {
        if (!this.isDone) throw new Error("Calibration not complete.");

        const dx = pos.x - this.center.x;
        const dy = pos.y - this.center.y;
        const r = distance2D(this.center, pos);

        // Normalise radius: 1.0 = outer ring (0 dB), 0.0 = centre (minGainDB)
        const normalised = r / this.ringRadius;
        const gainDB = this.minGainDB + normalised * (0 - this.minGainDB);

        // Angle relative to the calibrated 0° direction
        let angle = Math.atan2(dy, dx) - this.angleOffset;
        let angleDeg = radToDeg(angle);

        // Normalise to [0, 360)
        angleDeg = ((angleDeg % 360) + 360) % 360;

        return { angleDeg, gainDB };
    }

    // -----------------------------------------------------------------------
    // Private drawing helpers
    // -----------------------------------------------------------------------

    /**
     * Draw a cross-hair at the centre point.
     * @param {{x:number,y:number}} pos
     * @private
     */
    _drawCrossHair(pos) {
        const ctx = this.ctx;
        const size = 14;
        ctx.save();
        ctx.strokeStyle = BB_CONSTANTS.COLOR_CAL;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pos.x - size, pos.y);
        ctx.lineTo(pos.x + size, pos.y);
        ctx.moveTo(pos.x, pos.y - size);
        ctx.lineTo(pos.x, pos.y + size);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = BB_CONSTANTS.COLOR_CAL;
        ctx.fill();
        ctx.restore();
    }

    /**
     * Draw a dot and dashed circle indicating the 0 dB ring.
     * @param {{x:number,y:number}} pos - Click position on the ring.
     * @private
     */
    _drawRingReference(pos) {
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = BB_CONSTANTS.COLOR_CAL;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(this.center.x, this.center.y, this.ringRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = BB_CONSTANTS.COLOR_CAL;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /**
     * Draw a line from the centre to the angle-0 reference point.
     * @param {{x:number,y:number}} pos
     * @private
     */
    _drawAngleReference(pos) {
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = BB_CONSTANTS.COLOR_CAL;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.moveTo(this.center.x, this.center.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = BB_CONSTANTS.COLOR_CAL;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}


/* =============================================================================
 * Tracer
 * ===========================================================================
 * Records clicked control points and draws the polyline on the canvas.
 * Converts each point to polar coordinates via Calibration.canvasToPolar().
 * =========================================================================== */

class Tracer {
    /**
     * @param {CanvasRenderingContext2D} ctx         - Rendering context.
     * @param {Calibration}             calibration  - Calibrated grid.
     * @param {string}                  color        - Stroke colour for this trace.
     */
    constructor(ctx, calibration, color) {
        /** @type {CanvasRenderingContext2D} */
        this.ctx = ctx;
        /** @type {Calibration} */
        this.calibration = calibration;
        /** @type {string} */
        this.color = color;
        /**
         * Array of {x, y, angleDeg, gainDB} objects for each control point.
         * @type {Array<{x:number,y:number,angleDeg:number,gainDB:number}>}
         */
        this.points = [];
    }

    /**
     * Record a new control point from a canvas click position.
     * @param {{x:number, y:number}} pos - Canvas position.
     */
    addPoint(pos) {
        const { angleDeg, gainDB } = this.calibration.canvasToPolar(pos);
        this.points.push({ x: pos.x, y: pos.y, angleDeg, gainDB });
        this._redrawTrace();
    }

    /**
     * Remove the most recently added control point.
     */
    undo() {
        if (this.points.length > 0) {
            this.points.pop();
            // Caller must trigger full canvas redraw (image + cal + this trace)
        }
    }

    /**
     * Remove all control points from this trace.
     */
    clear() {
        this.points = [];
    }

    /**
     * Export the trace as a list of [angleDeg, gainDB] pairs,
     * sorted by angle, ready to be sent to the backend.
     * @returns {[number, number][]}
     */
    exportData() {
        return this.points
            .slice()
            .sort((a, b) => a.angleDeg - b.angleDeg)
            .map(p => [p.angleDeg, p.gainDB]);
    }

    /**
     * Return the number of control points currently recorded.
     * @returns {number}
     */
    get count() { return this.points.length; }

    /**
     * Re-draw all control points and the connecting polyline.
     * @private
     */
    _redrawTrace() {
        if (this.points.length === 0) return;
        const ctx = this.ctx;
        const r = BB_CONSTANTS.POINT_RADIUS;

        ctx.save();
        ctx.strokeStyle = this.color;
        ctx.fillStyle = this.color;
        ctx.lineWidth = BB_CONSTANTS.TRACE_LINE_WIDTH;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 6;

        // Draw polyline
        ctx.beginPath();
        ctx.moveTo(this.points[0].x, this.points[0].y);
        for (let i = 1; i < this.points.length; i++) {
            ctx.lineTo(this.points[i].x, this.points[i].y);
        }
        ctx.stroke();

        // Draw control point dots
        for (const p of this.points) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    /**
     * Replay the trace drawing on the canvas (used after full canvas redraws).
     */
    redraw() {
        this._redrawTrace();
    }
}


/* =============================================================================
 * PlaneManager
 * ===========================================================================
 * Coordinates the two Tracer instances (Azimuth + Elevation) and manages
 * the "Save Azimuth" / "Save Elevation" workflow.
 * =========================================================================== */

class PlaneManager {
    /**
     * @param {Tracer} azTracer  - Tracer for the azimuth plane.
     * @param {Tracer} elTracer  - Tracer for the elevation plane.
     */
    constructor(azTracer, elTracer) {
        /** @type {Tracer} */
        this.azTracer = azTracer;
        /** @type {Tracer} */
        this.elTracer = elTracer;
        /** @type {[number,number][]|null} Saved azimuth data, or null. */
        this.azimuthData = null;
        /** @type {[number,number][]|null} Saved elevation data, or null. */
        this.elevationData = null;
        /** @type {"az"|"el"} Currently active tracing plane. */
        this.activePlane = "az";
    }

    /** Returns the Tracer for the currently active plane. */
    get activeTracer() {
        return this.activePlane === "az" ? this.azTracer : this.elTracer;
    }

    /**
     * Switch the active tracing plane.
     * @param {"az"|"el"} plane
     */
    setActivePlane(plane) {
        if (plane !== "az" && plane !== "el") {
            throw new Error(`Unknown plane: "${plane}". Must be "az" or "el".`);
        }
        this.activePlane = plane;
    }

    /**
     * Save the current trace of the active plane and reset the tracer.
     * @returns {{ plane: string, count: number }} Info about what was saved.
     */
    saveActivePlane() {
        const data = this.activeTracer.exportData();
        const plane = this.activePlane;

        if (data.length < 3) {
            throw new Error("At least 3 control points are required to save a plane.");
        }

        if (plane === "az") {
            this.azimuthData = data;
        } else {
            this.elevationData = data;
        }

        return { plane, count: data.length };
    }

    /** Whether both planes have been saved. */
    get isComplete() {
        return this.azimuthData !== null && this.elevationData !== null;
    }
}


/* =============================================================================
 * Workbench  (top-level facade)
 * ===========================================================================
 * Wires all the above classes together and binds to the HTML elements.
 * =========================================================================== */

class Workbench {
    /**
     * @param {HTMLCanvasElement}     canvas          - 2-D workbench canvas.
     * @param {Object}                uiElements      - Object of key HTML element refs.
     * @param {HTMLButtonElement}     uiElements.btnSaveAz
     * @param {HTMLButtonElement}     uiElements.btnSaveEl
     * @param {HTMLButtonElement}     uiElements.btnUndo
     * @param {HTMLButtonElement}     uiElements.btnClearTrace
     * @param {HTMLInputElement}      uiElements.fileInput
     * @param {HTMLElement}           uiElements.dropZone
     * @param {HTMLElement}           uiElements.modeIndicator
     * @param {HTMLElement}           uiElements.calStepEls   - NodeList of step indicators.
     * @param {HTMLElement}           uiElements.planeAzCount
     * @param {HTMLElement}           uiElements.planeElCount
     * @param {HTMLElement}           uiElements.planeAzDot
     * @param {HTMLElement}           uiElements.planeElDot
     * @param {HTMLInputElement}      uiElements.minGainInput
     * @param {Function}              uiElements.onPlaneToggle - Callback when plane is switched.
     */
    constructor(canvas, uiElements) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.ui = uiElements;

        // Sub-components
        this.imageLoader = new ImageLoader(canvas);
        this.calibration = new Calibration(this.ctx);
        this.azTracer = new Tracer(this.ctx, this.calibration, BB_CONSTANTS.COLOR_AZ);
        this.elTracer = new Tracer(this.ctx, this.calibration, BB_CONSTANTS.COLOR_EL);
        this.planeManager = new PlaneManager(this.azTracer, this.elTracer);

        /** @type {"idle"|"calibrating"|"tracing"} Current interaction mode. */
        this.mode = "idle";

        this._bindEvents();
    }

    // -----------------------------------------------------------------------
    // Event binding
    // -----------------------------------------------------------------------

    /** Bind all canvas and button event listeners. @private */
    _bindEvents() {
        const { fileInput, btnSaveAz, btnSaveEl, btnUndo, btnClearTrace,
            minGainInput } = this.ui;

        // File input
        fileInput.addEventListener("change", (e) => {
            if (e.target.files?.[0]) this._handleFileLoad(e.target.files[0]);
        });

        // Drag-and-drop on canvas wrapper
        this.canvas.parentElement.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
        });
        this.canvas.parentElement.addEventListener("drop", (e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) this._handleFileLoad(file);
        });

        // Canvas click
        this.canvas.addEventListener("click", (e) => {
            this._handleCanvasClick(getCanvasMousePos(this.canvas, e));
        });

        // Buttons
        btnSaveAz.addEventListener("click", () => this._savePlane("az"));
        btnSaveEl.addEventListener("click", () => this._savePlane("el"));
        btnUndo.addEventListener("click", () => this._undoLastPoint());
        btnClearTrace.addEventListener("click", () => this._clearCurrentTrace());

        // Min gain field
        minGainInput.addEventListener("change", (e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val < 0) {
                this.calibration.minGainDB = val;
            }
        });
    }

    // -----------------------------------------------------------------------
    // High-level handlers
    // -----------------------------------------------------------------------

    /**
     * Load a new image and reset the workbench state.
     * @param {File} file
     * @private
     */
    async _handleFileLoad(file) {
        try {
            await this.imageLoader.load(file);
            this._resetWorkbench();
            this.ui.dropZone.classList.add("hidden");
            this.mode = "calibrating";
            this._updateModeIndicator();
            this._updateCalibrationSteps();
            showToast("Image loaded — click to set the centre point.", "info");
        } catch (err) {
            showToast(`Failed to load image: ${err.message}`, "error");
        }
    }

    /**
     * Route canvas clicks to the calibration or tracing logic.
     * @param {{x:number, y:number}} pos
     * @private
     */
    _handleCanvasClick(pos) {
        if (this.mode === "idle") return;

        if (this.mode === "calibrating") {
            this.calibration.registerClick(pos);

            if (this.calibration.isDone) {
                this.mode = "tracing";
                showToast("Calibration complete — start clicking to trace.", "success");
            }
            this._updateCalibrationSteps();

        } else if (this.mode === "tracing") {
            this.planeManager.activeTracer.addPoint(pos);
            this._updatePlaneCounts();
        }

        this._updateModeIndicator();
    }

    /**
     * Save the currently traced plane and switch to the other.
     * @param {"az"|"el"} plane
     * @private
     */
    _savePlane(plane) {
        if (this.mode !== "tracing") {
            showToast("Complete calibration before saving.", "warning");
            return;
        }

        this.planeManager.setActivePlane(plane);

        try {
            const { count } = this.planeManager.saveActivePlane();
            showToast(`${plane.toUpperCase()} saved — ${count} points.`, "success");
            this._updatePlaneDots();
            this._updatePlaneCounts();

            // Switch to the other plane automatically
            const next = plane === "az" ? "el" : "az";
            this.planeManager.setActivePlane(next);
            this.planeManager.activeTracer.clear();
            this._fullRedraw();
        } catch (err) {
            showToast(err.message, "warning");
        }
    }

    /**
     * Undo the last control point of the active trace.
     * @private
     */
    _undoLastPoint() {
        if (this.mode !== "tracing") return;
        this.planeManager.activeTracer.undo();
        this._fullRedraw();
        this._updatePlaneCounts();
    }

    /**
     * Clear all points from the current trace.
     * @private
     */
    _clearCurrentTrace() {
        if (this.mode !== "tracing") return;
        this.planeManager.activeTracer.clear();
        this._fullRedraw();
        this._updatePlaneCounts();
    }

    // -----------------------------------------------------------------------
    // Drawing & UI update helpers
    // -----------------------------------------------------------------------

    /**
     * Full canvas redraw: image → calibration marks → all traces.
     * @private
     */
    _fullRedraw() {
        this.imageLoader.redraw();
        // Calibration marks are baked into the canvas image; redraw traces
        this.azTracer.redraw();
        this.elTracer.redraw();
    }

    /**
     * Reset all workbench state (keeps calibration from scratch).
     * @private
     */
    _resetWorkbench() {
        this.calibration._reset();
        this.azTracer.clear();
        this.elTracer.clear();
        this.planeManager.azimuthData = null;
        this.planeManager.elevationData = null;
        this.planeManager.activePlane = "az";
        this._updatePlaneDots();
        this._updatePlaneCounts();
        this._updateCalibrationSteps();
    }

    /** Update the mode badge in the workbench toolbar. @private */
    _updateModeIndicator() {
        const el = this.ui.modeIndicator;
        el.className = "mode-indicator";

        if (this.mode === "calibrating") {
            el.textContent = `Calibration (step ${this.calibration.step}/3)`;
            el.classList.add("mode--calibrate");
        } else if (this.mode === "tracing") {
            const plane = this.planeManager.activePlane.toUpperCase();
            el.textContent = `Tracing — ${plane}`;
            el.classList.add("mode--trace");
        } else {
            el.textContent = "Idle — upload an image";
        }
    }

    /** Highlight the current calibration step in the sidebar. @private */
    _updateCalibrationSteps() {
        const steps = this.ui.calStepEls;
        const cur = this.calibration.step;
        steps.forEach((el, idx) => {
            el.classList.remove("active", "done");
            if (idx + 1 < cur) el.classList.add("done");
            if (idx + 1 === cur) el.classList.add("active");
        });
    }

    /** Update the control-point count labels in the sidebar. @private */
    _updatePlaneCounts() {
        this.ui.planeAzCount.textContent = `${this.planeManager.azTracer.count} pts`;
        this.ui.planeElCount.textContent = `${this.planeManager.elTracer.count} pts`;
    }

    /** Update the status dots for each plane. @private */
    _updatePlaneDots() {
        const azSaved = this.planeManager.azimuthData !== null;
        const elSaved = this.planeManager.elevationData !== null;
        this.ui.planeAzDot.classList.toggle("active", azSaved);
        this.ui.planeElDot.classList.toggle("active", elSaved);
        this.ui.btnSaveAz.classList.toggle("btn--success", azSaved);
        this.ui.btnSaveEl.classList.toggle("btn--success", elSaved);
    }

    // -----------------------------------------------------------------------
    // Public data accessor
    // -----------------------------------------------------------------------

    /**
     * Retrieve the saved azimuth and elevation arrays for the backend.
     * @returns {{ azimuth: [number,number][], elevation: [number,number][] }}
     * @throws {Error} If one or both planes are not yet saved.
     */
    getData() {
        if (!this.planeManager.isComplete) {
            throw new Error("Save both Azimuth and Elevation before generating.");
        }
        return {
            azimuth: this.planeManager.azimuthData,
            elevation: this.planeManager.elevationData,
        };
    }
}
