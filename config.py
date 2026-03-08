"""
================================================================================
config.py — Bada-Beam
================================================================================
Application-level configuration constants for the Flask server.
All tuneable parameters live here so that app.py and the engine stay clean.

Author : Clement
Date   : 2026-03-08
License: MIT
================================================================================
"""

# ---------------------------------------------------------------------------
# Server settings
# ---------------------------------------------------------------------------
DEBUG: bool = True          # Set to False in production
HOST: str = "127.0.0.1"    # Bind address
PORT: int = 5000            # Listening port

# ---------------------------------------------------------------------------
# Upload settings
# ---------------------------------------------------------------------------
MAX_CONTENT_LENGTH: int = 16 * 1024 * 1024  # 16 MB max upload size
ALLOWED_EXTENSIONS: set = {"png", "jpg", "jpeg", "bmp", "webp"}

# ---------------------------------------------------------------------------
# 3-D mesh generation
# ---------------------------------------------------------------------------
MESH_RESOLUTION: int = 180  # Number of angular steps (θ and φ) in the mesh
