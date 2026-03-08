"""
================================================================================
app.py — Bada-Beam
================================================================================
Flask application entry-point.

Exposes two routes:
    GET  /          — serves the single-page app shell (index.html).
    POST /generate  — accepts JSON {azimuth, elevation} arrays and returns a
                      3-D mesh payload {vertices, faces, colors}.

Author : Clement
Date   : 2026-03-08
License: GNU GPLv3
================================================================================
"""

from flask import Flask, render_template, request, jsonify, abort

import config
from core import build_mesh


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------

def create_app() -> Flask:
    """Create and configure the Flask application.

    Returns:
        A fully configured Flask app instance.
    """
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = config.MAX_CONTENT_LENGTH

    # -----------------------------------------------------------------------
    # Routes
    # -----------------------------------------------------------------------

    @app.get("/")
    def index():
        """Serve the single-page application shell.

        Returns:
            Rendered HTML template.
        """
        return render_template("index.html")

    @app.get("/about")
    def about():
        """Serve the about page.

        Returns:
            Rendered HTML template.
        """
        return render_template("about.html")

    @app.post("/generate")
    def generate():
        """Generate a 3-D mesh from 2-D azimuth and elevation gain data.

        Expected JSON body::

            {
                "azimuth":   [[angle_deg, gain_dB], ...],
                "elevation": [[angle_deg, gain_dB], ...]
            }

        Returns:
            JSON ``{vertices, faces, colors}`` on success.
            JSON ``{error: str}`` with HTTP 400 on bad input.
            JSON ``{error: str}`` with HTTP 500 on computation failure.
        """
        payload = request.get_json(silent=True)

        # --- Input validation -----------------------------------------------
        if not payload:
            return jsonify({"error": "Request body must be valid JSON."}), 400

        azimuth   = payload.get("azimuth")
        elevation = payload.get("elevation")

        if not azimuth or not isinstance(azimuth, list):
            return jsonify({"error": "'azimuth' must be a non-empty list."}), 400

        if not elevation or not isinstance(elevation, list):
            return jsonify({"error": "'elevation' must be a non-empty list."}), 400

        if len(azimuth) < 3:
            return jsonify({"error": "Azimuth must have at least 3 points."}), 400

        if len(elevation) < 3:
            return jsonify({"error": "Elevation must have at least 3 points."}), 400

        # --- Mesh generation ------------------------------------------------
        try:
            mesh = build_mesh(azimuth, elevation)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            app.logger.exception("Unexpected error during mesh generation.")
            return jsonify({"error": "Internal computation error."}), 500

        return jsonify(mesh)

    # -----------------------------------------------------------------------
    # Error handlers
    # -----------------------------------------------------------------------

    @app.errorhandler(400)
    def bad_request(exc):
        """Handle 400 Bad Request errors."""
        return jsonify({"error": "Bad request."}), 400

    @app.errorhandler(413)
    def too_large(exc):
        """Handle 413 Payload Too Large (file upload size exceeded)."""
        return jsonify({"error": "File too large (max 16 MB)."}), 413

    @app.errorhandler(500)
    def internal_error(exc):
        """Handle 500 Internal Server Error."""
        return jsonify({"error": "Internal server error."}), 500

    return app


# ---------------------------------------------------------------------------
# Dev-server entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app = create_app()
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG)
