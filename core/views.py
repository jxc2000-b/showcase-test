# The site's request handlers: each function below answers one web address
# (the homepage, the two editors, the "save" buttons, and the test pages)
# and decides what to send back to the visitor's browser.

import json
import mimetypes

from django.conf import settings
from django.http import FileResponse, Http404, JsonResponse
from django.shortcuts import render
from django.urls import reverse
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
        'mirage_slots': _mirage_slots(),
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

# The ambient "mirage" page: each button fades one of these images across the
# whole viewport at low opacity. Files live in core/images/ (not a static dir),
# so they are streamed by background_image below rather than collected.
IMAGES_DIR = settings.BASE_DIR / 'core' / 'images'
# The pool of ambient background images, in a stable order; a URL identifies
# an image by its index into this tuple. Add files here to grow the pool.
BACKGROUND_IMAGE_FILES = (
    'AAAAHHHH.jpeg', 'cutepatootie.jpg', 'fih.jpeg',
    'hi.jpeg', 'irrelevant.jpeg', 'mewhen.jpeg',
    'pygmy.jpg', 'sad.png', 'the_left_has_no_response.jpeg',
)

# Homepage: each keyword layer owns its own three pool images, shown in a
# fixed 3x3 background grid so toggling a layer never reshapes the grid.
KEYWORD_IMAGE_SETS = {
    'nervous': (0, 1, 2),
    'skeletal': (3, 4, 5),
    'circulatory': (6, 7, 8),
}

# The nine slots of that fixed grid (row-major, 0-8). Each keyword owns three,
# spread one per row and column, so a single active keyword dusts the whole
# field rather than filling one solid band. Every slot is claimed exactly once.
KEYWORD_SLOTS = {
    'nervous':     (0, 4, 8),
    'skeletal':    (1, 5, 6),
    'circulatory': (2, 3, 7),
}

# The /background/ page: each button (key) reveals its own three pool images.
BACKGROUND_GRIDS = (
    {'key': 'drift', 'label': 'drift', 'cells': (0, 1, 2)},
    {'key': 'veil', 'label': 'veil', 'cells': (3, 4, 5)},
    {'key': 'bloom', 'label': 'bloom', 'cells': (6, 7, 8)},
)

# Pool files ending in these render as autoplaying <video> cells instead of
# <img>; anything else (jpeg/jpg/png/gif) stays an <img>. Mixing is fine.
VIDEO_EXTS = ('.webm', '.mp4')
# Pin the video mime types so streaming works even where the host's mime
# registry is bare (FileResponse infers Content-Type from the file name).
mimetypes.add_type('video/webm', '.webm')
mimetypes.add_type('video/mp4', '.mp4')


def _is_video(filename):
    return filename.lower().endswith(VIDEO_EXTS)


def _media_cell(idx):
    """A single grid cell: its stream URL and whether it is a video."""
    return {
        'url': reverse('background-image', args=[idx]),
        'video': _is_video(BACKGROUND_IMAGE_FILES[idx]),
    }


def _mirage_slots():
    """The homepage's fixed 3x3 background grid as an ordered list of nine
    slots. Each slot names the keyword layer that fills it plus its media cell;
    toggling a layer fades its slots in and out in place."""
    placed = {}
    for layer, positions in KEYWORD_SLOTS.items():
        for position, img_idx in zip(positions, KEYWORD_IMAGE_SETS[layer]):
            placed[position] = dict(_media_cell(img_idx), layer=layer)
    return [placed[i] for i in range(len(placed))]


@require_GET
def background(request):
    """Ambient 'mirage' page: three buttons, each fading in a 3-image grid."""
    grids = [
        {'key': g['key'], 'label': g['label'],
         'cells': [_media_cell(i) for i in g['cells']]}
        for g in BACKGROUND_GRIDS
    ]
    return render(request, 'core/background.html', {
        'grids': grids,
    })


@require_GET
def background_image(request, idx):
    """Stream one pool item by index; whitelisted, no arbitrary file access.
    Content type is inferred from the file name (jpeg / jpg / png / webm /
    mp4 / gif)."""
    if not 0 <= idx < len(BACKGROUND_IMAGE_FILES):
        raise Http404('unknown image')
    return FileResponse(open(IMAGES_DIR / BACKGROUND_IMAGE_FILES[idx], 'rb'))