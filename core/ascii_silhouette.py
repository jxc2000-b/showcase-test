"""Load the hand-drawn ASCII silhouette (test_ascii.txt).

The file is a 100x50 character grid: ``@`` = body pixel, space = empty.
It is converted to the same rows format every other layer in this project
uses (list of ``#`` / ``.`` strings).
"""

from __future__ import annotations

from pathlib import Path

ASCII_PATH = Path(__file__).resolve().parent.parent / "test_ascii.txt"

GRID_WIDTH = 100
GRID_HEIGHT = 50


def build_grid() -> list[str]:
    lines = ASCII_PATH.read_text().splitlines()
    if len(lines) != GRID_HEIGHT:
        raise ValueError(f"expected {GRID_HEIGHT} lines, got {len(lines)}")
    rows = []
    for line in lines:
        padded = line.ljust(GRID_WIDTH)
        if len(padded) != GRID_WIDTH:
            raise ValueError(f"line wider than {GRID_WIDTH} chars: {line!r}")
        rows.append("".join("#" if ch == "@" else "." for ch in padded))
    return rows


GRID = build_grid()
