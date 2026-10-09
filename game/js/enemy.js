import { angleDiff } from "./util.js";
import { distToSegment, crossesWall } from "./map.js";
import { distToBlock, segmentNearBlock } from "./walls.js";
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
const TURN_FREE = Math.PI / 4;

// The look-ahead shrinks with speed, down to this at a standstill: a unit
// crawling out from behind a stopped one aims sharply sideways instead of
// mostly ahead (into the unit it's trying to get round).
const LOOK_MIN = 8;

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
// steers to the side, out of its way -- one coming up behind a slower one
// of its own kind pulls right out alongside and overtakes it, holding its
// line until fully past, so escorts pass their slow tank and a rocket
// truck stopped to shell a tower gets driven round. It doesn't slow down
// to do it: in bot games, letting units queue behind slower ones (even
// down to 85% of their own speed) had whole waves crawling along at tank
// pace through the towers' fire, and made level 1 far easier than it was
// designed. The one place units do queue is at the level's gates (level
// 3's bridges through the fortress wall): no pass is started within
// NO_PASSING_RADIUS of one -- far enough out for a pass already under way
// to finish before the bridge -- and there a unit follows the one in front,
// at its speed plus FOLLOW_CLOSING px/s for every px of gap, closing up
// smoothly and holding there. Vehicles overtake and queue behind vehicles,
// and soldiers behind soldiers; everyone steers round everyone.
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
// from a unit in front (Infinity if none). `gates`: points where
// overtaking isn't allowed. Ahead/sideways are measured along the route,
// not the unit's own heading: with the heading, every small swerve swung
// a unit 50px ahead several px sideways, which flipped the decision to
// pass it on and off every tick.
function avoidance(e, others, ux, uy, cruise, offset, gates) {
  const kind = e.type === "soldier" ? "soldier" : "vehicle";
  const [eLen, eWid] = FOOTPRINT[e.type] || FOOTPRINT.buggy;
  const canPass = !gates.some((p) => Math.hypot(p.x - e.x, p.y - e.y) < NO_PASSING_RADIUS);
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
    // Only ever brake for a unit that entered the map before us (lower id).
    // Who's in front of whom is judged along each unit's own route, so two
    // units side by side on converging roads could each see the other in
    // front and both stop for good. With braking only ever "downhill" in
    // spawn order, the oldest unit in any knot never waits on the others,
    // so every knot unties. (Steering clear and overtaking still apply to
    // everyone.)
    const yields = (e.id ?? Infinity) > (o.id ?? -Infinity);
    if (sameKindSameWay && Math.abs(lat) < clear - 2 && !canPass) {
      // At a bridge: queue behind it in our lane instead of overtaking.
      if (lon > 0 && yields) follow = Math.min(follow, Math.max(0, oSpeed + (lon - bumper) * FOLLOW_CLOSING));
      if (oSpeed < cruise * 0.9) want = 0;
    }
    // The unit needing the biggest move out of the way wins.
    if (shift === null || Math.abs(want - offset) > Math.abs(shift - offset)) shift = want;
  }
  return { shift: shift === null ? 0 : Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, shift)), follow };
}

// The look-ahead point moved `shift` px to the right of the route there
// (negative: left), to swerve -- unless the way there runs through a wall:
// then round the other side instead, or failing that straight on along
// the route. If even that is behind a wall, the unit has ended up on the
// wrong side of it -- nudged against the wall beside a gate with its route
// carrying on through the gate, say, or sidestepped in through a gate its
// route only ran past: then it heads for where its current stretch of
// route starts or ends, or failing those the nearest gate it can reach,
// and so works its way back round through the opening instead of pushing
// against the wall for good.
function aimPoint(e, look, shift, walls, gates) {
  const offRoute = (s) => ({ x: look.x - look.uy * s, y: look.y + look.ux * s });
  if (!walls) return offRoute(shift);
  const options = shift === 0 ? [offRoute(0)] : [offRoute(shift), offRoute(-shift), offRoute(0)];
  options.push(e.path[e.waypointIndex], e.path[e.waypointIndex + 1]);
  options.push(...[...gates].sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y)));
  return options.find((p) => !crossesWall(e, p, walls)) || offRoute(0);
}

// The player's wall blocks (walls.js): how far ahead a unit starts looking
// out for them, and how far to either side of its route it will swerve to
// slip past one -- enough to get round a block at the edge of the road, not
// to drive off round the end of a proper wall across it.
const BARRIER_SCAN = 160;
const BYPASS = [12, -12, 24, -24];

// How far the body of a `type` unit -- a capsule from its tail to its nose,
// as wide as the unit (FOOTPRINT) -- is from wall block w, with its centre
// at (x, y) facing `angle`; negative if they overlap.
function gapToBlock(type, x, y, angle, w) {
  const [len, wid] = FOOTPRINT[type] || FOOTPRINT.buggy;
  const r = wid / 2;
  const reach = Math.max(0, len / 2 - r);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  let d = Infinity;
  for (const k of [-1, -0.5, 0, 0.5, 1]) d = Math.min(d, distToBlock(x + c * reach * k, y + s * reach * k, w));
  return d - r;
}

// If the way ahead runs into one of the player's wall blocks, aim a little
// to one side of the route to slip past (BYPASS), checking the line out to
// `probe` -- further ahead than the steering point, so the swerve starts in
// good time. If every way past is blocked, keep the original aim: the unit
// drives up to the wall and stops there (stepEnemy) to shoot it down.
function aroundBarriers(e, aim, probe, barriers) {
  const pad = (FOOTPRINT[e.type] || FOOTPRINT.buggy)[1] / 2 + 2;
  const clear = (p) => !barriers.some((w) => segmentNearBlock(e, p, w, pad));
  if (clear(probe)) return aim;
  for (const s of BYPASS) {
    const p = { x: probe.x - probe.uy * s, y: probe.y + probe.ux * s };
    if (clear(p)) return p;
  }
  return aim;
}

// Options: others -- every unit on the field (for avoidance); hold --
// brake to a stop and stay put (a rocket truck sieging, ai.js's
// holdsForSiege); walls -- solid segments never to move through (level
// 3's fortress, per user request impassable everywhere but its gates;
// level 4's shores); gates -- the openings in them, where nobody overtakes
// and which a unit walled off from its route makes for (aimPoint), and
// level 4's bridges; barriers --
// the player's wall blocks, which stop a unit that drives into one: it then
// reports { blockedBy: that block's id } so simulate.js has it shoot the
// block down; turnFirst -- facing more than a right angle away from its
// way, the unit turns round before it swerves round anyone (the attack
// mode's units, which set off from a standstill in any direction: swerving
// round units parked ahead while still facing away flipped them from side
// to side every tick, so they never turned round and drove off the road;
// the defence game, tuned without it, keeps its driving as it was).
export function stepEnemy(enemy, dt, { others = [], hold = false, walls = null, gates = [], barriers = [], turnFirst = false } = {}) {
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
  // Braking looks the full distance ahead to see a bend coming; steering
  // aims closer in the slower the unit is going (LOOK_MIN).
  const far = pointAhead(enemy, t, h.look);
  const speedFrac = cruise > 0 ? Math.min(1, (enemy.v ?? cruise) / cruise) : 1;
  const look = speedFrac < 1 ? pointAhead(enemy, t, Math.max(LOOK_MIN, h.look * speedFrac)) : far;
  // The route's direction here, and how far right of it the unit is.
  const a = enemy.path[enemy.waypointIndex];
  const b = enemy.path[enemy.waypointIndex + 1];
  const segLen = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / segLen;
  const uy = (b.y - a.y) / segLen;
  const offset = ux * (enemy.y - a.y) - uy * (enemy.x - a.x);
  const avoid = avoidance(enemy, others, ux, uy, cruise, offset, gates);
  const { follow } = avoid;
  const facingAway = turnFirst && Math.abs(angleDiff(enemy.angle, Math.atan2(look.y - enemy.y, look.x - enemy.x))) > Math.PI / 2;
  const shift = facingAway ? 0 : avoid.shift;
  const near = barriers.filter((w) => w.hp > 0 && Math.hypot(w.x - enemy.x, w.y - enemy.y) < BARRIER_SCAN);
  let aim = aimPoint(enemy, look, shift, walls, gates);
  if (near.length) aim = aroundBarriers(enemy, aim, pointAhead(enemy, t, h.look + 50), near);
  const err = angleDiff(enemy.angle, Math.atan2(aim.y - enemy.y, aim.x - enemy.x));
  const maxTurn = h.turn * dt;
  enemy.angle += Math.max(-maxTurn, Math.min(maxTurn, err));

  let targetSpeed = 0;
  if (!hold) {
    // How sharply the road itself turns between here and a full look-ahead
    // on -- measured off the route, not the heading, which already starts
    // turning in early and would make every bend look gentler than it is.
    const bend = Math.abs(angleDiff(Math.atan2(uy, ux), Math.atan2(far.uy, far.ux)));
    // Slow for the road's own bends, and for a turn sharp enough to need it
    // (past TURN_FREE) -- but not for the small swerves round other units:
    // braking for those had a whole crowd dawdling as they weaved past
    // each other.
    const sharpTurn = Math.max(0, Math.abs(err) - TURN_FREE);
    const corner = 1 - CORNER_SLOWDOWN * Math.min(1, Math.max(bend, sharpTurn) / (Math.PI / 2));
    targetSpeed = Math.min(cruise * corner, follow);
  }
  const v = enemy.v ?? enemy.speed;
  enemy.v = v < targetSpeed ? Math.min(targetSpeed, v + h.accel * dt) : Math.max(targetSpeed, v - h.brake * dt);
  const to = { x: enemy.x + Math.cos(enemy.angle) * enemy.v * dt, y: enemy.y + Math.sin(enemy.angle) * enemy.v * dt };
  // A move that would push the unit's body into a wall block (or deeper
  // into one it's already touching) doesn't happen: it's held up there.
  const blocker = near.find((w) => {
    const gap = gapToBlock(enemy.type, to.x, to.y, enemy.angle, w);
    return gap < 0 && gap < gapToBlock(enemy.type, enemy.x, enemy.y, enemy.angle, w);
  });
  if (blocker) {
    enemy.v = 0;
    return { reachedEnd: false, blockedBy: blocker.id };
  }
  if (walls && crossesWall(enemy, to, walls)) {
    // Up against the wall: it stops dead there, still turning toward its
    // aim (aimPoint keeps that on this side), and pulls away once it faces
    // a way it can actually go.
    enemy.v = 0;
  } else {
    enemy.x = to.x;
    enemy.y = to.y;
  }
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

// barriers: the player's wall blocks -- a unit held up by one (blockedBy,
// set by simulate.js from stepEnemy) shoots that down first.
export function stepEnemyFire(enemy, towers, dt, barriers = []) {
  if (!enemy.alive) return null;
  enemy.fireTimer -= dt;
  if (enemy.fireTimer > 0) return null;

  const wall = enemy.blockedBy != null ? barriers.find((w) => w.id === enemy.blockedBy && w.hp > 0) : null;
  const best = wall || pickTowerTarget(enemy, towers);
  if (!best) return null;

  enemy.fireTimer = enemy.fireCooldown;
  return { x: enemy.x, y: enemy.y, target: best, damage: enemy.fireDamage };
}
