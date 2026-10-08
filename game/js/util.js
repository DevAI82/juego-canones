// Small shared helpers used by more than one game module.

// Signed shortest-way-round difference `to - from` (radians), in [-PI, PI].
export function angleDiff(from, to) {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

// Rotate `from` toward `to` (radians) by fraction `t` (0-1), always taking
// the shorter way around the circle. Used to make turret rotation ease
// into its target heading over a few frames instead of snapping
// instantly, which read as robotic and lifeless.
export function lerpAngle(from, to, t) {
  return from + angleDiff(from, to) * Math.min(t, 1);
}

// The browser's localStorage -- or null where there isn't one (Node, or a
// browser blocking site data, where even reading the property can throw).
export function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// Whether a key press belongs to a text field being typed in (the
// end-of-game name field) rather than to the game's keyboard shortcuts --
// typing a name with an R in it used to start a new game.
export function isTypingTarget(el) {
  if (!el) return false;
  if (el.tagName === "TEXTAREA") return true;
  return el.tagName === "INPUT" && (el.type || "text") === "text";
}
