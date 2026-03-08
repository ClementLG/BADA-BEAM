"""
================================================================================
core/colormap.py — Bada-Beam
================================================================================
Maps a normalised gain value in [0, 1] to an RGB colour using a perceptually
intuitive heatmap (blue → cyan → green → yellow → red).

Author : Clement
Date   : 2026-03-08
License: MIT
================================================================================
"""

import numpy as np


# ---------------------------------------------------------------------------
# Heatmap definition
# ---------------------------------------------------------------------------

# Control points: (value, R, G, B) — all channels in [0, 1]
_HEATMAP: list[tuple[float, float, float, float]] = [
    (0.00, 0.00, 0.00, 0.50),   # near-zero → dark blue (nulls)
    (0.20, 0.00, 0.20, 1.00),   # low gain  → blue
    (0.40, 0.00, 0.80, 0.80),   # moderate  → cyan
    (0.60, 0.00, 1.00, 0.00),   # medium    → green
    (0.80, 1.00, 1.00, 0.00),   # high      → yellow
    (1.00, 1.00, 0.10, 0.00),   # peak      → red
]

_STOPS = np.array([c[0] for c in _HEATMAP])
_R     = np.array([c[1] for c in _HEATMAP])
_G     = np.array([c[2] for c in _HEATMAP])
_B     = np.array([c[3] for c in _HEATMAP])


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def gain_to_rgb(value: float) -> tuple[float, float, float]:
    """Map a normalised gain to an RGB colour using a custom heatmap.

    Args:
        value: Gain in [0, 1] (0 = null / minimum gain, 1 = peak gain).

    Returns:
        Tuple (r, g, b) with each channel in [0, 1].
    """
    v = float(np.clip(value, 0.0, 1.0))
    r = float(np.interp(v, _STOPS, _R))
    g = float(np.interp(v, _STOPS, _G))
    b = float(np.interp(v, _STOPS, _B))
    return r, g, b


def gains_to_rgb_array(values: np.ndarray) -> np.ndarray:
    """Vectorised version of `gain_to_rgb` for an entire array.

    Args:
        values: 1-D NumPy array of normalised gain values in [0, 1].

    Returns:
        2-D NumPy array of shape (N, 3) with columns [R, G, B] in [0, 1].
    """
    v = np.clip(values, 0.0, 1.0)
    r = np.interp(v, _STOPS, _R)
    g = np.interp(v, _STOPS, _G)
    b = np.interp(v, _STOPS, _B)
    return np.column_stack([r, g, b])
