import { angleDiff } from "./util.js";

// Units drawn from sprites rendered off a 3D model (tools/blender/): a
// frame per heading instead of one picture turned round, so the light and
// the shadow stay put while the vehicle turns, with the turret as its own
// layer. What's here is only how a unit looks -- the hull easing into its
// heading, the turret turning to its target, the wheels rolling, the gun
// kicking back -- worked out from the game's state without changing it.

// The numbers build_tank.py rendered the sheets with.
export const SPRITE_UNITS = {
  tank: {
    hull: "assets/units3d/tank_hull.webp",
    turret: "assets/units3d/tank_turret.webp",
    directions: 32, // headings, clockwise on screen from facing right
    wheelFrames: 4, // steps of the tyres' tread
    framePx: 160,
    frameMetres: 9.6, // what a frame's side covers
    hullColumns: 16,
    turretColumns: 8,
    pxPerMetre: 72 / 7, // as long on the map as the old picture: 72 px for its 7 m
    // World px the tank moves for the tread to come round once. The real
    // figure (2.6 px) would flicker at the game's frame rate.
    wheelCycle: 7,
    // The muzzle: metres ahead of the turret's axis and above the ground,
    // and how much of a metre of height shows on screen (cos of the
    // camera's 58 degrees), as of a metre of depth (its sine).
    turretUp: 1.62, // metres up the turret sits: what its frame turns about
    muzzleAhead: 4.05,
    muzzleUp: 1.95,
    heightOnScreen: 0.53,
    depthOnScreen: 0.848,
  },
};

const HULL_TURN = 5; // rad/s the drawn hull turns toward the unit's heading
const TURRET_TURN = 3; // rad/s the turret turns toward its target
const RECOIL_TIME = 0.35; // s for the gun to settle after a shot
const JUMP = 80; // px in one frame: not driving, a new place

const TAU = Math.PI * 2;
const mod = (a, n) => ((a % n) + n) % n;

// Which of the `directions` rendered headings to draw for `angle`, and
// what's left over (at most half a step either way) to turn that frame by,
// so a turning vehicle doesn't tick from one frame to the next.
export function directionFrame(angle, directions) {
  const step = TAU / directions;
  const nearest = Math.round(angle / step);
  return { index: mod(nearest, directions), rest: angle - nearest * step };
}

// `current` moved toward `target` by at most `maxStep`, the short way round.
export function turnToward(current, target, maxStep) {
  const diff = angleDiff(current, target);
  return current + Math.max(-maxStep, Math.min(maxStep, diff));
}

// The hull's frame: the sheet has a row of directions per wheel step.
export function hullFrame(def, direction, roll) {
  const step = Math.floor((mod(roll, def.wheelCycle) / def.wheelCycle) * def.wheelFrames) % def.wheelFrames;
  return step * def.directions + direction;
}

export function frameRect(frame, columns, framePx) {
  return { sx: (frame % columns) * framePx, sy: Math.floor(frame / columns) * framePx, size: framePx };
}

// The side, in world px, of the square a unit's frame is drawn in.
export function drawSize(def) {
  return def.frameMetres * def.pxPerMetre;
}

// Where the muzzle is on screen, relative to the unit's position, with the
// turret at `turret` radians.
export function muzzleOffset(def, turret) {
  const ahead = def.muzzleAhead * def.pxPerMetre;
  return {
    x: Math.cos(turret) * ahead,
    y: Math.sin(turret) * ahead * def.depthOnScreen - def.muzzleUp * def.pxPerMetre * def.heightOnScreen,
  };
}

// A unit's countdown to its next shot: the defence's and the attack's units
// keep it in fireTimer (their fireCooldown is how long it starts at), the
// RTS mode's in fireCooldown.
const timerOf = (u) => u.fireTimer ?? u.fireCooldown;

// How each unit on screen looks right now, kept from frame to frame.
export function createUnitVisuals() {
  const seen = new Map();

  // Bring unit `u`'s looks up to date, `dt` seconds on. `target` is what it
  // aims at ({x, y}), or null. Returns { heading, turret, roll, recoil }.
  function update(u, dt, target = null) {
    let v = seen.get(u.id);
    if (!v) {
      v = { heading: u.angle || 0, turret: u.angle || 0, roll: 0, recoil: 0, x: u.x, y: u.y, fireTimer: timerOf(u) };
      seen.set(u.id, v);
    }
    const moved = Math.hypot(u.x - v.x, u.y - v.y);
    if (moved < JUMP) v.roll += moved;
    v.x = u.x;
    v.y = u.y;

    const heading = turnToward(v.heading, u.angle || 0, HULL_TURN * dt);
    v.turret += heading - v.heading; // the turret rides on the hull
    v.heading = heading;
    const aim = target ? Math.atan2(target.y - u.y, target.x - u.x) : v.heading;
    v.turret = turnToward(v.turret, aim, TURRET_TURN * dt);

    v.recoil = Math.max(0, v.recoil - dt / RECOIL_TIME);
    // The fire timer counts down and starts over when the unit fires.
    const timer = timerOf(u);
    if (timer != null && v.fireTimer != null && timer > v.fireTimer + 0.2) v.recoil = 1;
    v.fireTimer = timer;
    return v;
  }

  function keepOnly(ids) {
    const keep = new Set(ids);
    for (const id of seen.keys()) if (!keep.has(id)) seen.delete(id);
  }

  return { update, keepOnly, get: (id) => seen.get(id), size: () => seen.size };
}
