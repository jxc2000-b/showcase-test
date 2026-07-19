"""Procedural pixel-art generator.

Builds three aligned pixel grids (all clipped to the silhouette mask):

- ``silhouette``  : black bust of a man (front-facing, head + shoulders)
- ``nervous``     : brain, spinal cord and branching nerves
- ``circulatory`` : heart, aorta, carotid arteries and arm vessels

Everything is deterministic (fixed RNG seed) so the art is stable across
requests. Each layer is returned as a list of strings of ``#`` / ``.``.
"""

from __future__ import annotations

import math
import random

WIDTH = 48
HEIGHT = 64

SEED = 7


# ---------------------------------------------------------------------------
# raster helpers
# ---------------------------------------------------------------------------

def _ellipse(mask: set[tuple[int, int]], cx: float, cy: float, rx: float, ry: float,
             skip=None) -> None:
    """Add a filled ellipse to ``mask``. ``skip(x, y)`` may veto a pixel."""
    for y in range(math.floor(cy - ry), math.ceil(cy + ry) + 1):
        for x in range(math.floor(cx - rx), math.ceil(cx + rx) + 1):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                if skip is None or not skip(x, y):
                    mask.add((x, y))


def _line(mask: set[tuple[int, int]], x0: float, y0: float, x1: float, y1: float,
          width: int = 1) -> None:
    """Rasterize a straight segment (linear interpolation)."""
    steps = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
    half = width // 2
    for i in range(steps + 1):
        t = i / steps
        x = round(x0 + (x1 - x0) * t)
        y = round(y0 + (y1 - y0) * t)
        for dx in range(-half, half + 1):
            for dy in range(-half, half + 1):
                mask.add((x + dx, y + dy))


def _polyline(mask: set[tuple[int, int]], pts: list[tuple[float, float]],
              width: int = 1) -> None:
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        _line(mask, x0, y0, x1, y1, width)


def _bezier(mask: set[tuple[int, int]], p0, p1, p2, width: int = 1,
            samples: int = 60) -> None:
    """Rasterize a quadratic bezier curve."""
    pts = []
    for i in range(samples + 1):
        t = i / samples
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1]
        pts.append((x, y))
    _polyline(mask, pts, width)


# ---------------------------------------------------------------------------
# layers
# ---------------------------------------------------------------------------

def _silhouette() -> set[tuple[int, int]]:
    m: set[tuple[int, int]] = set()

    # head
    _ellipse(m, cx=24, cy=15, rx=10, ry=12)

    # drop the sliver rows at the very top of the skull ("chimney" pixels)
    for y in range(0, 6):
        row = [x for x in range(WIDTH) if (x, y) in m]
        if row and len(row) <= 2:
            for x in row:
                m.discard((x, y))

    # neck
    for y in range(25, 34):
        for x in range(19, 30):
            m.add((x, y))

    # shoulders / torso: trapezoid widening towards the hem
    top_y, bot_y = 32, HEIGHT - 1
    for y in range(top_y, bot_y + 1):
        t = (y - top_y) / (bot_y - top_y)
        half = 10 + 14 * (t ** 0.9)
        for x in range(math.ceil(24 - half), math.floor(24 + half) + 1):
            m.add((x, y))

    # soften the shoulder corners by trimming the outer top corner pixels
    for y in range(32, 37):
        t = (y - top_y) / (bot_y - top_y)
        half = 10 + 14 * (t ** 0.9)
        trim = (37 - y) // 2
        for i in range(trim):
            m.discard((math.ceil(24 - half) + i, y))
            m.discard((math.floor(24 + half) - i, y))

    return m


def _nervous(sil: set[tuple[int, int]]) -> set[tuple[int, int]]:
    rng = random.Random(SEED)
    m: set[tuple[int, int]] = set()

    # brain: dense stippled blob with a solid border ring
    brain = set()
    _ellipse(brain, cx=24, cy=12, rx=7, ry=6)
    for (x, y) in brain:
        on_border = ((x + 1, y) not in brain or (x - 1, y) not in brain
                     or (x, y + 1) not in brain or (x, y - 1) not in brain)
        if on_border or rng.random() < 0.85:
            m.add((x, y))

    # brainstem
    for y in range(17, 23):
        m.add((23, y))
        m.add((24, y))

    # spinal cord
    for y in range(22, 44):
        m.add((23, y))
        m.add((24, y))

    # branching nerves: seeded random walks off the cord; each step is
    # connected to the previous one with a line so trails never break up.
    # walks arc gently downwards as they travel, like cascading nerves
    def walk(x: float, y: float, dx: float, dy: float, length: int, depth: int):
        px, py = round(x), round(y)
        for _ in range(length):
            dy = min(dy + 0.04, 0.9)
            x += dx + rng.uniform(-0.25, 0.25)
            y += dy + rng.uniform(-0.15, 0.20)
            nx, ny = round(x), round(y)
            if (nx, ny) not in sil:
                return
            _line(m, px, py, nx, ny)
            px, py = nx, ny
            if depth < 2 and rng.random() < 0.15:
                sign = 1 if dx >= 0 else -1
                walk(x, y, sign * rng.uniform(0.5, 1.0), rng.uniform(0.0, 0.6),
                     rng.randint(4, 8), depth + 1)

    for side in (-1, 1):
        for y0 in range(28, 44, 3):
            walk(23.5, y0, side * rng.uniform(0.7, 1.1), rng.uniform(0.05, 0.35),
                 rng.randint(9, 15), 0)

    # two long nerves running from the cord down into the lower torso
    for side in (-1, 1):
        walk(23.5, 43, side * 0.55, 1.0, 26, 1)

    return m & sil


def _circulatory(sil: set[tuple[int, int]]) -> set[tuple[int, int]]:
    rng = random.Random(SEED + 1)
    m: set[tuple[int, int]] = set()

    # heart: dense blob left of centre
    heart = set()
    _ellipse(heart, cx=19, cy=48, rx=4, ry=5)
    for (x, y) in heart:
        if rng.random() < 0.95:
            m.add((x, y))

    # ascending aorta out of the heart, arching over, then descending
    _line(m, 21, 45, 23, 34, width=2)
    _bezier(m, (23, 34), (23, 28), (18, 32), width=2)
    _line(m, 18, 32, 19, 61, width=2)

    # carotid arteries branching off the aorta, up the neck, forking
    # into the skull
    for base_x, drift in ((22, -1), (25, 1)):
        _line(m, base_x, 33, base_x + drift, 22)
        tips = ((base_x + drift * 4, 13), (base_x + drift, 11),
                (base_x - drift * 2, 15))
        for tx, ty in tips:
            _bezier(m, (base_x + drift, 22),
                    (base_x + drift * 2, 17), (tx, ty))

    # subclavian / arm vessels sweeping over the shoulders
    _bezier(m, (20, 34), (12, 33), (8, 44))
    _line(m, 8, 44, 6, 62)
    _bezier(m, (26, 34), (35, 33), (40, 44))
    _line(m, 40, 44, 42, 62)

    # a few small branches off the descending aorta
    for y0 in range(40, 58, 6):
        side = -1 if (y0 // 6) % 2 else 1
        _line(m, 19, y0, 19 + side * rng.randint(4, 7), y0 + rng.randint(3, 5))

    return m & sil


# ---------------------------------------------------------------------------
# public API
# ---------------------------------------------------------------------------

def _to_rows(mask: set[tuple[int, int]]) -> list[str]:
    return [
        "".join("#" if (x, y) in mask else "." for x in range(WIDTH))
        for y in range(HEIGHT)
    ]


def build_layers() -> dict[str, list[str]]:
    """Return ``{layer_name: [row_strings]}`` for all three layers."""
    sil = _silhouette()
    return {
        "silhouette": _to_rows(sil),
        "nervous": _to_rows(_nervous(sil)),
        "circulatory": _to_rows(_circulatory(sil)),
    }


LAYERS = build_layers()
