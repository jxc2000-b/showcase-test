/* ascii.js — throwaway test pages (/ascii/ and /accurate/)
 *
 * Reads the grid the server embedded in the page (<script id="ascii-grid">)
 * and draws it as dark squares on a white canvas. */

(function () {
  "use strict";
  var SCALE = 6;
  var rows = JSON.parse(document.getElementById("ascii-grid").textContent);
  var canvas = document.getElementById("board");
  canvas.width = rows[0].length * SCALE;
  canvas.height = rows.length * SCALE;
  var ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0c0c0e";
  for (var y = 0; y < rows.length; y++) {
    for (var x = 0; x < rows[y].length; x++) {
      if (rows[y][x] === "#") {
        ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
      }
    }
  }
})();
