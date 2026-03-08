"""
================================================================================
config.py — Bada-Beam
================================================================================
Application-level configuration constants for the Flask server.
All tuneable parameters live here so that app.py and the engine stay clean.

Author : Clement
Date   : 2026-03-08
License: GNU GPLv3
================================================================================
"""

import os
from dotenv import load_dotenv

# Load environment variables from .env file if present
load_dotenv()

# ---------------------------------------------------------------------------
# Server settings
# ---------------------------------------------------------------------------
FLASK_ENV: str = os.getenv("FLASK_ENV", "production")
DEBUG: bool = os.getenv("DEBUG", "false").lower() in ("true", "1", "t")

# Host and Port bindings differ depending on environment
# - In Prod (Docker), we usually bind to 0.0.0.0
# - In Dev, we bind to 127.0.0.1
_default_host = "0.0.0.0" if FLASK_ENV == "production" else "127.0.0.1"

HOST: str = os.getenv("HOST", _default_host)
PORT: int = int(os.getenv("PORT", "5000"))


# ---------------------------------------------------------------------------
# Upload settings
# ---------------------------------------------------------------------------
MAX_CONTENT_LENGTH: int = 16 * 1024 * 1024  # 16 MB max upload size
ALLOWED_EXTENSIONS: set = {"png", "jpg", "jpeg", "bmp", "webp"}

# ---------------------------------------------------------------------------
# 3-D mesh generation
# ---------------------------------------------------------------------------
MESH_RESOLUTION: int = 180  # Number of angular steps (θ and φ) in the mesh
