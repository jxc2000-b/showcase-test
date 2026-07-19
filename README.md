# Trying to recreate something I saw on twatter with Kimi

A Django mock-up of a portfolio concept (see `inspo/`): a pixelated human
silhouette on a hero page. The silhouette comes from `silhouette_custom.json`
(fine-tuned in the pixel editor; falls back to a 1:1 extraction of
`inspo/accurate.png`). Nervous/circulatory overlay layers exist
(`core/pixelart.py`, procedural) but are parked until hand-drawn replacements
are finished in the layer editor.

Also included: a pixel **editor** at `/editor/` (paint/erase/undo, autosave,
save-to-server) for fine-tuning the silhouette, an anatomy **layer editor**
at `/editor/layer/` (locked silhouette backdrop; paint nervous/circulatory
inside the body; saves `layer_<name>.json`), plus throwaway test renders at
`/ascii/` and `/accurate/`.

## Run it

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python manage.py runserver
```

Then open http://127.0.0.1:8000/

## Tests

```bash
.venv/bin/python manage.py test
```

## Layout

- `config/` — Django project settings/urls
- `core/custom_silhouette.py` — reads the fine-tuned silhouette_custom.json (fallback: PNG grid)
- `core/png_silhouette.py` — 1:1 grid extraction from inspo/accurate.png (96×144)
- `core/ascii_silhouette.py` — loader for the test_ascii.txt experiment
- `core/pixelart.py` — procedural art generator (parked anatomy layers)
- `core/views.py` — routes: `/`, `/editor/`, `/editor/save/`, `/editor/layer/`, `/editor/layer/save/`, `/ascii/`, `/accurate/`
- `core/templates/core/` — index, editor, layer editor, ascii/accurate test pages
- `core/static/core/` — CSS and the canvas renderer / toggle logic
