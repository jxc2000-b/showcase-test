"""Load the scale-accurate PNG silhouette (inspo/accurate.png).

The PNG is 768x1152, a mathematically exact 8x nearest-neighbour upscale
of a 96x144 pixel grid (every 8x8 block is a single uniform colour — no
resampling artefacts). So this is a direct 1:1 pixel read: dark block ->
``#``, light block -> ``.``. Output is the standard rows format.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

PNG_PATH = Path(__file__).resolve().parent.parent / "inspo" / "accurate.png"

GRID_WIDTH = 96
GRID_HEIGHT = 144
BLOCK = 8                     # source pixels per grid cell
DARK_THRESHOLD = 384          # r+g+b below this counts as body


def build_grid() -> list[str]:
    im = Image.open(PNG_PATH).convert("RGB")
    if im.size != (GRID_WIDTH * BLOCK, GRID_HEIGHT * BLOCK):
        raise ValueError(f"unexpected PNG size: {im.size}")
    px = im.load()
    rows = []
    for cy in range(GRID_HEIGHT):
        row = []
        for cx in range(GRID_WIDTH):
            r, g, b = px[cx * BLOCK, cy * BLOCK]
            row.append("#" if r + g + b < DARK_THRESHOLD else ".")
        rows.append("".join(row))
    return rows


GRID = build_grid()
