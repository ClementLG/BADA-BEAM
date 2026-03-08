"""
================================================================================
core/mesh.py — Bada-Beam
================================================================================
3-D spherical mesh builder.

Given two polar arrays (Azimuth plane and Elevation plane), this module
reconstructs a full 3-D radiation-pattern volume using the multiplicative
product model:

    r(θ, φ) = sqrt( G_az(θ) × G_el(φ) )

where θ is the azimuth angle (0–360°) and φ is the elevation angle (0–180°).
The mesh is returned as indexed triangles with per-vertex colour data, ready
to be serialised to JSON and consumed by the Three.js frontend.

Author : Clement
Date   : 2026-03-08
License: MIT
================================================================================
"""

import numpy as np

from config import MESH_RESOLUTION
from .interpolation import (
    normalize_gain,
    interpolate_polar,
    interpolate_elevation,
)
from .colormap import gains_to_rgb_array


# ---------------------------------------------------------------------------
# Public entry-point
# ---------------------------------------------------------------------------

def build_mesh(azimuth_data: list, elevation_data: list) -> dict:
    """Build a 3-D spherical mesh from 2-D azimuth and elevation gain arrays.

    This is the single function called by the Flask route.  It orchestrates
    normalisation, interpolation, Cartesian conversion, triangulation, and
    colourisation.

    Args:
        azimuth_data:   List of [angle_deg, gain_dB] pairs for the horizontal
                        (azimuth) plane.  Angles should span [0, 360).
        elevation_data: List of [angle_deg, gain_dB] pairs for the vertical
                        (elevation) plane.  Angles should span [0, 180].

    Returns:
        Dictionary with three keys:
            "vertices": List of [x, y, z] Cartesian coordinates (N × 3).
            "faces":    List of [i, j, k] triangle indices (M × 3).
            "colors":   List of [r, g, b] values in [0, 1] (N × 3).

    Raises:
        ValueError: If either input array is malformed or empty.
    """
    n = MESH_RESOLUTION  # angular resolution (both θ and φ)

    # 1. Normalise and interpolate both planes
    az_angles, az_gains_raw = normalize_gain(azimuth_data)
    el_angles, el_gains_raw = normalize_gain(elevation_data)

    az_gains = interpolate_polar(az_angles, az_gains_raw, n)        # shape (n,)
    el_gains = interpolate_elevation(el_angles, el_gains_raw, n)    # shape (n,)

    # 2. Build the (n × n) radius grid using the multiplicative model
    theta = np.linspace(0.0, 2.0 * np.pi, n, endpoint=False)   # azimuth
    phi   = np.linspace(0.0, np.pi, n)                          # elevation

    # Outer product: r[i, j] = sqrt( az[i] * el[j] )
    r_grid = np.sqrt(np.outer(az_gains, el_gains))              # shape (n, n)

    # 3. Convert spherical → Cartesian
    vertices, vertex_gains = _spherical_to_cartesian(r_grid, theta, phi)

    # 4. Triangulate the grid
    faces = _triangulate(n, n)

    # 5. Assign colours from the heatmap
    colors = gains_to_rgb_array(vertex_gains)

    return {
        "vertices": vertices.tolist(),
        "faces":    faces.tolist(),
        "colors":   colors.tolist(),
    }


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _spherical_to_cartesian(
    r_grid: np.ndarray,
    theta: np.ndarray,
    phi: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Convert a 2-D radius grid in spherical coordinates to Cartesian vertices.

    The spherical convention used is:
        x = r · sin(φ) · cos(θ)
        y = r · cos(φ)                   (elevation axis)
        z = r · sin(φ) · sin(θ)

    Args:
        r_grid: 2-D NumPy array of shape (n_theta, n_phi) with radius values.
        theta:  1-D array of azimuth angles in radians, length n_theta.
        phi:    1-D array of elevation angles in radians, length n_phi.

    Returns:
        Tuple (vertices, gains) where:
            vertices — shape (n_theta × n_phi, 3) float array of [x, y, z].
            gains    — shape (n_theta × n_phi,)   flat gain values for colour mapping.
    """
    n_theta, n_phi = r_grid.shape

    # Build 2-D grids of angles  (broadcasting)
    THETA, PHI = np.meshgrid(theta, phi, indexing="ij")  # (n_theta, n_phi)

    x = r_grid * np.sin(PHI) * np.cos(THETA)
    y = r_grid * np.cos(PHI)
    z = r_grid * np.sin(PHI) * np.sin(THETA)

    vertices = np.column_stack([x.ravel(), y.ravel(), z.ravel()])
    gains    = r_grid.ravel()

    return vertices, gains


def _triangulate(n_theta: int, n_phi: int) -> np.ndarray:
    """Generate an indexed triangle list for a (n_theta × n_phi) quad grid.

    Each quad cell (i, j) → (i+1, j) → (i+1, j+1) → (i, j+1) is split into
    two counter-clockwise triangles.

    Args:
        n_theta: Number of azimuth samples (rows).
        n_phi:   Number of elevation samples (columns).

    Returns:
        2-D NumPy int32 array of shape (n_faces, 3) with vertex indices.
    """
    faces = []

    for i in range(n_theta - 1):
        for j in range(n_phi - 1):
            # Vertex indices of the current quad
            v00 = i       * n_phi + j
            v10 = (i + 1) * n_phi + j
            v01 = i       * n_phi + (j + 1)
            v11 = (i + 1) * n_phi + (j + 1)

            # Split quad into two triangles (CCW winding)
            faces.append([v00, v10, v11])
            faces.append([v00, v11, v01])

    # Wrap-around strip: connect the last theta slice back to slice 0
    for j in range(n_phi - 1):
        v00 = (n_theta - 1) * n_phi + j
        v10 = j
        v01 = (n_theta - 1) * n_phi + (j + 1)
        v11 = j + 1

        faces.append([v00, v10, v11])
        faces.append([v00, v11, v01])

    return np.array(faces, dtype=np.int32)
