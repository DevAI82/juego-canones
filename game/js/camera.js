// The camera's limits (main.js's clampCamera). It never leaves the map --
// except that, where panels lie over the map (pad: canvas px they cover on
// the right, at the top and at the bottom), the map can be pushed out from
// under them, so nothing at its edges has to stay hidden; a map that fits
// in the room they leave is centred in it. `camera` is the world point at
// the view's top left; the view is `view` canvas px seen at `zoom`.
export function clampCameraPosition(camera, world, view, zoom, pad = {}) {
  const viewW = view.width / zoom;
  const viewH = view.height / zoom;
  const right = (pad.right || 0) / zoom;
  const top = (pad.top || 0) / zoom;
  const bottom = (pad.bottom || 0) / zoom;
  const fit = (pos, lo, hi) => (hi <= lo ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, pos)));
  return {
    x: fit(camera.x, 0, world.w - viewW + right),
    y: fit(camera.y, -top, world.h - viewH + bottom),
  };
}
