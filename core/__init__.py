"""
================================================================================
core/__init__.py — Bada-Beam
================================================================================
Public API of the core math engine.
Importing from `core` exposes the single entry-point used by the Flask routes.

Author : Clement
Date   : 2026-03-08
License: MIT
================================================================================
"""

from .mesh import build_mesh

__all__ = ["build_mesh"]
