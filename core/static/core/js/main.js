/* Pixel-anatomy portfolio: render grid layers onto stacked canvases and
 * toggle their visibility from the [data-layer] controls. */

(function () {
  "use strict";

  var COLORS = {
    silhouette: "#0c0c0e",
    nervous: "#2d4ada",
    circulatory: "#e23a3a",
    skeletal: "#ffffff",
  };

  var layers = JSON.parse(document.getElementById("layers-data").textContent);

  // draw each layer onto its canvas (canvases may be absent while a
  // layer is parked; grids may differ in size, so scale is per-layer)
  Object.keys(layers).forEach(function (name) {
    var canvas = document.getElementById("layer-" + name);
    if (!canvas) return;

    var rows = layers[name];
    var h = rows.length;
    var w = rows[0].length;
    var scale = Math.max(1, Math.round(480 / w));

    canvas.width = w * scale;
    canvas.height = h * scale;

    var ctx = canvas.getContext("2d");
    ctx.fillStyle = COLORS[name] || "#0c0c0e";
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (rows[y][x] === "#") {
          ctx.fillRect(x * scale, y * scale, scale, scale);
        }
      }
    }
  });

  // exclusive toggle: clicking a button shows only that layer, and clicking
  // the active button again returns to the bare silhouette (never stacked)
  function setActive(name) {
    document.querySelectorAll("[data-layer]").forEach(function (el) {
      var on = el.dataset.layer === name;
      el.classList.toggle("active", on);
      if (el.tagName === "BUTTON") {
        el.setAttribute("aria-pressed", on ? "true" : "false");
      }
    });
  }

  document.querySelectorAll("button[data-layer]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setActive(btn.classList.contains("active") ? null : btn.dataset.layer);
    });
  });
})();
