import { CANVAS_WIDTH, CANVAS_HEIGHT, PATH, drawMap, drawPathDebug } from "./map.js";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const mapImage = new Image();
mapImage.src = "assets/map_bg.png";

let lastTime = performance.now();

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  if (mapImage.complete && mapImage.naturalWidth > 0) {
    drawMap(ctx, mapImage);
  } else {
    ctx.fillStyle = "#3a4a2f";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
  drawPathDebug(ctx, PATH);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
