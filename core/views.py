# The site's request handlers: each function below answers one web address
# (the homepage, the two editors, the "save" buttons, and the test pages)
# and decides what to send back to the visitor's browser.

import json

from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from .ascii_silhouette import GRID as ASCII_GRID
from .custom_silhouette import get_grid
from .png_silhouette import GRID as PNG_GRID

# Size of the pixel grid both editors draw on.
EDITOR_WIDTH = 96
EDITOR_HEIGHT = 144   # exactly 2:3, per design requirement

# Where the editors' finished artwork is stored on the server's disk.
SILHOUETTE_SAVE_PATH = settings.BASE_DIR / 'silhouette_custom.json'
LAYER_SAVE_DIR = settings.BASE_DIR
# The only anatomy layers the layer editor is allowed to save.
LAYER_NAMES = frozenset({'nervous', 'circulatory', 'skeletal'})

# Ground rules for an acceptable grid: cells are only ever '#' (body) or
# '.' (empty), and the grid may not be huge. The skeletal layer is the one
# exception: it is two-tone, so it may also contain 'B' (black detail).
_VALID_CHARS = frozenset('#.')
_TWO_TONE_CHARS = frozenset('#.B')
_MAX_DIM = 512


def _layer_chars(name):
    """Characters allowed in a layer grid: skeletal is two-tone ('#'
    white bone, 'B' black detail); the other layers are '#' only."""
    return _TWO_TONE_CHARS if name == 'skeletal' else _VALID_CHARS


def _rows_valid(rows, valid_chars=_VALID_CHARS) -> bool:
    return (
        isinstance(rows, list)
        and rows
        and len(rows) <= _MAX_DIM
        and all(isinstance(r, str) for r in rows)
        and len({len(r) for r in rows}) == 1
        and len(rows[0]) <= _MAX_DIM
        and all(set(r) <= valid_chars for r in rows)
    )


def _write_grid(path, rows):
    data = {'width': len(rows[0]), 'height': len(rows), 'rows': rows}
    path.write_text(json.dumps(data, indent=2) + '\n')
    return sum(r.count('#') for r in rows)


def _read_grid(path, valid_chars=_VALID_CHARS):
    try:
        rows = json.loads(path.read_text())['rows']
        return rows if _rows_valid(rows, valid_chars) else None
    except (OSError, ValueError, KeyError):
        return None


def index(request):
    # the silhouette plus whichever hand-drawn anatomy layers are on disk
    layers = {'silhouette': get_grid()}
    for name in sorted(LAYER_NAMES):
        rows = _read_grid(LAYER_SAVE_DIR / f'layer_{name}.json', _layer_chars(name))
        if rows is not None:
            layers[name] = rows
    return render(request, 'core/index.html', {
        'layers': layers,
    })


@ensure_csrf_cookie
@require_GET
def editor(request):
    """Self-contained pixel editor test page (silhouette fine-tuning)."""
    return render(request, 'core/editor.html', {
        'width': EDITOR_WIDTH,
        'height': EDITOR_HEIGHT,
        'generated_silhouette': get_grid(),
    })


@ensure_csrf_cookie
@require_GET
def layer_editor(request):
    """Anatomy-layer editor: the silhouette is a locked backdrop, the user
    paints the nervous / circulatory layers on top of it."""
    return render(request, 'core/layer_editor.html', {
        'width': EDITOR_WIDTH,
        'height': EDITOR_HEIGHT,
        'generated_silhouette': get_grid(),
        'saved_layers': {
            name: _read_grid(
                LAYER_SAVE_DIR / f'layer_{name}.json', _layer_chars(name)
            )
            for name in sorted(LAYER_NAMES)
        },
    })


@require_POST
def save_silhouette(request):
    """Persist an edited grid to disk in the same rows format the canvas
    renderer consumes (list of ``#`` / ``.`` strings)."""
    try:
        rows = json.loads(request.body)['rows']
    except (ValueError, KeyError):
        return JsonResponse({'ok': False, 'error': 'invalid JSON payload'}, status=400)

    if not _rows_valid(rows):
        return JsonResponse({'ok': False, 'error': 'rows must be an even grid of "#"/"."'}, status=400)

    lit = _write_grid(SILHOUETTE_SAVE_PATH, rows)
    return JsonResponse({'ok': True, 'path': str(SILHOUETTE_SAVE_PATH), 'lit': lit})


@require_POST
def save_layer(request):
    """Persist one anatomy layer (``layer_<name>.json`` in the repo root)."""
    try:
        payload = json.loads(request.body)
        name = payload['name']
        rows = payload['rows']
    except (ValueError, KeyError):
        return JsonResponse({'ok': False, 'error': 'invalid JSON payload'}, status=400)

    if name not in LAYER_NAMES:
        return JsonResponse({'ok': False, 'error': f'name must be one of {sorted(LAYER_NAMES)}'}, status=400)
    chars = _layer_chars(name)
    if not _rows_valid(rows, chars):
        return JsonResponse({'ok': False, 'error': 'rows must be an even grid of "#"/"."'}, status=400)

    path = LAYER_SAVE_DIR / f'layer_{name}.json'
    lit = _write_grid(path, rows)
    return JsonResponse({'ok': True, 'path': str(path), 'lit': lit})


@require_GET
def ascii_test(request):
    """Minimal test page rendering the hand-drawn ASCII silhouette."""
    return render(request, 'core/ascii.html', {
        'grid': ASCII_GRID,
        'label': 'ASCII silhouette · 100×50 · test area',
    })


@require_GET
def accurate_test(request):
    """Minimal test page rendering the scale-accurate PNG silhouette."""
    return render(request, 'core/ascii.html', {
        'grid': PNG_GRID,
        'label': 'PNG silhouette · 96×144 · test area',
    })
