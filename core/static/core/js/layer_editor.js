/* layer_editor.js — anatomy layer editor page (/editor/layer/)
 *
 * The same editor idea as editor.js, but painting one of three anatomy
 * layers (nervous / circulatory / skeletal) over a locked grey silhouette
 * backdrop. Paint is clipped to the body. The skeletal layer is two-tone:
 * a white brush and a black brush (grid characters '#' and 'B'). Each layer
 * autosaves to the browser; "Save layer" POSTs the active layer to the
 * save endpoint (which writes layer_<name>.json). Grid size and save URL
 * arrive as data-attributes on <canvas id="board">; the silhouette and the
 * saved layers arrive as JSON embedded in the page
 * (<script id="generated-silhouette"> and <script id="saved-layers">). */

(function () {
  "use strict";

  var canvas = document.getElementById("board");
  var W = parseInt(canvas.dataset.width, 10);
  var H = parseInt(canvas.dataset.height, 10);
  var CELL = 6;
  var SAVE_URL = canvas.dataset.saveUrl;
  var LAYER_COLORS = {
    nervous: "#2d4ada",
    circulatory: "#e23a3a",
  };
  // skeletal is two-tone: white bone (value 1, grid '#') and black detail
  // (value 2, grid 'B'), both distinct from the grey backdrop
  var SKELETAL_COLORS = { 1: "#ffffff", 2: "#0c0c0e" };
  var SIL_COLOR = "#c7c7cc";
  var BG_COLOR = "#f4f4f5";

  canvas.width = W * CELL;
  canvas.height = H * CELL;
  var ctx = canvas.getContext("2d");

  // locked backdrop
  var silRows = JSON.parse(
    document.getElementById("generated-silhouette").textContent
  );
  var sil = new Uint8Array(W * H);
  for (var sy = 0; sy < Math.min(H, silRows.length); sy++) {
    for (var sx = 0; sx < Math.min(W, silRows[sy].length); sx++) {
      if (silRows[sy][sx] === "#") sil[sy * W + sx] = 1;
    }
  }

  var savedLayers = JSON.parse(
    document.getElementById("saved-layers").textContent
  );

  var states = {
    nervous: new Uint8Array(W * H),
    circulatory: new Uint8Array(W * H),
    skeletal: new Uint8Array(W * H),
  };
  var active = "nervous";
  var brushColor = 1;   // skeletal only: 1 = white, 2 = black
  var tool = "brush";
  var brushSize = 1;
  var showGrid = true;
  var painting = false;
  var paintValue = 1;
  var lastCell = null;
  var hoverCell = null;

  var undoStack = [];
  var redoStack = [];

  var els = {
    picks: document.querySelectorAll(".layer-pick"),
    brush: document.getElementById("tool-brush"),
    erase: document.getElementById("tool-erase"),
    size: document.getElementById("brush-size"),
    grid: document.getElementById("toggle-grid"),
    undo: document.getElementById("undo"),
    redo: document.getElementById("redo"),
    clear: document.getElementById("clear"),
    copy: document.getElementById("copy"),
    download: document.getElementById("download"),
    save: document.getElementById("save"),
    status: document.getElementById("status"),
    lit: document.getElementById("lit-count"),
    silCount: document.getElementById("sil-count"),
    out: document.getElementById("rows-out"),
    colorGroup: document.getElementById("paint-color"),
    colorPicks: document.querySelectorAll(".color-pick"),
  };

  // ---------------------------------------------------------------- state

  function rowsOf(name) {
    var st = states[name];
    var out = [];
    for (var y = 0; y < H; y++) {
      var s = "";
      for (var x = 0; x < W; x++) {
        var v = st[y * W + x];
        s += v === 2 ? "B" : v ? "#" : ".";
      }
      out.push(s);
    }
    return out;
  }

  function loadRowsInto(name, r) {
    var st = states[name];
    st.fill(0);
    for (var y = 0; y < Math.min(H, r.length); y++) {
      for (var x = 0; x < Math.min(W, r[y].length); x++) {
        var ch = r[y][x];
        if ((ch === "#" || ch === "B") && sil[y * W + x]) {
          st[y * W + x] = ch === "B" ? 2 : 1;
        }
      }
    }
  }

  function persist(name) {
    try {
      localStorage.setItem("layer-editor-" + name, JSON.stringify(rowsOf(name)));
    } catch (e) { /* storage unavailable — fine */ }
  }

  function pushUndo() {
    undoStack.push(states[active].slice());
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
    syncHistoryButtons();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(states[active].slice());
    states[active] = undoStack.pop();
    afterChange();
    syncHistoryButtons();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(states[active].slice());
    states[active] = redoStack.pop();
    afterChange();
    syncHistoryButtons();
  }

  function syncHistoryButtons() {
    els.undo.disabled = !undoStack.length;
    els.redo.disabled = !redoStack.length;
  }

  function afterChange() {
    redraw();
    var r = rowsOf(active);
    els.out.value = r.join("\n");
    var lit = 0;
    var st = states[active];
    for (var i = 0; i < st.length; i++) lit += st[i] ? 1 : 0;
    els.lit.textContent = lit.toLocaleString();
    persist(active);
  }

  function setStatus(msg, cls) {
    els.status.textContent = msg;
    els.status.className = cls || "";
  }

  function setActive(name) {
    if (active === name) return;
    persist(active);
    active = name;
    undoStack.length = 0;
    redoStack.length = 0;
    syncHistoryButtons();
    els.picks.forEach(function (b) {
      b.classList.toggle("on", b.dataset.layerName === name);
    });
    els.save.dataset.layerName = name;
    // the two-colour brush is a skeletal-only tool: reset to white and
    // hide the swatches on the single-colour layers
    brushColor = 1;
    syncColorPicks();
    els.colorGroup.style.display = name === "skeletal" ? "" : "none";
    afterChange();
  }

  function syncColorPicks() {
    els.colorPicks.forEach(function (b) {
      b.classList.toggle("on", parseInt(b.dataset.color, 10) === brushColor);
    });
  }

  // ---------------------------------------------------------------- paint

  function cellFromEvent(e) {
    var rect = canvas.getBoundingClientRect();
    return [
      Math.floor((e.clientX - rect.left) / CELL),
      Math.floor((e.clientY - rect.top) / CELL),
    ];
  }

  function paintAt(cx, cy) {
    var half = Math.floor(brushSize / 2);
    var st = states[active];
    for (var dy = 0; dy < brushSize; dy++) {
      for (var dx = 0; dx < brushSize; dx++) {
        var x = cx + dx - half, y = cy + dy - half;
        // anatomy stays inside the body: silhouette cells only
        if (x >= 0 && x < W && y >= 0 && y < H && sil[y * W + x]) {
          st[y * W + x] = paintValue;
        }
      }
    }
  }

  function paintLine(x0, y0, x1, y1) {
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    var err = dx + dy;
    for (;;) {
      paintAt(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  canvas.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    pushUndo();
    paintValue =
      e.button === 2 || e.shiftKey || tool === "erase"
        ? 0
        : active === "skeletal"
          ? brushColor
          : 1;
    var c = cellFromEvent(e);
    paintAt(c[0], c[1]);
    lastCell = c;
    painting = true;
    redraw();
  });

  canvas.addEventListener("pointermove", function (e) {
    var c = cellFromEvent(e);
    hoverCell = c;
    if (painting && (c[0] !== lastCell[0] || c[1] !== lastCell[1])) {
      paintLine(lastCell[0], lastCell[1], c[0], c[1]);
      lastCell = c;
    }
    redraw();
  });

  function endStroke() {
    if (painting) {
      painting = false;
      afterChange();
    }
  }
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);
  canvas.addEventListener("pointerleave", function () {
    hoverCell = null;
    redraw();
  });

  // ---------------------------------------------------------------- draw

  function redraw() {
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = SIL_COLOR;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (sil[y * W + x]) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }

    var st = states[active];
    if (active === "skeletal") {
      // two passes: white bone first, black detail overprinted on top
      [1, 2].forEach(function (v) {
        ctx.fillStyle = SKELETAL_COLORS[v];
        for (var ly = 0; ly < H; ly++) {
          for (var lx = 0; lx < W; lx++) {
            if (st[ly * W + lx] === v) ctx.fillRect(lx * CELL, ly * CELL, CELL, CELL);
          }
        }
      });
    } else {
      ctx.fillStyle = LAYER_COLORS[active];
      for (var ly = 0; ly < H; ly++) {
        for (var lx = 0; lx < W; lx++) {
          if (st[ly * W + lx]) ctx.fillRect(lx * CELL, ly * CELL, CELL, CELL);
        }
      }
    }

    if (showGrid) {
      ctx.strokeStyle = "rgba(0,0,0,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var gx = 1; gx < W; gx++) {
        ctx.moveTo(gx * CELL + 0.5, 0);
        ctx.lineTo(gx * CELL + 0.5, canvas.height);
      }
      for (var gy = 1; gy < H; gy++) {
        ctx.moveTo(0, gy * CELL + 0.5);
        ctx.lineTo(canvas.width, gy * CELL + 0.5);
      }
      ctx.stroke();
    }

    if (hoverCell && !painting) {
      var hx = hoverCell[0], hy = hoverCell[1];
      if (hx >= 0 && hx < W && hy >= 0 && hy < H) {
        ctx.strokeStyle = active === "skeletal" ? SKELETAL_COLORS[brushColor] : LAYER_COLORS[active];
        ctx.lineWidth = 2;
        var half = Math.floor(brushSize / 2);
        ctx.strokeRect(
          (hx - half) * CELL + 1,
          (hy - half) * CELL + 1,
          brushSize * CELL - 2,
          brushSize * CELL - 2
        );
      }
    }
  }

  // ---------------------------------------------------------------- tools

  function setTool(t) {
    tool = t;
    els.brush.classList.toggle("on", t === "brush");
    els.erase.classList.toggle("on", t === "erase");
  }

  els.picks.forEach(function (b) {
    b.addEventListener("click", function () { setActive(b.dataset.layerName); });
  });
  els.brush.addEventListener("click", function () { setTool("brush"); });
  els.erase.addEventListener("click", function () { setTool("erase"); });
  els.colorPicks.forEach(function (b) {
    b.addEventListener("click", function () {
      brushColor = parseInt(b.dataset.color, 10);
      syncColorPicks();
    });
  });
  els.size.addEventListener("change", function () {
    brushSize = parseInt(els.size.value, 10);
  });
  els.grid.addEventListener("click", function () {
    showGrid = !showGrid;
    els.grid.classList.toggle("on", showGrid);
    redraw();
  });
  els.undo.addEventListener("click", undo);
  els.redo.addEventListener("click", redo);
  els.clear.addEventListener("click", function () {
    if (!window.confirm("Clear the " + active + " layer?")) return;
    pushUndo();
    states[active].fill(0);
    afterChange();
  });

  document.addEventListener("keydown", function (e) {
    if (e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
    var k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "z" && !e.shiftKey) {
      e.preventDefault(); undo();
    } else if ((e.ctrlKey || e.metaKey) && (k === "y" || (k === "z" && e.shiftKey))) {
      e.preventDefault(); redo();
    } else if (k === "b") setTool("brush");
    else if (k === "e") setTool("erase");
    else if (k === "g") els.grid.click();
    else if (k === "1") setActive("nervous");
    else if (k === "2") setActive("circulatory");
    else if (k === "3") setActive("skeletal");
    else if (k === "x" && active === "skeletal") {
      brushColor = brushColor === 1 ? 2 : 1;
      syncColorPicks();
    }
  });

  // ---------------------------------------------------------------- export

  els.copy.addEventListener("click", function () {
    navigator.clipboard.writeText(rowsOf(active).join("\n")).then(
      function () { setStatus("rows copied to clipboard", "ok"); },
      function () { setStatus("copy failed — select the textarea manually", "err"); }
    );
  });

  els.download.addEventListener("click", function () {
    var blob = new Blob([rowsOf(active).join("\n") + "\n"], { type: "text/plain" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "layer_" + active + "_" + W + "x" + H + ".txt";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  function getCookie(name) {
    var m = document.cookie.match("(?:^|; )" + name + "=([^;]*)");
    return m ? decodeURIComponent(m[1]) : "";
  }

  els.save.addEventListener("click", function () {
    setStatus("saving " + active + "…");
    fetch(SAVE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: JSON.stringify({ name: active, rows: rowsOf(active) }),
    })
      .then(function (r) { return r.json().then(function (j) { return [r.status, j]; }); })
      .then(function (res) {
        var status = res[0], body = res[1];
        if (status === 200 && body.ok) {
          setStatus("saved " + active + " (" + body.lit.toLocaleString() + " px) → " + body.path, "ok");
        } else {
          setStatus("save failed: " + (body.error || status), "err");
        }
      })
      .catch(function (err) { setStatus("save failed: " + err, "err"); });
  });

  // ---------------------------------------------------------------- boot

  (function boot() {
    ["nervous", "circulatory", "skeletal"].forEach(function (name) {
      var restored = null;
      try { restored = localStorage.getItem("layer-editor-" + name); } catch (e) {}
      if (restored) {
        try {
          var r = JSON.parse(restored);
          if (Array.isArray(r) && r.length === H && r[0].length === W) {
            loadRowsInto(name, r);
            return;
          }
        } catch (e) {}
      }
      if (Array.isArray(savedLayers[name])) {
        loadRowsInto(name, savedLayers[name]);
      }
    });

    var silLit = 0;
    for (var i = 0; i < sil.length; i++) silLit += sil[i];
    els.silCount.textContent = silLit.toLocaleString();
    syncHistoryButtons();
    afterChange();
  })();
})();
