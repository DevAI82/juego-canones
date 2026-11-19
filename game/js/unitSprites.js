import { angleDiff } from "./util.js";

// Units drawn from sprites rendered off a 3D model (tools/blender/): a
// frame per heading instead of one picture turned round, so the light and
// the shadow stay put while the unit turns, with the turret as its own
// layer. What's here is only how a unit looks -- the hull easing into its
// heading, the turret turning to its target, the wheels rolling or the legs
// walking, the gun kicking back -- worked out from the game's state without
// changing it.

// The sprites' camera looks down at 58 degrees, as the RTS mode's 3D view:
// how much of a metre of height shows on screen (its cosine), and of a
// metre of depth (its sine).
export const HEIGHT_ON_SCREEN = 0.53;
export const DEPTH_ON_SCREEN = 0.848;

const sheets = (type, turret) => ({
  hull: `assets/units3d/${type}_hull.webp`,
  ...(turret ? { turret: `assets/units3d/${type}_turret.webp` } : {}),
  icon: `assets/units3d/${type}_icon.webp`,
  model: `assets/models/${type}.glb`,
});

// The numbers tools/blender/units.py rendered each unit's sheets with, and
// where things are on its model (metres; the model faces +x):
//   framePx, frameMetres  a frame's side, in the sheet and on the model
//   pxPerMetre            its size on the map: as long as its old picture
//   rollFrames, rollCycle the steps of its wheels' tread or of its walk, and
//                         the world px it covers for them to come round
//                         (the tyres' real 2.6 px would flicker)
//   stand                 the sheet's first row is the unit standing still
//   upright               a figure: its frames are never tilted to turn
//   wheelRadius           its wheels' radius, for the 3D view to turn them
//   turretAhead, turretUp where the turret turns: ahead of the middle, and up
//   muzzleAhead, muzzleUp the muzzle: ahead of where the turret turns (of
//                         the middle, without one), and up
export const SPRITE_UNITS = {
  tank: {
    ...sheets("tank", true),
    wheelRadius: 0.56,
    directions: 32, hullColumns: 16, turretColumns: 8,
    framePx: 160, frameMetres: 9.6, pxPerMetre: 72 / 7,
    rollFrames: 4, rollCycle: 7,
    turretAhead: 0, turretUp: 1.62, muzzleAhead: 4.05, muzzleUp: 1.95,
  },
  buggy: {
    ...sheets("buggy", true),
    wheelRadius: 0.46,
    directions: 32, hullColumns: 16, turretColumns: 8,
    framePx: 112, frameMetres: 6.0, pxPerMetre: 48 / 4.2,
    rollFrames: 4, rollCycle: 7,
    turretAhead: -0.35, turretUp: 1.77, muzzleAhead: 1.35, muzzleUp: 2.12,
  },
  motorcycle: {
    ...sheets("motorcycle", false),
    wheelRadius: 0.34,
    directions: 32, hullColumns: 16,
    framePx: 96, frameMetres: 3.6, pxPerMetre: 15,
    rollFrames: 4, rollCycle: 6,
    muzzleAhead: 0.7, muzzleUp: 1.05,
  },
  rocket: {
    ...sheets("rocket", true),
    wheelRadius: 0.54,
    directions: 32, hullColumns: 16, turretColumns: 8,
    framePx: 160, frameMetres: 9.6, pxPerMetre: 10.2,
    rollFrames: 4, rollCycle: 7,
    turretAhead: -1.7, turretUp: 1.2, muzzleAhead: 1.85, muzzleUp: 2.7,
  },
  soldier: {
    ...sheets("soldier", false),
    directions: 32, hullColumns: 16,
    framePx: 80, frameMetres: 3.2, pxPerMetre: 15,
    rollFrames: 8, rollCycle: 20, stand: true, upright: true,
    muzzleAhead: 1.05, muzzleUp: 1.37,
  },
};

const HULL_TURN = 5; // rad/s the drawn hull turns toward the unit's heading
const TURRET_TURN = 3; // rad/s the turret turns toward its target
const RECOIL_TIME = 0.35; // s for the gun to settle after a shot
const JUMP = 80; // px in one frame: not driving, a new place
const HALT = 0.12; // s without covering ground before a unit counts as stopped

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

// The hull's frame: the sheet has a row of directions per rolling or walking
// step, after one of the unit standing still if it has that (def.stand).
export function hullFrame(def, direction, roll, moving = true) {
  const step = Math.floor((mod(roll, def.rollCycle) / def.rollCycle) * def.rollFrames) % def.rollFrames;
  const row = def.stand ? (moving ? 1 + step : 0) : step;
  return row * def.directions + direction;
}

export function frameRect(frame, columns, framePx) {
  return { sx: (frame % columns) * framePx, sy: Math.floor(frame / columns) * framePx, size: framePx };
}

// The side, in world px, of the square a unit's frame is drawn in.
export function drawSize(def) {
  return def.frameMetres * def.pxPerMetre;
}

// Where, on the ground under it and relative to the unit's position, the
// turret's axis is on screen with the hull at `heading` radians.
export function mountOffset(def, heading) {
  const ahead = (def.turretAhead || 0) * def.pxPerMetre;
  return { x: Math.cos(heading) * ahead, y: Math.sin(heading) * ahead * DEPTH_ON_SCREEN };
}

// Where the muzzle is on screen, relative to the unit's position, with the
// turret (or, without one, the unit) at `aim` radians and the hull at `heading`.
export function muzzleOffset(def, aim, heading) {
  const mount = mountOffset(def, heading);
  const ahead = def.muzzleAhead * def.pxPerMetre;
  return {
    x: mount.x + Math.cos(aim) * ahead,
    y: mount.y + Math.sin(aim) * ahead * DEPTH_ON_SCREEN - def.muzzleUp * def.pxPerMetre * HEIGHT_ON_SCREEN,
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
  // aims at ({x, y}), or null. Returns { heading, turret, roll, recoil, moving }.
  function update(u, dt, target = null) {
    let v = seen.get(u.id);
    if (!v) {
      v = { heading: u.angle || 0, turret: u.angle || 0, roll: 0, recoil: 0, moving: false, still: HALT, x: u.x, y: u.y, fireTimer: timerOf(u) };
      seen.set(u.id, v);
    }
    const moved = Math.hypot(u.x - v.x, u.y - v.y);
    if (moved < JUMP) v.roll += moved;
    v.still = moved > 0.01 && moved < JUMP ? 0 : v.still + dt;
    v.moving = v.still < HALT;
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
