"""Load the fine-tuned silhouette saved from the pixel editor.

The editor's "Save to server" writes ``silhouette_custom.json`` to the repo
root. ``get_grid()`` reads it fresh on every call (so a save from the editor
shows up on the next page load) and falls back to the grid extracted from
``inspo/accurate.png`` if the file is missing or malformed.
"""

from __future__ import annotations

import json
from pathlib import Path

from .png_silhouette import GRID as PNG_GRID, GRID_HEIGHT, GRID_WIDTH

CUSTOM_PATH = Path(__file__).resolve().parent.parent / "silhouette_custom.json"


def _valid(rows) -> bool:
    return (
        isinstance(rows, list)
        and len(rows) == GRID_HEIGHT
        and all(
            isinstance(r, str) and len(r) == GRID_WIDTH and set(r) <= {"#", "."}
            for r in rows
        )
    )


def get_grid() -> list[str]:
    try:
        rows = json.loads(CUSTOM_PATH.read_text())["rows"]
        if _valid(rows):
            return rows
    except (OSError, ValueError, KeyError):
        pass
    return PNG_GRID
