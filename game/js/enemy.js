import { angleDiff } from "./util.js";
import { distToSegment } from "./map.js";
import { pickTowerTarget, ROCKET_SIEGE_TIME, SOLDIER_SPRINT_TIME, SOLDIER_SPRINT_MULT, SOLDIER_SPRINT_COOLDOWN } from "./ai.js";

// Driving model, per user request ("mejorar el movimiento de las
// unidades"). Units used to slide straight from waypoint to waypoint at a
// constant speed, snapping onto each new segment while the sprite eased
// round afterwards -- so at every corner it visibly slid sideways. Now
// each unit steers toward a point a little way ahead along its route
// (pure pursuit), turning no faster than its type allows, so it drives
// round corners in an arc and always faces the way it's moving; and it
// has a real speed that brakes into sharp turns, picks up again out of
// them, slows behind a slower unit ahead instead of ramming it, and
// swerves around whatever's in front of it (stepEnemy).
//   turn: max turn rate (rad/s). accel/brake: px/s^2. look: how far ahead
//   along its route (px) it steers toward -- with `turn`, sets how wide it
//   takes a corner. Heavy vehicles turn and pick up speed slowly.
const HANDLING = {
  soldier: { turn: 7, accel: 160, brake: 260, look: 18 },
  motorcycle: { turn: 4, accel: 110, brake: 170, look: 34 },
  buggy: { turn: 3.4, accel: 90, brake: 150, look: 36 },
  tank: { turn: 1.8, accel: 30, brake: 60, look: 32 },
  rocket: { turn: 1.8, accel: 30, brake: 60, look: 34 },
};

// Speed lost when the way ahead bends 90 degrees or more from the current
// heading (scaled down for gentler bends).
const CORNER_SLOWDOWN = 0.55;

// Each unit's footprint as drawn (main.js's ENEMY_DRAW_SIZES with each
// sprite's aspect ratio), [length, width] in px -- what spacing is
// measured against. Units used to be pushed apart only once their centres
// were within 14px (simulate.js's separateEnemies), so a 72px tank and the
// escorts riding up its back were drawn heaped on top of each other.
export const FOOTPRINT = {
  tank: [72, 36],
  rocket: [72, 34],
  buggy: [48, 30],
  motorcycle: [50, 26],
  soldier: [18, 22],
};

// Collision avoidance (avoidance below). A unit with another one ahead or
// alongside it, closer sideways than their half-widths plus SIDE_MARGIN,
// steers to the side, out of its way. One of its own kind going the same
// way in front of it sets its speed: that unit's own, plus FOLLOW_CLOSING
// px/s for every px of gap beyond bumper-to-bumper -- closing up smoothly
// and holding there. If that unit is slower than it wants to go, it pulls
// right out alongside and overtakes, so escorts still pass their slow
// tank instead of queueing behind it, and a rocket truck stopped to shell
// a tower gets driven round -- except that it won't start a pass within
// NO_PASSING_RADIUS of the level's narrow points (level 3's bridges through
// the fortress wall), far enough out for a pass already under way to
// finish before the bridge; there it waits its turn. Vehicles follow and
// overtake vehicles, and soldiers soldiers; everyone steers round everyone.
const SIDE_MARGIN = 4;
const SIDE_HOLD = 10;
const PASS_MARGIN = 6;
const FOLLOW_GAP = 30;
const FOLLOW_CLOSING = 1.5;
const NO_PASSING_RADIUS = 260;
const MAX_SHIFT = 40;

export const ENEMY_TYPES = {
  soldier: { hp: 40, speed: 50, damage: 1, bounty: 8, fireRange: 90, fireDamage: 2, fireCooldown: 1.2 },
  buggy: { hp: 30, speed: 62, damage: 1, bounty: 10, fireRange: 110, fireDamage: 2, fireCooldown: 1.0 },
  tank: { hp: 120, speed: 32, damage: 2, bounty: 20, fireRange: 130, fireDamage: 5, fireCooldown: 2.0 },
  // Vehicle, fast escort unit that stays coordinated with the armored convoy.
  motorcycle: { hp: 18, speed: 78, damage: 1, bounty: 9, fireRange: 95, fireDamage: 2, fireCooldown: 0.9 },
  // Heavy rocket artillery truck. Range matches laser tower max range (220 base up to ~345 at max wave level)
  rocket: { hp: 75, speed: 34, damage: 2, bounty: 25, fireRange: 220, fireDamage: 10, fireCooldown: 2.4 },
};

// Per user request, the tank and rocket launcher aren't static threats --
// they escalate as the waves progress, the same 5-level/compounding shape
// as the player towers' own armor/range upgrades (upgrades.js), just
// driven by waveIndex instead of money. One level every WAVES_PER_LEVEL
// waves, capping at level 5 with room to sit at max for the last several
// waves of a 40-wave run (floor(39/7) = 5).
const WAVES_PER_LEVEL = 7;
const MAX_PROGRESSIVE_LEVEL = 5;
const TANK_ARMOR_MULT_PER_LEVEL = 0.85; // damage-taken multiplier, mirrors tower armor
const ROCKET_RANGE_MULT_PER_LEVEL = 1.09; // Scales 220 base up to ~340 at level 5, equivalent to max laser tower range (345)

function progressiveLevel(waveIndex) {
  return Math.min(MAX_PROGRESSIVE_LEVEL, Math.floor(waveIndex / WAVES_PER_LEVEL));
}

// pathIndex: which of the level's roads a vehicle took (index into
// levels.js's `paths`), or null for a soldier's own random route.
export function createEnemy(type, path, waveIndex = 0, pathIndex = null) {
  const def = ENEMY_TYPES[type];
  // +/-10% per-instance speed variation so a wave of identical enemies
  // doesn't move in a perfectly uniform, robotic block.
  const speedJitter = 0.9 + Math.random() * 0.2;
  const level = progressiveLevel(waveIndex);
  const armorMult = type === "tank" ? Math.pow(TANK_ARMOR_MULT_PER_LEVEL, level) : 1;
  const fireRange = type === "rocket" ? def.fireRange * Math.pow(ROCKET_RANGE_MULT_PER_LEVEL, level) : def.fireRange;
  const speed = def.speed * speedJitter;
  return {
    type,
    hp: def.hp,
    maxHp: def.hp,
    // Cruising speed, and the current speed (stepEnemy) -- units arrive
    // already moving, facing along the start of their route.
    speed,
    v: speed,
    damage: def.damage,
    bounty: def.bounty,
    fireRange,
    fireDamage: def.fireDamage,
    fireCooldown: def.fireCooldown,
    fireTimer: def.fireCooldown,
    armorMult,
    path,
    pathIndex,
    waypointIndex: 0,
    x: path[0].x,
    y: path[0].y,
    angle: path[1] ? Math.atan2(path[1].y - path[0].y, path[1].x - path[0].x) : 0,
    // Random phase offset for the walking/driving bob animation (drawn in
    // main.js), so enemies of the same type don't all bob in lockstep.
    bobPhase: Math.random() * Math.PI * 2,
    // Seconds of siege a rocket truck has left (ai.js's holdsForSiege),
    // and whether it's stopped to shell a tower right now.
    siegeLeft: type === "rocket" ? ROCKET_SIEGE_TIME : 0,
    holding: false,
    // Seconds left of a soldier's sprint after being hit, and until it can
    // sprint again.
    sprint: 0,
    sprintCooldown: 0,
    alive: true,
  };
}

// Moves past every route segment the unit has finished -- driven past its
// end, come within half a look-ahead of its end point, or cut the corner
// enough to already be nearer the next segment -- and returns how far
// along the current segment it is (0-1).
function advanceAlongPath(e, look) {
  for (;;) {
    const a = e.path[e.waypointIndex];
    const b = e.path[e.waypointIndex + 1];
    if (!b) return 1;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    const t = len2 === 0 ? 1 : ((e.x - a.x) * abx + (e.y - a.y) * aby) / len2;
    const toEnd = Math.hypot(b.x - e.x, b.y - e.y);
    let done = t >= 1 || toEnd <= look * 0.5;
    const c = e.path[e.waypointIndex + 2];
    if (!done && c && toEnd < look * 1.5) {
      done = distToSegment(e.x, e.y, b.x, b.y, c.x, c.y) < distToSegment(e.x, e.y, a.x, a.y, b.x, b.y);
    }
    if (!done) return Math.max(0, t);
    e.waypointIndex++;
  }
}

// The point `dist` px further along the route than the unit's own spot on
// it (fraction t of the current segment), with the route's direction
// there (unit vector ux, uy).
function pointAhead(e, t, dist) {
  let i = e.waypointIndex;
  const a = e.path[i];
  const b = e.path[i + 1];
  let x = a.x + (b.x - a.x) * t;
  let y = a.y + (b.y - a.y) * t;
  let remaining = dist;
  let ux = 1;
  let uy = 0;
  while (e.path[i + 1]) {
    const n = e.path[i + 1];
    const seg = Math.hypot(n.x - x, n.y - y);
    if (seg > 0) {
      ux = (n.x - x) / seg;
      uy = (n.y - y) / seg;
      if (seg >= remaining) return { x: x + ux * remaining, y: y + uy * remaining, ux, uy };
    }
    remaining -= seg;
    x = n.x;
    y = n.y;
    i++;
  }
  return { x, y, ux, uy };
}

// Reaction to the other units around `e` (its route running along the
// unit vector ux, uy here, `offset` px to the right of it right now,
// wanting to go `cruise`): `shift` is where to steer to, in px to the
// right of the route (0: back on it), and `follow` a cap on its speed
// from a unit in front (Infinity if none). `narrow`: points where
// overtaking isn't allowed. Ahead/sideways are measured along the route,
// not the unit's own heading: with the heading, every small swerve swung
// a unit 50px ahead several px sideways, which flipped the decision to
// pass it on and off every tick.
function avoidance(e, others, ux, uy, cruise, offset, narrow) {
  const kind = e.type === "soldier" ? "soldier" : "vehicle";
  const [eLen, eWid] = FOOTPRINT[e.type] || FOOTPRINT.buggy;
  const canPass = !narrow.some((p) => Math.hypot(p.x - e.x, p.y - e.y) < NO_PASSING_RADIUS);
  let shift = null;
  let follow = Infinity;
  for (const o of others) {
    if (o === e || !o.alive) continue;
    const dx = o.x - e.x;
    const dy = o.y - e.y;
    const lon = dx * ux + dy * uy; // how far ahead of us it is (negative: behind)
    const lat = ux * dy - uy * dx; // how far to our right (negative: left)
    const [oLen, oWid] = FOOTPRINT[o.type] || FOOTPRINT.buggy;
    const bumper = (eLen + oLen) / 2;
    const clear = (eWid + oWid) / 2 + SIDE_MARGIN;
    // Well clear to the side (a band past `clear` still counts, so a unit
    // alongside holds its line instead of drifting back in mid-pass), or
    // too far ahead to matter yet.
    if (Math.abs(lat) >= clear + SIDE_HOLD || lon > bumper + FOLLOW_GAP) continue;
    // Behind us, only one we're still overtaking matters -- hold our line
    // until fully past it, rather than cutting in across its nose. One
    // following in our tracks is its own business.
    if (lon < -bumper * 0.3 && (lon < -(bumper + PASS_MARGIN) || Math.abs(lat) < clear * 0.5)) continue;
    const sameKindSameWay =
      (o.type === "soldier" ? "soldier" : "vehicle") === kind && Math.cos(o.angle) * ux + Math.sin(o.angle) * uy > 0.5;
    const oSpeed = o.v ?? o.speed;
    // Ahead and pulling away from us: leave it be.
    if (sameKindSameWay && lon > 0 && oSpeed > (e.v ?? cruise)) continue;
    const away = lat > 0 ? -1 : 1; // dead ahead: pass it on the right
    // Just clear of it, measured from our route: its own offset from our
    // route (ours plus its offset from us), plus `clear` on the far side.
    let want = offset + lat + away * clear;
    // Only follow a unit we're also behind by its own reckoning (along its
    // heading): two units each "ahead" of the other in their own route's
    // frame used to wait on each other forever.
    const behindIt = -(dx * Math.cos(o.angle) + dy * Math.sin(o.angle)) < 0;
    if (sameKindSameWay && Math.abs(lat) < clear - 2) {
      if (lon > 0 && behindIt) follow = Math.min(follow, Math.max(0, oSpeed + (lon - bumper) * FOLLOW_CLOSING));
      // Slower than we'd go: overtake -- unless at a bridge: wait behind.
      if (oSpeed < cruise * 0.9 && !canPass) want = 0;
    }
    // The unit needing the biggest move out of the way wins.
    if (shift === null || Math.abs(want - offset) > Math.abs(shift - offset)) shift = want;
  }
  return { shift: shift === null ? 0 : Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, shift)), follow };
}

// others: every unit on the field (for avoidance). hold: brake to a stop
// and stay put (a rocket truck sieging, ai.js's holdsForSiege). narrow:
// points with no overtaking around them (avoidance).
export function stepEnemy(enemy, dt, others = [], hold = false, narrow = []) {
  if (!enemy.alive) return { reachedEnd: false };
  if (!enemy.path[enemy.waypointIndex + 1]) return { reachedEnd: true };

  const h = HANDLING[enemy.type] || HANDLING.buggy;
  let cruise = enemy.speed;
  if (enemy.sprintCooldown > 0) enemy.sprintCooldown = Math.max(0, enemy.sprintCooldown - dt);
  if (enemy.sprint > 0) {
    enemy.sprint = Math.max(0, enemy.sprint - dt);
    cruise *= SOLDIER_SPRINT_MULT;
  }

  const t = advanceAlongPath(enemy, h.look);
  // Just finished the route: stop here; the next call reports reachedEnd.
  if (!enemy.path[enemy.waypointIndex + 1]) return { reachedEnd: false };
  const look = pointAhead(enemy, t, h.look);
  // The route's direction here, and how far right of it the unit is.
  const a = enemy.path[enemy.waypointIndex];
  const b = enemy.path[enemy.waypointIndex + 1];
  const segLen = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / segLen;
  const uy = (b.y - a.y) / segLen;
  const offset = ux * (enemy.y - a.y) - uy * (enemy.x - a.x);
  const { shift, follow } = avoidance(enemy, others, ux, uy, cruise, offset, narrow);
  // Aim point: the look-ahead point, moved `shift` px to the right of the
  // route there (negative: left) to swerve.
  const aimX = look.x - look.uy * shift;
  const aimY = look.y + look.ux * shift;
  const err = angleDiff(enemy.angle, Math.atan2(aimY - enemy.y, aimX - enemy.x));
  const maxTurn = h.turn * dt;
  enemy.angle += Math.max(-maxTurn, Math.min(maxTurn, err));

  let targetSpeed = 0;
  if (!hold) {
    const corner = 1 - CORNER_SLOWDOWN * Math.min(1, Math.abs(err) / (Math.PI / 2));
    targetSpeed = Math.min(cruise * corner, follow);
  }
  const v = enemy.v ?? enemy.speed;
  enemy.v = v < targetSpeed ? Math.min(targetSpeed, v + h.accel * dt) : Math.max(targetSpeed, v - h.brake * dt);
  enemy.x += Math.cos(enemy.angle) * enemy.v * dt;
  enemy.y += Math.sin(enemy.angle) * enemy.v * dt;
  return { reachedEnd: false };
}

export function damageEnemy(enemy, amount) {
  enemy.hp -= amount * (enemy.armorMult ?? 1);
  if (enemy.hp <= 0) {
    enemy.hp = 0;
    enemy.alive = false;
  } else if (enemy.type === "soldier" && !(enemy.sprintCooldown > 0)) {
    enemy.sprint = SOLDIER_SPRINT_TIME;
    enemy.sprintCooldown = SOLDIER_SPRINT_COOLDOWN;
  }
  return enemy.alive;
}

export function stepEnemyFire(enemy, towers, dt) {
  if (!enemy.alive) return null;
  enemy.fireTimer -= dt;
  if (enemy.fireTimer > 0) return null;

  const best = pickTowerTarget(enemy, towers);
  if (!best) return null;

  enemy.fireTimer = enemy.fireCooldown;
  return { x: enemy.x, y: enemy.y, target: best, damage: enemy.fireDamage };
}
