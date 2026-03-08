"""
================================================================================
core/interpolation.py — Bada-Beam
================================================================================
Utilities for normalising gain data and resampling sparse polar arrays.

All functions are pure (no side-effects, no global state) so they can be
unit-tested independently of Flask.

Author : Clement
Date   : 2026-03-08
License: MIT
================================================================================
"""

import numpy as np


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def normalize_gain(data: list[list[float]]) -> tuple[np.ndarray, np.ndarray]:
    """Convert a list of [angle, gain_dB] pairs to normalised linear values.

    dB values are first shifted so the maximum is 0 dB, then converted to a
    linear scale and clamped to [0, 1].  This makes the reconstruction
    independent of the absolute dB reference on the datasheet.

    Args:
        data: List of [angle_degrees, gain_dB] pairs, e.g.
              [[0, 0], [45, -3], [90, -20], ...].

    Returns:
        Tuple (angles_deg, gains_linear) as NumPy arrays.
        `angles_deg` is in [0, 360) or [0, 180] depending on the plane.
        `gains_linear` is in [0, 1].

    Raises:
        ValueError: If `data` is empty or has inconsistent shape.
    """
    if not data:
        raise ValueError("Input data must not be empty.")

    arr = np.array(data, dtype=float)
    if arr.ndim != 2 or arr.shape[1] != 2:
        raise ValueError("Each entry must be [angle, gain_dB].")

    angles = arr[:, 0]
    gains_db = arr[:, 1]

    # Shift so the peak is 0 dB, then convert to linear
    gains_db = gains_db - gains_db.max()
    gains_linear = 10.0 ** (gains_db / 20.0)  # voltage ratio (field pattern)
    gains_linear = np.clip(gains_linear, 0.0, 1.0)

    return angles, gains_linear


def interpolate_polar(angles: np.ndarray, gains: np.ndarray,
                      n_points: int) -> np.ndarray:
    """Resample a sparse polar curve to `n_points` evenly-spaced angles.

    Uses linear interpolation with periodic wrapping so the curve closes
    smoothly at 360°.

    Args:
        angles:  1-D array of angle values in degrees, not necessarily sorted.
        gains:   1-D array of gain values (same length as `angles`).
        n_points: Number of output samples (= angular resolution of the mesh).

    Returns:
        1-D NumPy array of length `n_points` with the resampled gain values,
        corresponding to angles `linspace(0, 360, n_points, endpoint=False)`.
    """
    # Sort by angle and duplicate the wrap-around point
    sort_idx = np.argsort(angles)
    a = np.concatenate([angles[sort_idx], [angles[sort_idx[0]] + 360.0]])
    g = np.concatenate([gains[sort_idx],  [gains[sort_idx[0]]]])

    query = np.linspace(0.0, 360.0, n_points, endpoint=False)
    return np.interp(query, a, g)


def interpolate_elevation(angles: np.ndarray, gains: np.ndarray,
                          n_points: int) -> np.ndarray:
    """Resample a sparse elevation curve to `n_points` samples over [0°, 180°].

    Args:
        angles:   1-D array of elevation angles in degrees (0 = zenith, 180 = nadir).
        gains:    1-D array of gain values (same length as `angles`).
        n_points: Number of output samples.

    Returns:
        1-D NumPy array of length `n_points` over [0°, 180°].
    """
    sort_idx = np.argsort(angles)
    a = angles[sort_idx]
    g = gains[sort_idx]

    # Clamp endpoints if not already present
    if a[0] > 0.0:
        a = np.concatenate([[0.0], a])
        g = np.concatenate([[g[0]], g])
    if a[-1] < 180.0:
        a = np.concatenate([a, [180.0]])
        g = np.concatenate([g, [g[-1]]])

    query = np.linspace(0.0, 180.0, n_points)
    return np.interp(query, a, g)
