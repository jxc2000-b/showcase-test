"""Load the hand-drawn BMP silhouette outline and derive render grids.

``test_sil2.bmp`` is a sparse dotted outline (lit pixels on black) of a
side-profile bust. Two grids are produced, cropped to the outline's
bounding box and downsampled to a pixel-art-friendly height:

- ``raw``    : the outline as drawn
- ``filled`` : solid silhouette, derived by filling each row between the
               leftmost and rightmost lit pixel found in a vertical window
               around it (bridges the gaps in the dotted contour), then
               downsampling by block majority
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

BMP_PATH = Path(__file__).resolve().parent.parent / "test_sil2.bmp"

BRIGHTNESS_THRESHOLD = 60   # sum of RGB above which a pixel counts as lit
GRID_HEIGHT = 128           # output grid rows
FILL_MAJORITY = 0.45        # block coverage needed for a filled cell
DESPECKLE_RADIUS = 8        # lit pixels with no neighbour this close are noise
FILL_WINDOW = 24            # half-height of the scanline window (native px)


def _load_native() -> tuple[list[list[bool]], int, int]:
    """Return (rows of bools, width, height) cropped to the lit bbox."""
    im = Image.open(BMP_PATH).convert("RGB")
    w, h = im.size
    px = im.load()

    lit: set[tuple[int, int]] = set()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if r + g + b > BRIGHTNESS_THRESHOLD:
                lit.add((x, y))

    # despeckle: drop isolated dots far from any other lit pixel
    lit = {
        (x, y)
        for x, y in lit
        if any(
            (ox, oy) in lit
            for oy in range(y - DESPECKLE_RADIUS, y + DESPECKLE_RADIUS + 1)
            for ox in range(x - DESPECKLE_RADIUS, x + DESPECKLE_RADIUS + 1)
            if (ox, oy) != (x, y)
        )
    }

    xs = [p[0] for p in lit]
    ys = [p[1] for p in lit]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)

    cw, ch = x1 - x0 + 1, y1 - y0 + 1
    grid = [[False] * cw for _ in range(ch)]
    for x, y in lit:
        grid[y - y0][x - x0] = True
    return grid, cw, ch


def _row_fill(grid: list[list[bool]], w: int, h: int) -> list[list[bool]]:
    """Fill each row between the extreme lit pixels found in a vertical
    window around it.

    The outline is dotted, so most rows have lit pixels on only one side
    (or none). Taking min/max over a window of neighbouring rows bridges
    the gaps; it also avoids bogus spans from rows whose dots all sit on
    the same side of the contour.
    """
    mins = [min((x for x in range(w) if grid[y][x]), default=None) for y in range(h)]
    maxs = [max((x for x in range(w) if grid[y][x]), default=None) for y in range(h)]

    filled = [row[:] for row in grid]
    for y in range(h):
        lo = hi = None
        for wy in range(max(0, y - FILL_WINDOW), min(h, y + FILL_WINDOW + 1)):
            if mins[wy] is None:
                continue
            lo = mins[wy] if lo is None else min(lo, mins[wy])
            hi = maxs[wy] if hi is None else max(hi, maxs[wy])
        if lo is not None and hi > lo:
            for x in range(lo, hi + 1):
                filled[y][x] = True
    return filled


def _downsample(grid: list[list[bool]], w: int, h: int,
                majority: float | None) -> list[str]:
    """Shrink to GRID_HEIGHT rows.

    ``majority=None`` keeps a cell lit if *any* source pixel is lit
    (preserves thin outlines); otherwise a fraction threshold is used.
    """
    scale = h / GRID_HEIGHT
    dw = max(1, round(w / scale))
    rows: list[str] = []
    for dy in range(GRID_HEIGHT):
        sy0 = int(dy * scale)
        sy1 = max(sy0 + 1, int((dy + 1) * scale))
        out = []
        for dx in range(dw):
            sx0 = int(dx * scale)
            sx1 = max(sx0 + 1, int((dx + 1) * scale))
            total = (sy1 - sy0) * (sx1 - sx0)
            lit = sum(
                1
                for sy in range(sy0, min(sy1, h))
                for sx in range(sx0, min(sx1, w))
                if grid[sy][sx]
            )
            keep = lit >= 1 if majority is None else lit / total >= majority
            out.append("#" if keep else ".")
        rows.append("".join(out))
    return rows


def build_grids() -> dict[str, list[str]]:
    grid, w, h = _load_native()
    filled = _row_fill(grid, w, h)
    return {
        "raw": _downsample(grid, w, h, majority=None),
        "filled": _downsample(filled, w, h, majority=FILL_MAJORITY),
    }


GRIDS = build_grids()
