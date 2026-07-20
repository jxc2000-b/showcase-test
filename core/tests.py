import json
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.test import SimpleTestCase

from .custom_silhouette import get_grid
from .pixelart import HEIGHT, LAYERS, WIDTH
from .ascii_silhouette import GRID as ASCII_GRID
from .png_silhouette import GRID as PNG_GRID


def pixels(rows):
    return {
        (x, y)
        for y, row in enumerate(rows)
        for x, ch in enumerate(row)
        if ch == "#"
    }


class PixelArtTests(SimpleTestCase):
    def test_grid_dimensions(self):
        for rows in LAYERS.values():
            self.assertEqual(len(rows), HEIGHT)
            for row in rows:
                self.assertEqual(len(row), WIDTH)

    def test_layers_are_nonempty(self):
        for name, rows in LAYERS.items():
            with self.subTest(layer=name):
                self.assertTrue(pixels(rows))

    def test_overlays_stay_inside_silhouette(self):
        sil = pixels(LAYERS["silhouette"])
        for name in ("nervous", "circulatory"):
            with self.subTest(layer=name):
                self.assertLessEqual(pixels(LAYERS[name]), sil)

    def test_index_renders(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "layer-silhouette")
        self.assertContains(response, "layers-data")

    def test_index_includes_anatomy_layers(self):
        response = self.client.get("/")
        layers = response.context["layers"]
        self.assertEqual(layers["silhouette"], get_grid())
        for name in ("nervous", "circulatory", "skeletal"):
            with self.subTest(layer=name):
                self.assertIn(name, layers)
                self.assertContains(response, f'data-layer="{name}"')

    def test_index_serves_two_tone_skeletal(self):
        rows = ["#" + "." * 94 + "B"] + ["." * 96] * 143
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "layer_skeletal.json"
            path.write_text(json.dumps({"width": 96, "height": 144, "rows": rows}))
            with patch("core.views.LAYER_SAVE_DIR", Path(tmp)):
                response = self.client.get("/")
        self.assertEqual(response.context["layers"]["skeletal"], rows)


class EditorTests(SimpleTestCase):
    def test_editor_page_renders(self):
        response = self.client.get("/editor/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'id="board"')
        self.assertContains(response, "generated-silhouette")
        self.assertIn("csrftoken", response.cookies)
        self.assertEqual(response.context["generated_silhouette"], get_grid())

    def test_save_writes_grid_file(self):
        rows = ["#" + "." * 95] + ["." * 96] * 143
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "out.json"
            with patch("core.views.SILHOUETTE_SAVE_PATH", target):
                response = self.client.post(
                    "/editor/save/",
                    data=json.dumps({"rows": rows}),
                    content_type="application/json",
                )
            self.assertEqual(response.status_code, 200)
            saved = json.loads(target.read_text())
            self.assertEqual(saved["width"], 96)
            self.assertEqual(saved["height"], 144)
            self.assertEqual(saved["rows"], rows)

    def test_save_rejects_malformed_rows(self):
        bad = ["##xx" + "." * 92] * 128
        response = self.client.post(
            "/editor/save/",
            data=json.dumps({"rows": bad}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_save_rejects_ragged_rows(self):
        ragged = ["." * 96, "." * 40]
        response = self.client.post(
            "/editor/save/",
            data=json.dumps({"rows": ragged}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_save_get_not_allowed(self):
        response = self.client.get("/editor/save/")
        self.assertEqual(response.status_code, 405)


class LayerEditorTests(SimpleTestCase):
    def test_layer_editor_renders(self):
        response = self.client.get("/editor/layer/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'id="board"')
        self.assertContains(response, "generated-silhouette")
        self.assertContains(response, "saved-layers")
        self.assertIn("csrftoken", response.cookies)
        self.assertEqual(response.context["generated_silhouette"], get_grid())

    def test_save_layer_writes_file(self):
        rows = ["." * 96] * 143 + ["#" * 96]
        with tempfile.TemporaryDirectory() as tmp:
            with patch("core.views.LAYER_SAVE_DIR", Path(tmp)):
                response = self.client.post(
                    "/editor/layer/save/",
                    data=json.dumps({"name": "nervous", "rows": rows}),
                    content_type="application/json",
                )
                self.assertEqual(response.status_code, 200)
                saved = json.loads((Path(tmp) / "layer_nervous.json").read_text())
                self.assertEqual(saved["rows"], rows)

    def test_save_skeletal_accepts_two_tone_rows(self):
        rows = ["#" + "." * 94 + "B"] + ["." * 96] * 143
        with tempfile.TemporaryDirectory() as tmp:
            with patch("core.views.LAYER_SAVE_DIR", Path(tmp)):
                response = self.client.post(
                    "/editor/layer/save/",
                    data=json.dumps({"name": "skeletal", "rows": rows}),
                    content_type="application/json",
                )
                self.assertEqual(response.status_code, 200)
                saved = json.loads((Path(tmp) / "layer_skeletal.json").read_text())
                self.assertEqual(saved["rows"], rows)

    def test_save_layer_rejects_black_detail_outside_skeletal(self):
        rows = ["B" + "." * 95] * 144
        response = self.client.post(
            "/editor/layer/save/",
            data=json.dumps({"name": "nervous", "rows": rows}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_save_layer_rejects_unknown_name(self):
        response = self.client.post(
            "/editor/layer/save/",
            data=json.dumps({"name": "muscular", "rows": ["." * 96] * 144}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_save_layer_rejects_malformed_rows(self):
        response = self.client.post(
            "/editor/layer/save/",
            data=json.dumps({"name": "circulatory", "rows": ["bad!!"]}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_save_layer_get_not_allowed(self):
        response = self.client.get("/editor/layer/save/")
        self.assertEqual(response.status_code, 405)


class CustomSilhouetteTests(SimpleTestCase):
    def test_get_grid_returns_valid_96x144(self):
        rows = get_grid()
        self.assertEqual(len(rows), 144)
        for row in rows:
            self.assertEqual(len(row), 96)
            self.assertLessEqual(set(row), set("#."))

    def test_get_grid_falls_back_to_png(self):
        with patch("core.custom_silhouette.CUSTOM_PATH", Path("/nonexistent.json")):
            self.assertEqual(get_grid(), PNG_GRID)


class AsciiSilhouetteTests(SimpleTestCase):
    def test_grid_is_100x50(self):
        self.assertEqual(len(ASCII_GRID), 50)
        for row in ASCII_GRID:
            self.assertEqual(len(row), 100)
            self.assertLessEqual(set(row), set("#."))

    def test_grid_has_body_pixels(self):
        self.assertTrue(any("#" in row for row in ASCII_GRID))

    def test_ascii_page_renders(self):
        response = self.client.get("/ascii/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'id="board"')
        self.assertContains(response, "ascii-grid")


class PngSilhouetteTests(SimpleTestCase):
    def test_grid_is_96x144(self):
        self.assertEqual(len(PNG_GRID), 144)
        for row in PNG_GRID:
            self.assertEqual(len(row), 96)
            self.assertLessEqual(set(row), set("#."))

    def test_grid_has_body_pixels(self):
        self.assertTrue(any("#" in row for row in PNG_GRID))

    def test_accurate_page_renders(self):
        response = self.client.get("/accurate/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'id="board"')
        self.assertContains(response, "96×144")
