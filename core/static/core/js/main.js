/* main.js — homepage (/): render the grid layers onto stacked canvases and
 * toggle them from the [data-layer] keywords dimmed inside the prose.
 * Switching a layer on plays a slow themed pixel reveal with a shimmering
 * edge (skeletal rises from the feet up to the skull, nervous floods down
 * from the brain, circulatory pulses out from the heart); switching it off dissolves the
 * pixels back out. Layers combine freely and always stack in the fixed
 * canvas order (skeletal over circulatory over nervous over the
 * silhouette). Reduced-motion users get the plain CSS fade instead. */

(function () {
  "use strict";

  // paint colour per grid character; skeletal is two-tone and its colours
  // draw in order, so the black detail ('B') overprints the white bone ('#')
  var COLORS = {
    silhouette: { "#": "#0c0c0e" },
    nervous: { "#": "#2d4ada" },
    circulatory: { "#": "#e23a3a" },
    skeletal: { "#": "#ffffff", B: "#0c0c0e" },
  };

  var REVEAL_MS = 1500;   // switch-on: the slow themed reveal
  var HIDE_MS = 900;      // switch-off: pixels dissolve back out
  var SOFT_PX = 40;       // width of the shimmering edge, in sequence pixels
  // slight stagger, so layers switched on together assemble bottom-up
  var REVEAL_DELAY = { nervous: 0, circulatory: 200, skeletal: 400 };

  var ZOOM_VISIBLE = 1.5 / 3;   // portion of the figure kept on screen while zoomed
  var ZOOM_MIN = 1.2;         // least zoom allowed (small screens)
  var ZOOM_MAX = 3;           // most zoom allowed (tall screens)

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var layers = JSON.parse(document.getElementById("layers-data").textContent);

  // one entry per canvas: its pixels in reveal order, plus animation state
  var drawn = {};

  // ---------------------------------------------------------------- pixels

  function litPixels(rows) {
    var pts = [];
    for (var y = 0; y < rows.length; y++) {
      for (var x = 0; x < rows[y].length; x++) {
        if (rows[y][x] !== ".") pts.push({ x: x, y: y, ch: rows[y][x] });
      }
    }
    return pts;
  }

  // the layer's topmost pixel — the brain is the highest point of the
  // nervous system, so a flood from here pours downwards
  function topSeed(pts) {
    var minY = Infinity, sx = 0, n = 0;
    pts.forEach(function (p) {
      if (p.y < minY) { minY = p.y; sx = p.x; n = 1; }
      else if (p.y === minY) { sx += p.x; n += 1; }
    });
    return { x: sx / n, y: minY };
  }

  // the densest 5x5 neighbourhood — the heart is the big blob of the
  // circulatory system, so a pulse from here spreads along the vessels
  function densestSeed(pts) {
    var lit = {};
    pts.forEach(function (p) { lit[p.y * 1000 + p.x] = true; });
    var best = pts[0], bestScore = -1;
    pts.forEach(function (p) {
      var score = 0;
      for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
          if (lit[(p.y + dy) * 1000 + (p.x + dx)]) score += 1;
        }
      }
      if (score > bestScore) { bestScore = score; best = p; }
    });
    return best;
  }

  function distanceOrder(seed) {
    return function (a, b) {
      var da = (a.x - seed.x) * (a.x - seed.x) + (a.y - seed.y) * (a.y - seed.y);
      var db = (b.x - seed.x) * (b.x - seed.x) + (b.y - seed.y) * (b.y - seed.y);
      return da - db;
    };
  }

  // the reveal sequence for each layer, matching its anatomy
  function orderedPixels(name, pts) {
    if (name === "skeletal") {
      // from the ground up: feet first, skull last
      pts.sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    } else if (name === "nervous") {
      pts.sort(distanceOrder(topSeed(pts)));
    } else if (name === "circulatory") {
      pts.sort(distanceOrder(densestSeed(pts)));
    }
    return pts;
  }

  // ---------------------------------------------------------------- setup

  // register each layer's canvas (grids may differ in size, so the scale
  // is per-layer); the silhouette is always on, so show it in full now
  Object.keys(layers).forEach(function (name) {
    var canvas = document.getElementById("layer-" + name);
    if (!canvas) return;

    var rows = layers[name];
    var scale = Math.max(1, Math.round(480 / rows[0].length));

    canvas.width = rows[0].length * scale;
    canvas.height = rows.length * scale;

    drawn[name] = {
      name: name,
      canvas: canvas,
      ctx: canvas.getContext("2d"),
      scale: scale,
      pixels: orderedPixels(name, litPixels(rows)),
      progress: 0,   // 0 = nothing painted, 1 = fully revealed
      raf: 0,        // running animation frame
      timer: 0,      // pending animation start (stagger delay)
    };

    if (name === "silhouette") {
      drawn[name].progress = 1;
      render(drawn[name]);
    }
  });

  // ---------------------------------------------------------------- paint

  // draw the layer as it looks at the current progress: everything behind
  // the frontier is solid, the last SOFT_PX pixels shimmer in or out
  function render(layer) {
    var ctx = layer.ctx;
    ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    var n = layer.pixels.length;
    var frontier = layer.progress * (n + SOFT_PX);
    var colors = COLORS[layer.name] || COLORS.silhouette;
    var s = layer.scale;
    for (var i = 0; i < n; i++) {
      var a = (frontier - i) / SOFT_PX;
      if (a <= 0) break;
      var p = layer.pixels[i];
      ctx.globalAlpha = a < 1 ? a : 1;
      ctx.fillStyle = colors[p.ch];
      ctx.fillRect(p.x * s, p.y * s, s, s);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- animate

  function easeInOut(k) {
    return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  }
  function easeIn(k) { return k * k; }

  // pin the canvas element in place while the pixels animate (the pixel
  // sequence is the show; the CSS pop/transition would only get in the way)
  function pin(layer) {
    layer.canvas.style.transition = "none";
    layer.canvas.style.opacity = "1";
    layer.canvas.style.transform = "none";
  }

  // hand visibility back to the CSS classes
  function unpin(layer) {
    layer.canvas.style.transition = "";
    layer.canvas.style.opacity = "";
    layer.canvas.style.transform = "";
  }

  function cancel(layer) {
    if (layer.raf) cancelAnimationFrame(layer.raf);
    if (layer.timer) clearTimeout(layer.timer);
    layer.raf = 0;
    layer.timer = 0;
  }

  // animate progress towards 1 (reveal) or 0 (dissolve); reversing midway
  // just continues from the current progress, so toggling stays smooth
  function animateTo(layer, target, duration, delay) {
    cancel(layer);
    if (reduceMotion || layer.progress === target) {
      layer.progress = target;
      render(layer);
      unpin(layer);   // reduced motion: let the CSS fade handle it
      return;
    }
    pin(layer);
    layer.timer = setTimeout(function () {
      layer.timer = 0;
      var from = layer.progress;
      var ease = target === 1 ? easeInOut : easeIn;
      var t0 = null;
      var step = function (ts) {
        if (t0 === null) t0 = ts;
        var k = Math.min(1, (ts - t0) / duration);
        layer.progress = from + (target - from) * ease(k);
        render(layer);
        if (k < 1) {
          layer.raf = requestAnimationFrame(step);
        } else {
          layer.raf = 0;
          layer.progress = target;
          render(layer);
          unpin(layer);
        }
      };
      layer.raf = requestAnimationFrame(step);
    }, delay || 0);
  }

  function reveal(name) {
    if (drawn[name]) animateTo(drawn[name], 1, REVEAL_MS, REVEAL_DELAY[name] || 0);
  }

  function hide(name) {
    if (drawn[name]) animateTo(drawn[name], 0, HIDE_MS, 0);
  }

  // ---------------------------------------------------------------- zoom

  // one shared zoom level while ANY layer is on: the figure scales just
  // enough that its bottom third ends up below the viewport's bottom edge
  // (the .hero clips it); it only zooms back out once every layer is off
  var figure = document.querySelector(".figure");

  function targetScale() {
    // offsetTop/offsetHeight ignore CSS transforms, so measuring stays
    // correct even while a zoom transition is playing — every click lands
    // on the same scale, never a re-zoom. Tune via ZOOM_VISIBLE/MIN/MAX.
    // Phones (matching the 860px CSS breakpoint) zoom harder: a smaller
    // visible fraction plus a higher floor crop the figure in more.
    var mobile = window.matchMedia("(max-width: 860px)").matches;
    var visible = mobile ? 1 / 3 : ZOOM_VISIBLE;
    var min = mobile ? 2.2 : ZOOM_MIN;
    var max = mobile ? 4 : ZOOM_MAX;
    var top = figure.offsetTop - window.scrollY;
    var scale = (window.innerHeight - top) / (figure.offsetHeight * visible);
    return Math.min(Math.max(scale, min), max);
  }

  function updateZoom() {
    if (!figure) return;
    var anyOn = document.querySelector(".pixel-layer.active") !== null;
    figure.style.transform = anyOn ? "scale(" + targetScale() + ")" : "";
  }

  window.addEventListener("resize", function () {
    if (document.querySelector(".pixel-layer.active")) updateZoom();
  });

  // ------------------------------------------------------------- mirage bg

  // the background is a fixed 3x3 grid of image/video slots (rendered
  // server-side); each keyword layer owns three of them. Toggling a layer
  // fades its slots in or out in place — the grid shape never changes, so
  // nothing reflows. For <video> cells only the visible ones decode: play on
  // show, pause on hide (reduced-motion keeps them paused on their first frame).
  var mirageGrid = document.getElementById("mirage-grid");

  function setMirage(name, on) {
    if (!mirageGrid) return;
    mirageGrid
      .querySelectorAll('.mirage-cell[data-mirage="' + name + '"]')
      .forEach(function (cell) {
        cell.classList.toggle("show", on);
        if (cell.tagName === "VIDEO") {
          if (on && !reduceMotion) {
            var playing = cell.play();
            if (playing && playing.catch) playing.catch(function () {});
          } else {
            cell.pause();
          }
        }
      });
  }

  // ---------------------------------------------------------------- toggle

  // every [data-layer] keyword toggles its layer; the shared class keeps
  // keywords and canvases in sync, and stacking stays fixed
  // (skeletal > circulatory > nervous)
  function setLayer(name, on) {
    document
      .querySelectorAll('[data-layer="' + name + '"]')
      .forEach(function (el) {
        el.classList.toggle("active", on);
        if (el.tagName === "BUTTON") {
          el.setAttribute("aria-pressed", on ? "true" : "false");
        }
      });
    if (on) reveal(name);
    else hide(name);
    updateZoom();
    setMirage(name, on);
  }

  document.querySelectorAll("button[data-layer]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setLayer(btn.dataset.layer, !btn.classList.contains("active"));
    });
  });
})();
