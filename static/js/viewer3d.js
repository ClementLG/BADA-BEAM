/**
 * =============================================================================
 * viewer3d.js — Bada-Beam
 * =============================================================================
 * Three.js-based 3-D radiation pattern viewer.
 *
 * Responsibilities:
 *   - Initialise a WebGL renderer, perspective camera, and OrbitControls.
 *   - Build a BufferGeometry from the backend mesh payload (vertices/faces/colors).
 *   - Provide a toggleable X/Y/Z axes helper.
 *   - Export the current view as a PNG screenshot.
 *   - Export the 3-D mesh as a Wavefront OBJ file.
 *   - Expose a high-level `Viewer3D.generate(azData, elData)` method that
 *     calls the Flask backend and renders the result.
 *
 * Dependencies (loaded via CDN in index.html before this script):
 *   - Three.js   (global `THREE`)
 *   - OrbitControls  (global `THREE.OrbitControls`)
 *   - constants.js   (BB_CONSTANTS)
 *   - utils.js       (showToast, downloadBlob)
 *
 * Author : Clement
 * Date   : 2026-03-08
 * License: MIT
 * =============================================================================
 */

"use strict";

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* =============================================================================
 * SceneManager
 * ===========================================================================
 * Owns the Three.js renderer, scene, camera, lights, and animation loop.
 * =========================================================================== */

class SceneManager {
    /**
     * @param {HTMLCanvasElement} canvas - Canvas element for WebGL rendering.
     */
    constructor(canvas) {
        /** @type {HTMLCanvasElement} */
        this.canvas = canvas;

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            preserveDrawingBuffer: true,  // Required for PNG export
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setClearColor(BB_CONSTANTS.RENDERER_BG_COLOR, 1);
        this._sizeRenderer();

        // Scene
        this.scene = new THREE.Scene();

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            BB_CONSTANTS.CAMERA_FOV,
            canvas.clientWidth / canvas.clientHeight,
            BB_CONSTANTS.CAMERA_NEAR,
            BB_CONSTANTS.CAMERA_FAR,
        );
        this.camera.position.set(
            BB_CONSTANTS.CAMERA_DISTANCE,
            BB_CONSTANTS.CAMERA_DISTANCE * 0.6,
            BB_CONSTANTS.CAMERA_DISTANCE,
        );

        // Controls
        this.controls = new OrbitControls(this.camera, canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;

        // Lighting (gentle ambient + directional for depth cues)
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(5, 10, 7);
        this.scene.add(dirLight);

        // Start render loop
        this._animate();

        // Handle container resizes
        window.addEventListener("resize", () => this._onResize());
    }

    /**
     * Animation loop — runs continuously at display refresh rate.
     * @private
     */
    _animate() {
        requestAnimationFrame(() => this._animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Size the renderer to match the canvas CSS size.
     * @private
     */
    _sizeRenderer() {
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        this.renderer.setSize(w, h, false);
    }

    /**
     * Handle container resize: update renderer and camera aspect ratio.
     * @private
     */
    _onResize() {
        this._sizeRenderer();
        this.camera.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
        this.camera.updateProjectionMatrix();
    }

    /**
     * Add a Three.js Object3D to the scene.
     * @param {THREE.Object3D} object
     */
    add(object) { this.scene.add(object); }

    /**
     * Remove a Three.js Object3D from the scene.
     * @param {THREE.Object3D} object
     */
    remove(object) { this.scene.remove(object); }

    /**
     * Reset the camera to its initial orbit position smoothly.
     */
    resetCamera() {
        const d = BB_CONSTANTS.CAMERA_DISTANCE;
        this.camera.position.set(d, d * 0.6, d);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }
}


/* =============================================================================
 * GeometryBuilder
 * ===========================================================================
 * Converts the raw backend payload into a Three.js Mesh with vertex colours.
 * =========================================================================== */

class GeometryBuilder {
    /**
     * Build a Three.js Mesh from the backend mesh payload.
     *
     * @param {{
     *   vertices: [number,number,number][],
     *   faces:    [number,number,number][],
     *   colors:   [number,number,number][]
     * }} payload - The JSON response from POST /generate.
     *
     * @returns {THREE.Mesh} A double-sided mesh with per-vertex colours.
     */
    static buildFromPayload(payload) {
        const geometry = new THREE.BufferGeometry();

        // Flatten vertex and colour arrays for BufferGeometry
        const positions = new Float32Array(payload.vertices.flat());
        const colors = new Float32Array(payload.colors.flat());
        const indices = new Uint32Array(payload.faces.flat());

        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeVertexNormals();

        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
            shininess: 60,
            specular: new THREE.Color(0x333333),
            transparent: true,
            opacity: 0.92,
        });

        return new THREE.Mesh(geometry, material);
    }

    /**
     * Build a wireframe overlay for the same geometry.
     * @param {THREE.BufferGeometry} geometry
     * @returns {THREE.LineSegments}
     */
    static buildWireframe(geometry) {
        const wfGeo = new THREE.WireframeGeometry(geometry);
        const wfMat = new THREE.LineBasicMaterial({
            color: 0x00e5ff,
            transparent: true,
            opacity: 0.08,
        });
        return new THREE.LineSegments(wfGeo, wfMat);
    }
}


/* =============================================================================
 * AxesManager
 * ===========================================================================
 * Manages the togglable X/Y/Z axes helper in the scene.
 * =========================================================================== */

class AxesManager {
    /**
     * @param {SceneManager} sceneManager
     */
    constructor(sceneManager) {
        /** @type {SceneManager} */
        this.sceneManager = sceneManager;
        /** @type {THREE.AxesHelper|null} */
        this.axesHelper = null;
    }

    /**
     * Show or hide the XYZ axes helper.
     * @param {boolean} visible
     */
    setVisible(visible) {
        if (visible && !this.axesHelper) {
            this.axesHelper = new THREE.AxesHelper(BB_CONSTANTS.AXES_SIZE);
            this.sceneManager.add(this.axesHelper);

        } else if (!visible && this.axesHelper) {
            this.sceneManager.remove(this.axesHelper);
            this.axesHelper.dispose?.();
            this.axesHelper = null;
        }
    }

    /** Toggle axes visibility.  @returns {boolean} New state (true = visible). */
    toggle() {
        const next = this.axesHelper === null;
        this.setVisible(next);
        return next;
    }
}


/* =============================================================================
 * ExportManager
 * ===========================================================================
 * Handles PNG screenshot and OBJ file exports.
 * =========================================================================== */

class ExportManager {
    /**
     * @param {SceneManager} sceneManager
     */
    constructor(sceneManager) {
        /** @type {SceneManager} */
        this.sceneManager = sceneManager;
        /** @type {THREE.Mesh|null} Currently rendered mesh (needed for OBJ). */
        this.currentMesh = null;
    }

    /**
     * Export the current renderer output as a PNG image.
     * @param {string} [filename="bada-beam.png"]
     */
    exportPNG(filename = "bada-beam.png") {
        // The renderer needs `preserveDrawingBuffer: true` (set in SceneManager)
        const dataUrl = this.sceneManager.renderer.domElement.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = filename;
        a.click();
    }

    /**
     * Export the current mesh as a Wavefront OBJ string and trigger download.
     * @param {string} [filename="bada-beam.obj"]
     */
    exportOBJ(filename = "bada-beam.obj") {
        if (!this.currentMesh) {
            showToast("Generate a model first before exporting.", "warning");
            return;
        }

        const obj = this._buildOBJString(this.currentMesh);
        const blob = new Blob([obj], { type: "text/plain" });
        downloadBlob(blob, filename);
    }

    /**
     * Build a minimal Wavefront OBJ string from a Three.js Mesh.
     *
     * Writes vertex positions and face indices (1-based, OBJ convention).
     * Vertex colours are encoded as `# color R G B` comments (not standard
     * OBJ, but compatible with MeshLab and Blender importers).
     *
     * @param {THREE.Mesh} mesh
     * @returns {string} OBJ file contents.
     * @private
     */
    _buildOBJString(mesh) {
        const geo = mesh.geometry;
        const posAttr = geo.getAttribute("position");
        const colAttr = geo.getAttribute("color");
        const indexArr = geo.index?.array;

        const lines = [
            "# Bada-Beam — Antenna Radiation Pattern",
            `# Generated: ${new Date().toISOString()}`,
            `# Vertices : ${posAttr.count}`,
            `# Faces    : ${indexArr ? indexArr.length / 3 : 0}`,
            "",
        ];

        // Vertices
        for (let i = 0; i < posAttr.count; i++) {
            lines.push(`v ${posAttr.getX(i).toFixed(6)} ${posAttr.getY(i).toFixed(6)} ${posAttr.getZ(i).toFixed(6)}`);
        }

        // Vertex colours (comment-encoded)
        if (colAttr) {
            for (let i = 0; i < colAttr.count; i++) {
                const r = (colAttr.getX(i) * 255) | 0;
                const g = (colAttr.getY(i) * 255) | 0;
                const b = (colAttr.getZ(i) * 255) | 0;
                lines.push(`# vc ${i + 1} ${r} ${g} ${b}`);
            }
        }

        lines.push("");

        // Faces (1-based indices in OBJ)
        if (indexArr) {
            for (let i = 0; i < indexArr.length; i += 3) {
                lines.push(`f ${indexArr[i] + 1} ${indexArr[i + 1] + 1} ${indexArr[i + 2] + 1}`);
            }
        }

        return lines.join("\n");
    }
}


/* =============================================================================
 * Viewer3D  (top-level facade)
 * ===========================================================================
 * Wires the scene manager, geometry builder, axes manager, and exporter.
 * Exposes the single `generate()` method called by the page controller.
 * =========================================================================== */

class Viewer3D {
    /**
     * @param {HTMLCanvasElement} canvas      - Three.js rendering canvas.
     * @param {HTMLElement}       placeholder - "Generate first" UI overlay.
     * @param {HTMLElement}       spinner     - Loading spinner overlay.
     */
    constructor(canvas, placeholder, spinner) {
        this.sceneManager = new SceneManager(canvas);
        this.axesManager = new AxesManager(this.sceneManager);
        this.exportManager = new ExportManager(this.sceneManager);
        this.placeholder = placeholder;
        this.spinner = spinner;

        /** @type {THREE.Mesh|null} Currently displayed mesh (kept for disposal). */
        this._currentMesh = null;
        /** @type {THREE.LineSegments|null} Wireframe overlay. */
        this._currentWireframe = null;

        // Show axes by default
        this.axesManager.setVisible(true);
    }

    /**
     * Fetch a 3-D mesh from the backend and render it.
     *
     * @param {[number,number][]} azimuthData   - [[angleDeg, gainDB], ...]
     * @param {[number,number][]} elevationData - [[angleDeg, gainDB], ...]
     * @returns {Promise<void>}
     */
    async generate(azimuthData, elevationData) {
        this._showSpinner(true);
        const progressEl = this.spinner.querySelector("#spinner-progress");
        if (progressEl) progressEl.textContent = "(0%)";

        let fakeProgress = 0;
        const progressInterval = setInterval(() => {
            if (fakeProgress < 95) {
                // Slower increment as we approach 95%
                const increment = Math.max(1, Math.floor((95 - fakeProgress) * 0.05));
                fakeProgress += increment;
                if (progressEl) progressEl.textContent = `(${fakeProgress}%)`;
            }
        }, 400);

        try {
            const response = await fetch(BB_CONSTANTS.ENDPOINT_GENERATE, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ azimuth: azimuthData, elevation: elevationData }),
            });

            clearInterval(progressInterval);

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Server error ${response.status}`);
            }

            // Stream response to show actual download progress if possible
            const contentLength = response.headers.get("content-length");
            const total = contentLength ? parseInt(contentLength, 10) : 0;
            let loaded = 0;

            const reader = response.body.getReader();
            const chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                if (value) {
                    chunks.push(value);
                    loaded += value.length;

                    if (progressEl) {
                        if (total > 0) {
                            // Scale remaining 95->100% or just jump correctly
                            const realPercent = Math.round((loaded / total) * 100);
                            progressEl.textContent = `(${Math.max(fakeProgress, realPercent)}%)`;
                        } else {
                            progressEl.textContent = `(${Math.round(loaded / 1024)} KB)`;
                        }
                    }
                }
            }

            // Combine chunks into a single Uint8Array
            const allChunks = new Uint8Array(loaded);
            let position = 0;
            for (const chunk of chunks) {
                allChunks.set(chunk, position);
                position += chunk.length;
            }

            // Parse JSON
            if (progressEl) progressEl.textContent = "(100%)";
            const text = new TextDecoder("utf-8").decode(allChunks);
            const payload = JSON.parse(text);

            this._renderPayload(payload);
            showToast("3-D model generated!", "success");

        } catch (err) {
            clearInterval(progressInterval);
            showToast(`Generation failed: ${err.message}`, "error");
            console.error("[Viewer3D.generate]", err);
        } finally {
            this._showSpinner(false);
            if (progressEl) progressEl.textContent = "";
        }
    }

    /**
     * Replace the current mesh with one built from the given payload.
     * @param {object} payload - Backend response {vertices, faces, colors}.
     * @private
     */
    _renderPayload(payload) {
        // Dispose previous mesh to free GPU memory
        this._disposeCurrent();

        const mesh = GeometryBuilder.buildFromPayload(payload);
        const wireframe = GeometryBuilder.buildWireframe(mesh.geometry);

        this.sceneManager.add(mesh);
        this.sceneManager.add(wireframe);

        this._currentMesh = mesh;
        this._currentWireframe = wireframe;
        this.exportManager.currentMesh = mesh;

        // Hide placeholder, reset camera
        this.placeholder.classList.add("hidden");
        this.sceneManager.resetCamera();
    }

    /**
     * Dispose GPU resources for the currently displayed mesh.
     * @private
     */
    _disposeCurrent() {
        if (this._currentMesh) {
            this._currentMesh.geometry.dispose();
            this._currentMesh.material.dispose();
            this.sceneManager.remove(this._currentMesh);
            this._currentMesh = null;
        }
        if (this._currentWireframe) {
            this._currentWireframe.geometry.dispose();
            this._currentWireframe.material.dispose();
            this.sceneManager.remove(this._currentWireframe);
            this._currentWireframe = null;
        }
    }

    /**
     * Toggle the XYZ axes helper.
     * @returns {boolean} New visibility state.
     */
    toggleAxes() { return this.axesManager.toggle(); }

    /**
     * Export the current view as a PNG screenshot.
     */
    exportPNG() { this.exportManager.exportPNG(); }

    /**
     * Export the current mesh as a Wavefront OBJ file.
     */
    exportOBJ() { this.exportManager.exportOBJ(); }

    /**
     * Show or hide the loading spinner overlay.
     * @param {boolean} visible
     * @private
     */
    _showSpinner(visible) {
        this.spinner.classList.toggle("visible", visible);
    }
}

// Expose to window since this script is now a module
window.Viewer3D = Viewer3D;
