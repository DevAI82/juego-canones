// The attack mode's mouse, keyboard and touch, the classic Command &
// Conquer way (docs/2026-10-09-modo-atacante-design.md §4): everything with
// the left button, per user request («el botón derecho abre muchas veces un
// menú de opciones ... mejor que se muevan usando el botón izquierdo»). A
// left click on a unit picks it, a left drag boxes units in (Shift or Ctrl
// adds or takes out, a double click picks that type on screen); with units
// picked, a left click elsewhere is their order -- on the ground go there,
// on a tower or wall block the player knows of attack it, on the base go
// in. A left click on an entry's flag makes it the active entry. The right
// button lets go of the selection with a click and drags the map, like C&C
// Generals; so does the middle one, and so does the pointer at the screen's
// edges (main.js tells it where the pointer is, even off the map or out of
// the window). Ctrl or Alt + 1-9 keep a group and 1-9 pick it (twice: look
// at it); S stops; Esc lets go. The arrow keys, the wheel and the minimap
// stay main.js's. On a touch screen a tap on a unit picks it, a tap
// elsewhere orders the selection there, and a drag pans.
//
// With the phone's automatic army (env.autoArmy(), inputMode.js) the army
// takes no orders from the player: a drag -- finger or mouse -- pans, and
// taps, clicks, the entry flags and the group keys do nothing.
//
// main.js creates it once with what it needs (`env`) and hands it its
// canvas events while an attack is on; it keeps the selection, the groups,
// the box and the order marks, and draws nothing itself (attackDraw.js).
import { unitAt, unitsInBox, applyPick, sameTypeInView, createGroups, isDoublePress, attackKey } from "./selection.js";
import { orderMove, orderAttack, orderEnter, orderStop, setEntry, BASE_CLICK_RADIUS } from "./attack.js";
import { knownStructure } from "./fog.js";
import { MARKER_TIME } from "./attackDraw.js";

const BOX_THRESHOLD = 6; // canvas px a press moves before it's a box, not a click
const TAP_THRESHOLD = 12; // client px a touch or right press moves before it's a pan
const DOUBLE_CLICK = 0.35; // s between two clicks on a unit for a double click
const EDGE = 18; // canvas px from the screen's edge that pan the map
const EDGE_SPEED = 700; // canvas px per second, like the arrow keys
const FLAG_REACH = 22; // canvas px round an entry's flag that pick it
const STRUCTURE_REACH = 38; // world px round a tower's centre that pick it
// Canvas px round the base's mark that count as clicking it, however far
// out the map is zoomed (BASE_CLICK_RADIUS is world px).
const BASE_SCREEN_REACH = 40;

export function createAttackControls(env) {
  let selected = new Set();
  const groups = createGroups();
  let box = null; // { x0, y0, x1, y1 (canvas px), start (world), shift, flag, active }
  let pan = null; // middle-button drag: the last client point
  let rightPan = null; // right-button press: { x, y (client), moved }
  let touch = null; // { x, y (client), moved }
  let lastClick = null; // { id, time }
  let lastGroupPress = null;
  let edge = null; // where the pointer is for edge panning (canvas px; off the canvas too)
  let hover = null; // world point under the pointer
  const markers = [];

  const auto = () => Boolean(env.autoArmy?.());
  const units = () => env.getState().enemies;
  const alive = () => new Set(units().filter((u) => u.alive).map((u) => u.id));
  const adding = (evt) => Boolean(evt.shiftKey || evt.ctrlKey || evt.metaKey);
  const worldPerCanvas = () => env.view().w / env.canvasSize.w;

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

  // Whether world point p is on the base's mark.
  function onBase(p) {
    const base = env.base();
    const reach = Math.max(BASE_CLICK_RADIUS, BASE_SCREEN_REACH * worldPerCanvas());
    return Math.hypot(p.x - base.x, p.y - base.y) <= reach;
  }

  // What a click at world point p would do with the units picked now:
  // "attack" a structure, "enter" the base or "move" there (null with
  // nothing picked).
  function orderKind(p) {
    if (!pruned().size) return null;
    if (onBase(p)) return "enter";
    return structureAt(p) ? "attack" : "move";
  }

  // A click (or a tap) at world point `p`: the selection's order, and a
  // mark where it was given.
  function orderAt(p) {
    const ids = [...pruned()];
    if (!ids.length) return;
    const state = env.getState();
    const kind = orderKind(p);
    const result =
      kind === "enter"
        ? orderEnter(state, ids)
        : kind === "attack"
          ? orderAttack(state, ids, structureAt(p).id)
          : orderMove(state, ids, p.x, p.y);
    if (!result.ok) {
      env.onRefused();
      return;
    }
    // A move's mark where the player clicked; an attack's (or the base's) on its target.
    const at = result.stops ? p : result.target;
    markers.push({ x: at.x, y: at.y, kind: result.stops ? "move" : "attack", t: env.now() });
  }

  // The entry whose flag (drawn above it, attackDraw.js) is at world point
  // p, or -1.
  function flagAt(p) {
    const k = worldPerCanvas();
    return env.entries().findIndex((e) => Math.hypot(e.x + 6 * k - p.x, e.y - 22 * k - p.y) <= FLAG_REACH * k);
  }

  // A left click (no drag) at world point p: on a unit, pick it (twice
  // quickly: its type on screen); on a flag, that entry; elsewhere, the
  // selection's order.
  function click(p, shift, flag) {
    const u = unitAt(units(), p.x, p.y);
    if (!u) {
      lastClick = null;
      if (flag >= 0) setEntry(env.getState(), flag);
      else orderAt(p);
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
    // What a left click under the pointer would do now -- "pick" a unit, or
    // an order (orderKind) -- for the pointer's look and the base's «ENTRAR».
    hoverOrder() {
      if (!hover || auto() || box?.active) return null;
      return unitAt(units(), hover.x, hover.y) ? "pick" : orderKind(hover);
    },
    orderAt,

    // A new game, or back from the menu: nothing selected or marked.
    reset() {
      selected = new Set();
      groups.clear();
      box = null;
      pan = null;
      rightPan = null;
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
        rightPan = { x: evt.clientX, y: evt.clientY, moved: false };
        evt.target.setPointerCapture?.(evt.pointerId);
        return;
      }
      if (evt.button !== 0) return;
      if (evt.pointerType === "touch" || auto()) {
        touch = { x: evt.clientX, y: evt.clientY, moved: false };
        return;
      }
      const c = env.canvasAt(evt);
      box = { x0: c.x, y0: c.y, x1: c.x, y1: c.y, start: p, shift: adding(evt), flag: flagAt(p), active: false };
      evt.target.setPointerCapture?.(evt.pointerId);
    },

    pointerMove(evt) {
      const c = env.canvasAt(evt);
      hover = evt.pointerType === "touch" ? null : env.worldAt(evt);
      if (pan) {
        const k = env.clientToCanvas();
        env.panCanvas(-(evt.clientX - pan.x) * k, -(evt.clientY - pan.y) * k);
        pan = { x: evt.clientX, y: evt.clientY };
        return;
      }
      const drag = touch || rightPan;
      if (drag) {
        const dx = evt.clientX - drag.x;
        const dy = evt.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < TAP_THRESHOLD) return;
        drag.moved = true;
        const k = env.clientToCanvas();
        env.panCanvas(-dx * k, -dy * k);
        drag.x = evt.clientX;
        drag.y = evt.clientY;
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
      if (rightPan && evt.button === 2) {
        // A right click, not a drag: let go of the selection.
        if (!rightPan.moved) selected = new Set();
        rightPan = null;
        return;
      }
      const p = env.worldAt(evt);
      if (touch) {
        const tapped = !touch.moved;
        touch = null;
        if (!tapped || auto()) return;
        const u = unitAt(units(), p.x, p.y);
        if (u) selected = new Set([u.id]);
        else orderAt(p);
        return;
      }
      if (!box) return;
      const b = box;
      box = null;
      if (!b.active) {
        click(b.start, b.shift, b.flag);
        return;
      }
      const picked = unitsInBox(units(), b.start.x, b.start.y, p.x, p.y).map((u) => u.id);
      selected = applyPick(selected, picked, { shift: b.shift, box: true });
    },

    // A second finger came down (main.js's pinch zoom): the first one's
    // touch is neither a pan nor a tap any more.
    cancelTouch() {
      touch = null;
      box = null;
    },

    pointerLeave() {
      hover = null;
    },

    // Where the pointer is, in canvas px, for panning at the screen's
    // edges: anywhere in the window -- off the canvas's edge too, or just
    // gone out of the window across it -- or null (over a panel, a menu
    // open, the window left behind).
    pointerAt(point) {
      edge = point;
    },

    // Ctrl/Alt + 1-9, 1-9, S. True if the key was the attack mode's.
    keyDown(evt) {
      if (auto()) return false;
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
      if (edge && !box?.active && !pan && !rightPan?.moved) {
        const dx = edge.x < EDGE ? -1 : edge.x > env.canvasSize.w - EDGE ? 1 : 0;
        const dy = edge.y < EDGE ? -1 : edge.y > env.canvasSize.h - EDGE ? 1 : 0;
        if (dx || dy) env.panCanvas(dx * EDGE_SPEED * dt, dy * EDGE_SPEED * dt);
      }
      const now = env.now();
      while (markers.length && now - markers[0].t > MARKER_TIME) markers.shift();
    },
  };
}
