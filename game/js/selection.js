// Picking the army's units with the mouse, and the numbered groups, the
// Command & Conquer way (docs/2026-10-09-modo-atacante-design.md §4, per
// user request: «seleccionar al ejército con el ratón y hacer grupos
// pulsando Control + número»). Pure logic on lists of units and sets of
// ids; attackControls.js wires it to the mouse and the keyboard.
import { FOOTPRINT } from "./enemy.js";

// Extra px round a unit's body that still count as clicking it, so a small
// soldier isn't fiddly to pick.
const CLICK_SLACK = 6;

// The unit under (x, y), if any -- its body being a box as long and wide
// as the unit, turned the way it faces -- the nearest if several.
export function unitAt(units, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const u of units) {
    if (!u.alive) continue;
    const [len, wid] = FOOTPRINT[u.type] || [30, 30];
    const dx = x - u.x;
    const dy = y - u.y;
    const c = Math.cos(u.angle || 0);
    const s = Math.sin(u.angle || 0);
    const along = dx * c + dy * s;
    const across = dy * c - dx * s;
    if (Math.abs(along) > len / 2 + CLICK_SLACK || Math.abs(across) > wid / 2 + CLICK_SLACK) continue;
    const d = Math.hypot(dx, dy);
    if (d < bestD) {
      best = u;
      bestD = d;
    }
  }
  return best;
}

// The units inside the box between two corners, in either order.
export function unitsInBox(units, x0, y0, x1, y1) {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  return units.filter((u) => u.alive && u.x >= left && u.x <= right && u.y >= top && u.y <= bottom);
}

// The selection after a click or a box picked `picked` (ids): on its own
// it replaces the selection; with Shift a click toggles its unit, and a box
// adds its units -- or takes them out, if they were all selected already.
// A new set; `selected` is left as it was.
export function applyPick(selected, picked, { shift = false, box = false } = {}) {
  if (!shift) return new Set(picked);
  const next = new Set(selected);
  if (!box) {
    for (const id of picked) {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    }
    return next;
  }
  const allIn = picked.length > 0 && picked.every((id) => next.has(id));
  for (const id of picked) {
    if (allIn) next.delete(id);
    else next.add(id);
  }
  return next;
}

// A double click: every unit of that type in view ({ x, y, w, h }).
export function sameTypeInView(units, type, view) {
  return units
    .filter((u) => u.alive && u.type === type && u.x >= view.x && u.x <= view.x + view.w && u.y >= view.y && u.y <= view.y + view.h)
    .map((u) => u.id);
}

// The numbered groups: Ctrl/Alt + n keeps the selection as group n (a unit
// is in one group at most: put in another, it leaves the old one), n picks
// it again -- without the units destroyed since.
export function createGroups() {
  const groups = new Map();
  return {
    assign(n, ids) {
      for (const members of groups.values()) for (const id of ids) members.delete(id);
      groups.set(n, new Set(ids));
    },
    members(n, units) {
      const members = groups.get(n);
      if (!members) return [];
      const alive = new Set(units.filter((u) => u.alive).map((u) => u.id));
      for (const id of [...members]) if (!alive.has(id)) members.delete(id);
      return [...members];
    },
    groupOf(id) {
      for (const [n, members] of groups) if (members.has(id)) return n;
      return null;
    },
    clear() {
      groups.clear();
    },
  };
}

// A group's number pressed twice within this many seconds: the camera
// goes to the group.
export const DOUBLE_PRESS = 0.5;

export function isDoublePress(last, key, now) {
  return Boolean(last) && last.key === key && now - last.time <= DOUBLE_PRESS;
}

// What a key means in an attack: Ctrl (or Alt -- browsers keep Ctrl + a
// number for switching tabs) + 1-9 keeps the selection as that group, 1-9
// picks it, S stops; anything else is null. By the key's place (`code`),
// so Alt or Shift changing the character it types doesn't matter.
export function attackKey(evt) {
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(evt.code || "") || /^([1-9])$/.exec(evt.key || "");
  if (digit) {
    const n = Number(digit[1]);
    return evt.ctrlKey || evt.altKey || evt.metaKey ? { kind: "assign", n } : { kind: "select", n };
  }
  const isS = evt.code === "KeyS" || (evt.key || "").toLowerCase() === "s";
  if (isS && !evt.ctrlKey && !evt.altKey && !evt.metaKey) return { kind: "stop" };
  return null;
}
