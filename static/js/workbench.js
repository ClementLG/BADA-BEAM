/**
 * =============================================================================
 * workbench.js — Bada-Beam
 * =============================================================================
 * 2-D tracing workbench.  Manages the HTML5 Canvas used to:
 *   1. Display the uploaded antenna polar-chart image (per-plane).
 *   2. Let the user calibrate the polar grid (centre, 0 dB ring, main lobe).
 *   3. Trace the Azimuth and Elevation curves by clicking control points.
 *   4. Export the traced curves as [angle_deg, gain_dB] arrays for the backend.
 *
 * Architecture: each plane (az / el) owns a PlaneContext that bundles its own
 * ImageLoader + Calibration + Tracer.  Switching the active plane tab simply
 * swaps the active PlaneContext and redraws the canvas with that plane's data.
 *
 * Dependencies (must be loaded before this script):
 *   - constants.js  (BB_CONSTANTS)
 *   - utils.js      (degToRad, distance2D, getCanvasMousePos, showToast, qs)
 *
 * Author : Clement
 * Date   : 2026-03-08
 * License: GNU GPLv3
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
 *   Step 3 — The main lobe direction (= 0° reference).
 *
 * The "main lobe direction" concept: the user clicks the point on the outer
 * ring that corresponds to the highest-gain direction.  Internally this stores
 * an angle offset (angleOffset) used to convert canvas px → polar angle.
 * The label "0°" is conventional — it means "the angle we call zero".
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
        /** @type {number|null} Angle offset so that the main lobe aligns to 0° (rad). */
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
            this.angleOffset = Math.atan2(dy, dx);
            this._drawMainLobeReference(pos);
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

        // Angle relative to the calibrated 0° direction (= main lobe)
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
     * Draw an arrow from the centre to the main lobe reference direction,
     * labelled "0° / Peak" so the user understands what was registered.
     * @param {{x:number,y:number}} pos
     * @private
     */
    _drawMainLobeReference(pos) {
        const ctx = this.ctx;
        const cx = this.center.x;
        const cy = this.center.y;

        ctx.save();

        // Dashed line from centre to peak click
        ctx.strokeStyle = BB_CONSTANTS.COLOR_CAL;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Arrowhead
        const angle = Math.atan2(pos.y - cy, pos.x - cx);
        const headLen = 10;
        ctx.fillStyle = BB_CONSTANTS.COLOR_CAL;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(
            pos.x - headLen * Math.cos(angle - Math.PI / 6),
            pos.y - headLen * Math.sin(angle - Math.PI / 6),
        );
        ctx.lineTo(
            pos.x - headLen * Math.cos(angle + Math.PI / 6),
            pos.y - headLen * Math.sin(angle + Math.PI / 6),
        );
        ctx.closePath();
        ctx.fill();

        // Label "0° / Peak"
        ctx.font = "bold 11px JetBrains Mono, monospace";
        ctx.fillStyle = BB_CONSTANTS.COLOR_CAL;
        ctx.textAlign = "center";
        const labelX = pos.x + 14 * Math.cos(angle);
        const labelY = pos.y + 14 * Math.sin(angle) - 6;
        ctx.fillText("0°", labelX, labelY);

        // Dot at click position
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
 * PlaneContext
 * ===========================================================================
 * Bundles together all per-plane state: image, calibration, tracer, and saved
 * data.  Each plane (azimuth / elevation) owns one PlaneContext instance.
 * =========================================================================== */

class PlaneContext {
    /**
     * @param {HTMLCanvasElement}       canvas  - Shared workbench canvas.
     * @param {CanvasRenderingContext2D} ctx    - Shared rendering context.
     * @param {string}                  color   - Trace colour for this plane.
     */
    constructor(canvas, ctx, color) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.imageLoader = new ImageLoader(canvas);
        this.calibration = new Calibration(ctx);
        this.tracer = new Tracer(ctx, this.calibration, color);

        /** @type {[number,number][]|null} Finalized polar data after save. */
        this.savedData = null;

        /** @type {"idle"|"calibrating"|"tracing"} */
        this.mode = "idle";
    }

    /** Whether this plane has a saved dataset ready for generation. */
    get isSaved() { return this.savedData !== null; }

    /**
     * Load a new image file into this plane context and start calibration.
     * @param {File} file
     * @returns {Promise<void>}
     */
    async loadImage(file) {
        await this.imageLoader.load(file);
        // Reset calibration and trace when a new image is loaded
        this.calibration._reset();
        this.tracer.clear();
        this.savedData = null;
        this.mode = "calibrating";
    }

    /**
     * Handle a canvas click given the current mode of this context.
     * @param {{x:number,y:number}} pos
     * @returns {"calibrating"|"calibration-done"|"traced"} What happened.
     */
    handleClick(pos) {
        if (this.mode === "calibrating") {
            this.calibration.registerClick(pos);
            if (this.calibration.isDone) {
                this.mode = "tracing";
                return "calibration-done";
            }
            return "calibrating";
        }
        if (this.mode === "tracing") {
            this.tracer.addPoint(pos);
            return "traced";
        }
        return null;
    }

    /**
     * Attempt to save the current trace as the finalized plane data.
     * @throws {Error} If fewer than 3 points are traced.
     */
    save() {
        const data = this.tracer.exportData();
        if (data.length < 3) {
            throw new Error("At least 3 control points are required to save a plane.");
        }
        this.savedData = data;
    }

    /** Undo the last traced point. */
    undo() {
        this.tracer.undo();
    }

    /** Clear all traced points. */
    clearTrace() {
        this.tracer.clear();
    }

    /**
     * Automatically trace the curve by finding pixels that match the target colour.
     * @param {string} hexColor - e.g. "#ff0000"
     */
    autoTrace(hexColor) {
        if (!this.calibration.isDone) {
            throw new Error("Calibrate the grid before auto-tracing.");
        }
        if (!this.imageLoader.hasImage) return;

        // Parse target color
        const targetR = parseInt(hexColor.slice(1, 3), 16);
        const targetG = parseInt(hexColor.slice(3, 5), 16);
        const targetB = parseInt(hexColor.slice(5, 7), 16);

        // Get image data from canvas (ensure no overlays are drawn when calling this!)
        const w = this.canvas.width;
        const h = this.canvas.height;
        const imgData = this.ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        const thresh = 60; // RGB distance threshold
        const angleMap = new Map();
        const cal = this.calibration;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const a = data[i + 3];

                if (a < 128) continue; // skip transparent

                // Colour distance
                const dist = Math.sqrt((r - targetR) ** 2 + (g - targetG) ** 2 + (b - targetB) ** 2);
                if (dist < thresh) {
                    const { angleDeg, gainDB } = cal.canvasToPolar({ x, y });

                    if (gainDB < cal.minGainDB - 10) continue; // way outside chart bounds

                    const angleInt = Math.round(angleDeg) % 360;

                    if (!angleMap.has(angleInt)) {
                        angleMap.set(angleInt, { x, y, angleDeg, gainDB });
                    } else {
                        // Keep the outermost point (highest gain)
                        const existing = angleMap.get(angleInt);
                        if (gainDB > existing.gainDB) {
                            angleMap.set(angleInt, { x, y, angleDeg, gainDB });
                        }
                    }
                }
            }
        }

        const newPoints = Array.from(angleMap.values());
        if (newPoints.length === 0) {
            throw new Error("No matching colour found on the chart.");
        }

        newPoints.sort((a, b) => a.angleDeg - b.angleDeg);
        this.tracer.points = newPoints;
        this.mode = "tracing";
    }

    /**
     * Full redraw: background image then trace overlay.
     * Must be called when switching to this plane so the canvas shows its data.
     */
    redrawAll() {
        this.imageLoader.redraw();
        this.tracer.redraw();
    }
}


/* =============================================================================
 * Workbench  (top-level façade)
 * ===========================================================================
 * Wires all the above classes together.  Maintains two PlaneContext instances
 * (az / el) and routes canvas clicks + button actions to the active one.
 * =========================================================================== */

class Workbench {
    /**
     * @param {HTMLCanvasElement} canvas         - 2-D workbench canvas.
     * @param {Object}            uiElements     - HTML element refs (see below).
     */
    constructor(canvas, uiElements) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.ui = uiElements;

        // One PlaneContext per plane
        this.planes = {
            az: new PlaneContext(canvas, this.ctx, BB_CONSTANTS.COLOR_AZ),
            el: new PlaneContext(canvas, this.ctx, BB_CONSTANTS.COLOR_EL),
        };

        /** @type {"az"|"el"} Currently visible plane. */
        this.activePlane = "az";

        this._bindEvents();
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Switch the active plane (called by the tab bar in init script).
     * Redraws the canvas with the newly active plane's image + trace.
     * @param {"az"|"el"} plane
     */
    setActivePlane(plane) {
        if (plane !== "az" && plane !== "el") return;
        this.activePlane = plane;
        const ctx = this.planes[plane];

        if (ctx.imageLoader.hasImage) {
            this.ui.dropZone.classList.add("hidden");
            ctx.redrawAll();
        } else {
            this.ui.dropZone.classList.remove("hidden");
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }

        this._updateModeIndicator();
    }

    /**
     * Retrieve saved azimuth + elevation data for the backend.
     * @returns {{ azimuth: [number,number][], elevation: [number,number][] }}
     * @throws {Error} If one or both planes are not saved.
     */
    getData() {
        const { az, el } = this.planes;
        if (!az.isSaved || !el.isSaved) {
            throw new Error("Save both Azimuth and Elevation planes before generating.");
        }
        return { azimuth: az.savedData, elevation: el.savedData };
    }

    // -----------------------------------------------------------------------
    // Event binding
    // -----------------------------------------------------------------------

    /** Bind all canvas and button event listeners. @private */
    _bindEvents() {
        const ui = this.ui;

        // Per-plane file inputs
        ui.fileInputAz.addEventListener("change", (e) => {
            if (e.target.files?.[0]) this._handleFileLoad(e.target.files[0], "az");
        });
        ui.fileInputEl.addEventListener("change", (e) => {
            if (e.target.files?.[0]) this._handleFileLoad(e.target.files[0], "el");
        });

        // Drag-and-drop on canvas wrapper (loads into active plane)
        this.canvas.parentElement.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
        });
        this.canvas.parentElement.addEventListener("drop", (e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) this._handleFileLoad(file, this.activePlane);
        });

        // Canvas click
        this.canvas.addEventListener("click", (e) => {
            this._handleCanvasClick(getCanvasMousePos(this.canvas, e));
        });

        // Auto-trace buttons
        ui.btnAutoTraceAz.addEventListener("click", () => this._autoTracePlane("az"));
        ui.btnAutoTraceEl.addEventListener("click", () => this._autoTracePlane("el"));

        // Save / undo / clear buttons – azimuth
        ui.btnSaveAz.addEventListener("click", () => this._savePlane("az"));
        ui.btnUndoAz.addEventListener("click", () => this._undoLastPoint("az"));
        ui.btnClearAz.addEventListener("click", () => this._clearTrace("az"));

        // Save / undo / clear buttons – elevation
        ui.btnSaveEl.addEventListener("click", () => this._savePlane("el"));
        ui.btnUndoEl.addEventListener("click", () => this._undoLastPoint("el"));
        ui.btnClearEl.addEventListener("click", () => this._clearTrace("el"));

        // Min gain field — applies to both planes
        ui.minGainInput.addEventListener("change", (e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val < 0) {
                this.planes.az.calibration.minGainDB = val;
                this.planes.el.calibration.minGainDB = val;
            }
        });
    }

    // -----------------------------------------------------------------------
    // High-level handlers
    // -----------------------------------------------------------------------

    /**
     * Load a new image into the specified plane context.
     * @param {File}      file
     * @param {"az"|"el"} plane
     * @private
     */
    async _handleFileLoad(file, plane) {
        const ctx = this.planes[plane];
        try {
            // Switch to the plane being loaded so the canvas shows it
            this.activePlane = plane;
            await ctx.loadImage(file);
            ctx.calibration.minGainDB = parseFloat(this.ui.minGainInput.value) || -40;

            // Hide drop-zone, show image
            this.ui.dropZone.classList.add("hidden");

            // Update upload label to show filename
            const nameEl = plane === "az" ? this.ui.uploadTextAz : this.ui.uploadTextEl;
            nameEl.innerHTML = `<strong>${file.name}</strong><br /><small>Loaded ✓</small>`;

            this._updateCalibrationSteps(plane);
            this._updateModeIndicator();
            showToast(`${plane.toUpperCase()} image loaded — click to set the chart centre.`, "info");
        } catch (err) {
            showToast(`Failed to load image: ${err.message}`, "error");
        }
    }

    /**
     * Route canvas clicks to the active plane's calibration or tracing logic.
     * @param {{x:number, y:number}} pos
     * @private
     */
    _handleCanvasClick(pos) {
        const ctx = this.planes[this.activePlane];
        if (ctx.mode === "idle") return;

        const result = ctx.handleClick(pos);

        if (result === "calibration-done") {
            showToast("Calibration complete — start clicking to trace the curve.", "success");
        }

        this._updateCalibrationSteps(this.activePlane);
        this._updatePlaneCounts();
        this._updateModeIndicator();
    }

    /**
     * Save the traced data for a specific plane.
     * @param {"az"|"el"} plane
     * @private
     */
    _savePlane(plane) {
        const ctx = this.planes[plane];
        if (ctx.mode !== "tracing") {
            showToast("Complete calibration before saving.", "warning");
            return;
        }
        try {
            ctx.save();
            showToast(
                `${plane.toUpperCase()} saved — ${ctx.savedData.length} points.`,
                "success",
            );
            this._updateReadinessDots();
        } catch (err) {
            showToast(err.message, "warning");
        }
    }

    /**
     * Undo the last traced point for the given plane.
     * @param {"az"|"el"} plane
     * @private
     */
    _undoLastPoint(plane) {
        const ctx = this.planes[plane];
        if (ctx.mode !== "tracing") return;
        ctx.undo();
        ctx.redrawAll();
        this._updatePlaneCounts();
    }

    /**
     * Clear all traced points for the given plane.
     * @param {"az"|"el"} plane
     * @private
     */
    _clearTrace(plane) {
        const ctx = this.planes[plane];
        if (ctx.mode !== "tracing") return;
        ctx.clearTrace();
        ctx.redrawAll();
        this._updatePlaneCounts();
    }

    /**
     * Auto-trace the specified plane using the selected colour.
     * @param {"az"|"el"} plane
     * @private
     */
    _autoTracePlane(plane) {
        const ctx = this.planes[plane];
        if (ctx.mode !== "tracing" && ctx.mode !== "calibrating") return;

        if (!ctx.calibration.isDone) {
            showToast("Complete calibration before auto-tracing.", "warning");
            return;
        }

        const colorInput = plane === "az" ? this.ui.colorAz : this.ui.colorEl;
        const hexColor = colorInput.value;

        // Ensure canvas only contains the base image for clean pixel scanning
        ctx.imageLoader.redraw();

        try {
            ctx.autoTrace(hexColor);
            ctx.redrawAll();
            this._updatePlaneCounts();
            this._updateModeIndicator();
            showToast(`Auto-traced ${ctx.tracer.count} points.`, "success");
        } catch (err) {
            ctx.redrawAll();
            showToast(err.message, "error");
        }
    }

    // -----------------------------------------------------------------------
    // UI update helpers
    // -----------------------------------------------------------------------

    /** Update the mode badge in the workbench toolbar. @private */
    _updateModeIndicator() {
        const el = this.ui.modeIndicator;
        el.className = "mode-indicator";
        const ctx = this.planes[this.activePlane];
        const label = this.activePlane === "az" ? "AZIMUTH" : "ELEVATION";

        if (ctx.mode === "calibrating") {
            el.textContent = `Calibrating ${label} — step ${ctx.calibration.step} / 3`;
            el.classList.add("mode--calibrate");
        } else if (ctx.mode === "tracing") {
            el.textContent = `Tracing — ${label}`;
            el.classList.add("mode--trace");
        } else {
            el.textContent = "Idle — load a chart in one of the plane tabs";
        }
    }

    /**
     * Highlight the current calibration step for the given plane. @private
     * @param {"az"|"el"} plane
     */
    _updateCalibrationSteps(plane) {
        const steps = this.ui.calStepEls[plane];
        const cur = this.planes[plane].calibration.step;
        steps.forEach((el, idx) => {
            el.classList.remove("active", "done");
            if (idx + 1 < cur) el.classList.add("done");
            if (idx + 1 === cur) el.classList.add("active");
        });
    }

    /** Update the point-count labels in the sidebar. @private */
    _updatePlaneCounts() {
        this.ui.countAz.textContent = `${this.planes.az.tracer.count} pts traced`;
        this.ui.countEl.textContent = `${this.planes.el.tracer.count} pts traced`;
    }

    /**
     * Update the tab + readiness dot indicators to reflect saved state. @private
     */
    _updateReadinessDots() {
        const azSaved = this.planes.az.isSaved;
        const elSaved = this.planes.el.isSaved;

        this.ui.dotAz.classList.toggle("active", azSaved);
        this.ui.dotEl.classList.toggle("active", elSaved);
        this.ui.rdotAz.classList.toggle("active", azSaved);
        this.ui.rdotEl.classList.toggle("active", elSaved);

        this.ui.btnSaveAz.classList.toggle("btn--success", azSaved);
        this.ui.btnSaveEl.classList.toggle("btn--success", elSaved);
    }
}
