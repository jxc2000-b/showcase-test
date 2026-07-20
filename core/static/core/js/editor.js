/* editor.js — pixel editor page (/editor/)
 *
 * A drawing tool for hand-tuning the silhouette one pixel at a time:
 * brush/eraser, undo/redo, autosave to the browser, and a "Save to server"
 * button that POSTs the grid to the save endpoint (which writes
 * silhouette_custom.json). Grid size and save URL arrive as data-attributes
 * on <canvas id="board">; the base silhouette arrives as JSON embedded in
 * the page (<script id="generated-silhouette">). */

(function () {
  "use strict";

  var canvas = document.getElementById("board");
  var W = parseInt(canvas.dataset.width, 10);
  var H = parseInt(canvas.dataset.height, 10);
  var CELL = 6;
  var SAVE_URL = canvas.dataset.saveUrl;
  canvas.width = W * CELL;
  canvas.height = H * CELL;
  var ctx = canvas.getContext("2d");

  var state = new Uint8Array(W * H);       // 1 = lit
  var tool = "brush";                       // brush | erase
  var brushSize = 1;
  var showGrid = true;
  var painting = false;
  var paintValue = 1;
  var lastCell = null;
  var hoverCell = null;

  var undoStack = [];
  var redoStack = [];

  var els = {
    brush: document.getElementById("tool-brush"),
    erase: document.getElementById("tool-erase"),
    size: document.getElementById("brush-size"),
    grid: document.getElementById("toggle-grid"),
    undo: document.getElementById("undo"),
    redo: document.getElementById("redo"),
    loadGen: document.getElementById("load-generated"),
    clear: document.getElementById("clear"),
    copy: document.getElementById("copy"),
    download: document.getElementById("download"),
    save: document.getElementById("save"),
    status: document.getElementById("status"),
    lit: document.getElementById("lit-count"),
    out: document.getElementById("rows-out"),
  };

  // ---------------------------------------------------------------- state

  function rows() {
    var out = [];
    for (var y = 0; y < H; y++) {
      var s = "";
      for (var x = 0; x < W; x++) s += state[y * W + x] ? "#" : ".";
      out.push(s);
    }
    return out;
  }

  function loadRows(r) {
    state.fill(0);
    for (var y = 0; y < Math.min(H, r.length); y++) {
      for (var x = 0; x < Math.min(W, r[y].length); x++) {
        if (r[y][x] === "#") state[y * W + x] = 1;
      }
    }
    afterChange();
  }

  function loadGenerated() {
    var gen = JSON.parse(
      document.getElementById("generated-silhouette").textContent
    );
    pushUndo();
    loadRows(gen);   // base silhouette is already at editor grid size
    setStatus("base silhouette loaded", "ok");
  }

  function pushUndo() {
    undoStack.push(state.slice());
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
    syncHistoryButtons();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(state.slice());
    state = undoStack.pop();
    afterChange();
    syncHistoryButtons();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(state.slice());
    state = redoStack.pop();
    afterChange();
    syncHistoryButtons();
  }

  function syncHistoryButtons() {
    els.undo.disabled = !undoStack.length;
    els.redo.disabled = !redoStack.length;
  }

  function afterChange() {
    redraw();
    var r = rows();
    els.out.value = r.join("\n");
    var lit = 0;
    for (var i = 0; i < state.length; i++) lit += state[i];
    els.lit.textContent = lit.toLocaleString();
    try {
      localStorage.setItem("pixel-editor-rows", JSON.stringify(r));
    } catch (e) { /* storage unavailable — fine */ }
  }

  function setStatus(msg, cls) {
    els.status.textContent = msg;
    els.status.className = cls || "";
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
    for (var dy = 0; dy < brushSize; dy++) {
      for (var dx = 0; dx < brushSize; dx++) {
        var x = cx + dx - half, y = cy + dy - half;
        if (x >= 0 && x < W && y >= 0 && y < H) state[y * W + x] = paintValue;
      }
    }
  }

  // bresenham so fast drags don't skip cells
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
      e.button === 2 || e.shiftKey || tool === "erase" ? 0 : 1;
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#232329";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#f0f0f2";
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (state[y * W + x]) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }

    if (showGrid) {
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
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
        ctx.strokeStyle = "#2d4ada";
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

  els.brush.addEventListener("click", function () { setTool("brush"); });
  els.erase.addEventListener("click", function () { setTool("erase"); });
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
  els.loadGen.addEventListener("click", loadGenerated);
  els.clear.addEventListener("click", function () {
    if (!window.confirm("Clear the canvas?")) return;
    pushUndo();
    state.fill(0);
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
  });

  // ---------------------------------------------------------------- export

  els.copy.addEventListener("click", function () {
    navigator.clipboard.writeText(rows().join("\n")).then(
      function () { setStatus("rows copied to clipboard", "ok"); },
      function () { setStatus("copy failed — select the textarea manually", "err"); }
    );
  });

  els.download.addEventListener("click", function () {
    var blob = new Blob([rows().join("\n") + "\n"], { type: "text/plain" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "silhouette_" + W + "x" + H + ".txt";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  function getCookie(name) {
    var m = document.cookie.match("(?:^|; )" + name + "=([^;]*)");
    return m ? decodeURIComponent(m[1]) : "";
  }

  els.save.addEventListener("click", function () {
    setStatus("saving…");
    fetch(SAVE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: JSON.stringify({ rows: rows() }),
    })
      .then(function (r) { return r.json().then(function (j) { return [r.status, j]; }); })
      .then(function (res) {
        var status = res[0], body = res[1];
        if (status === 200 && body.ok) {
          setStatus("saved " + body.lit.toLocaleString() + " px → " + body.path, "ok");
        } else {
          setStatus("save failed: " + (body.error || status), "err");
        }
      })
      .catch(function (err) { setStatus("save failed: " + err, "err"); });
  });

  // ---------------------------------------------------------------- boot

  (function boot() {
    var saved = null;
    try { saved = localStorage.getItem("pixel-editor-rows"); } catch (e) {}
    if (saved) {
      try {
        var r = JSON.parse(saved);
        if (Array.isArray(r) && r.length === H && r[0].length === W) {
          loadRows(r);
          setStatus("restored autosave from this browser", "ok");
          return;
        }
      } catch (e) {}
    }
    loadGenerated();   // first visit: start from the accurate silhouette
    undoStack.length = 0;   // loading the base is not undoable
    syncHistoryButtons();
  })();
})();
