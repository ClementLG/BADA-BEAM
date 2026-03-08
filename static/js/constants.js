/**
 * =============================================================================
 * constants.js — Bada-Beam
 * =============================================================================
 * Shared JavaScript constants used across the workbench and 3-D viewer.
 * Centralising magic numbers here avoids duplication and makes tuning easy.
 *
 * Author : Clement
 * Date   : 2026-03-08
 * License: GNU GPLv3
 * =============================================================================
 */

"use strict";

/** @namespace BB_CONSTANTS */
const BB_CONSTANTS = Object.freeze({

    /* -------------------------------------------------------------------------
     * Workbench / 2-D Canvas
     * ----------------------------------------------------------------------- */

    /** Radius in pixels of a control point dot drawn on the canvas. */
    POINT_RADIUS: 5,

    /** Stroke width (px) of the polyline connecting control points. */
    TRACE_LINE_WIDTH: 2,

    /** Colour of the azimuth trace. */
    COLOR_AZ: "#00e5ff",

    /** Colour of the elevation trace. */
    COLOR_EL: "#f0a500",

    /** Colour of the calibration reference marks. */
    COLOR_CAL: "#ff4c61",

    /** Colour of the centre reference cross-hair. */
    COLOR_CENTER: "rgba(255,255,255,0.7)",

    /* -------------------------------------------------------------------------
     * 3-D Viewer — Three.js
     * ----------------------------------------------------------------------- */

    /** Initial camera distance from the origin. */
    CAMERA_DISTANCE: 3,

    /** Vertical field of view (degrees). */
    CAMERA_FOV: 50,

    /** Near clipping plane. */
    CAMERA_NEAR: 0.01,

    /** Far clipping plane. */
    CAMERA_FAR: 1000,

    /** Length of the X/Y/Z axes helper arrows. */
    AXES_SIZE: 1.5,

    /** Background colour of the Three.js renderer. */
    RENDERER_BG_COLOR: 0x080c10,

    /* -------------------------------------------------------------------------
     * API Endpoints
     * ----------------------------------------------------------------------- */

    /** URL for the 3-D mesh generation endpoint. */
    ENDPOINT_GENERATE: "/generate",
});
