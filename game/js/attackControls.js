// The attack mode's mouse, keyboard and touch, Command & Conquer style
// (docs/2026-10-09-modo-atacante-design.md §4): left click or drag a box
// to select (Shift adds or takes out, a double click picks that type on
// screen, a click on the ground lets go); right click to order -- on the
// ground go there, on a tower or wall block the player knows of attack it,
// on the base go in; Ctrl or Alt + 1-9 keep a group and 1-9 pick it (twice:
// look at it); S stops; Esc lets go. The camera pans at the screen's edges
// and by dragging with the middle button (the arrow keys, the wheel and the
// minimap stay main.js's). On a touch screen a tap on a unit picks it, a tap
// elsewhere orders the selection there, and a drag pans.
//
// main.js creates it once with what it needs (`env`) and hands it its
// canvas events while an attack is on; it keeps the selection, the groups,
// the box and the order marks, and draws nothing itself (attackDraw.js).
import { unitAt, unitsInBox, applyPick, sameTypeInView, createGroups, isDoublePress, attackKey } from "./selection.js";
import { orderMove, orderAttack, orderStop, setEntry } from "./attack.js";
import { knownStructure } from "./fog.js";
import { MARKER_TIME } from "./attackDraw.js";

const BOX_THRESHOLD = 6; // canvas px a press moves before it's a box, not a click
const TAP_THRESHOLD = 12; // client px a touch moves before it's a pan, not a tap
const DOUBLE_CLICK = 0.35; // s between two clicks on a unit for a double click
const EDGE = 14; // canvas px from the screen's edge that pan the map
const EDGE_SPEED = 700; // canvas px per second, like the arrow keys
const FLAG_REACH = 22; // canvas px round an entry's flag that pick it
const STRUCTURE_REACH = 38; // world px round a tower's centre that pick it

export function createAttackControls(env) {
  let selected = new Set();
  const groups = createGroups();
  let box = null; // { x0, y0, x1, y1 (canvas px), start (world), shift, active }
  let pan = null; // middle-button drag: the last client point
  let touch = null; // { x, y (client), moved }
  let lastClick = null; // { id, time }
  let lastGroupPress = null;
  let mouse = null; // canvas px, while the pointer is over the map
  let hover = null; // world point under the pointer
  const markers = [];

  const units = () => env.getState().enemies;
  const alive = () => new Set(units().filter((u) => u.alive).map((u) => u.id));

  // The selection without the units destroyed since.
  function pruned() {
    const living = alive();
    for (const id of [...selected]) if (!living.has(id)) selected.delete(id);
    return selected;
  }

  // The tower or wall block at `p` that the player knows of (in sight, or
  // remembered under the grey fog) -- only those can be ordered attacked.
  function structureAt(p) {
    const state = env.getState();
    const fog = state.attack.fog;
    let best = null;
    let bestD = STRUCTURE_REACH;
    for (const t of state.towers) {
      if (t.hp <= 0 || !knownStructure(fog, t)) continue;
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d < bestD) {
        best = t;
        bestD = d;
      }
    }
    if (best) return best;
    return state.walls.find((w) => w.hp > 0 && knownStructure(fog, w) && Math.abs(w.x - p.x) <= 16 && Math.abs(w.y - p.y) <= 16) || null;
  }

  // A right click (or a tap) at world point `p`: the selection's order, and
  // a mark where it was given.
  function orderAt(p) {
    const ids = [...pruned()];
    if (!ids.length) return;
    const state = env.getState();
    const target = structureAt(p);
    const result = target ? orderAttack(state, ids, target.id) : orderMove(state, ids, p.x, p.y);
    if (!result.ok) {
      env.onRefused();
      return;
    }
    const at = result.stops ? result.stops[0] : result.target;
    markers.push({ x: at.x, y: at.y, kind: result.stops ? "move" : "attack", t: env.now() });
  }

  // The entry whose flag (drawn above it, attackDraw.js) is at world point
  // p, or -1.
  function flagAt(p) {
    const k = env.view().w / env.canvasSize.w; // world px per canvas px
    return env.entries().findIndex((e) => Math.hypot(e.x + 6 * k - p.x, e.y - 22 * k - p.y) <= FLAG_REACH * k);
  }

  function pickClick(p, shift) {
    const u = unitAt(units(), p.x, p.y);
    if (!u) {
      if (!shift) selected = new Set();
      lastClick = null;
      return;
    }
    const now = env.now();
    if (lastClick && lastClick.id === u.id && now - lastClick.time <= DOUBLE_CLICK) {
      selected = applyPick(selected, sameTypeInView(units(), u.type, env.view()), { shift, box: true });
      lastClick = null;
      return;
    }
    lastClick = { id: u.id, time: now };
    selected = applyPick(selected, [u.id], { shift });
  }

  return {
    selected: () => units().filter((u) => pruned().has(u.id)),
    selectedIds: () => pruned(),
    groupOf: (id) => groups.groupOf(id),
    box: () => (box && box.active ? box : null),
    markers: () => markers,
    hoverWorld: () => hover,
    orderAt,

    // A new game, or back from the menu: nothing selected or marked.
    reset() {
      selected = new Set();
      groups.clear();
      box = null;
      pan = null;
      touch = null;
      lastClick = null;
      lastGroupPress = null;
      markers.length = 0;
    },

    pointerDown(evt) {
      const p = env.worldAt(evt);
      if (evt.button === 1) {
        pan = { x: evt.clientX, y: evt.clientY };
        evt.preventDefault();
        evt.target.setPointerCapture?.(evt.pointerId);
        return;
      }
      if (evt.button === 2) {
        orderAt(p);
        return;
      }
      if (evt.button !== 0) return;
      if (evt.pointerType === "touch") {
        touch = { x: evt.clientX, y: evt.clientY, moved: false };
        return;
      }
      const flag = flagAt(p);
      if (flag >= 0) {
        setEntry(env.getState(), flag);
        return;
      }
      const c = env.canvasAt(evt);
      box = { x0: c.x, y0: c.y, x1: c.x, y1: c.y, start: p, shift: evt.shiftKey, active: false };
      evt.target.setPointerCapture?.(evt.pointerId);
    },

    pointerMove(evt) {
      const c = env.canvasAt(evt);
      mouse = evt.pointerType === "touch" ? null : c;
      hover = env.worldAt(evt);
      if (pan) {
        const k = env.clientToCanvas();
        env.panCanvas(-(evt.clientX - pan.x) * k, -(evt.clientY - pan.y) * k);
        pan = { x: evt.clientX, y: evt.clientY };
        return;
      }
      if (touch) {
        const dx = evt.clientX - touch.x;
        const dy = evt.clientY - touch.y;
        if (!touch.moved && Math.hypot(dx, dy) < TAP_THRESHOLD) return;
        touch.moved = true;
        const k = env.clientToCanvas();
        env.panCanvas(-dx * k, -dy * k);
        touch.x = evt.clientX;
        touch.y = evt.clientY;
        return;
      }
      if (box) {
        box.x1 = c.x;
        box.y1 = c.y;
        if (Math.hypot(box.x1 - box.x0, box.y1 - box.y0) >= BOX_THRESHOLD) box.active = true;
      }
    },

    pointerUp(evt) {
      if (pan && evt.button === 1) {
        pan = null;
        return;
      }
      const p = env.worldAt(evt);
      if (touch) {
        const tapped = !touch.moved;
        touch = null;
        if (!tapped) return;
        const u = unitAt(units(), p.x, p.y);
        if (u) selected = new Set([u.id]);
        else orderAt(p);
        return;
      }
      if (!box) return;
      const b = box;
      box = null;
      if (!b.active) {
        pickClick(p, b.shift);
        return;
      }
      const picked = unitsInBox(units(), b.start.x, b.start.y, p.x, p.y).map((u) => u.id);
      selected = applyPick(selected, picked, { shift: b.shift, box: true });
    },

    pointerLeave() {
      mouse = null;
      hover = null;
    },

    // Ctrl/Alt + 1-9, 1-9, S. True if the key was the attack mode's.
    keyDown(evt) {
      const key = attackKey(evt);
      if (!key) return false;
      evt.preventDefault();
      const state = env.getState();
      if (key.kind === "assign") {
        groups.assign(key.n, [...pruned()]);
        return true;
      }
      if (key.kind === "stop") {
        if (pruned().size) orderStop(state, [...selected]);
        return true;
      }
      const ids = groups.members(key.n, units());
      if (!ids.length) return true;
      selected = new Set(ids);
      const now = env.now();
      if (isDoublePress(lastGroupPress, key.n, now)) {
        const members = units().filter((u) => selected.has(u.id));
        env.centerOn({
          x: members.reduce((sum, u) => sum + u.x, 0) / members.length,
          y: members.reduce((sum, u) => sum + u.y, 0) / members.length,
        });
      }
      lastGroupPress = { key: key.n, time: now };
      return true;
    },

    // Esc: lets go of the selection, if there is one.
    escape() {
      if (!pruned().size) return false;
      selected = new Set();
      return true;
    },

    // Every frame: the screen's edges pan the map, and old marks go.
    update(dt) {
      if (mouse && !box?.active && !pan) {
        const dx = mouse.x < EDGE ? -1 : mouse.x > env.canvasSize.w - EDGE ? 1 : 0;
        const dy = mouse.y < EDGE ? -1 : mouse.y > env.canvasSize.h - EDGE ? 1 : 0;
        if (dx || dy) env.panCanvas(dx * EDGE_SPEED * dt, dy * EDGE_SPEED * dt);
      }
      const now = env.now();
      while (markers.length && now - markers[0].t > MARKER_TIME) markers.shift();
    },
  };
}
