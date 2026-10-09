import { test } from "node:test";
import assert from "node:assert/strict";
import { createAttackControls } from "./attackControls.js";
import { createAttackState, buyUnits, startAttack, BASE_CLICK_RADIUS } from "./attack.js";
import { attackMapOf } from "./roadGraph.js";
import { levelData } from "./levels.js";
import { createTower } from "./tower.js";
import { assignId } from "./ids.js";

// The controls on level 2 against an empty defence, on a 1200 x 750
// canvas shown at its own size (client px = canvas px), the camera at
// `camera` and `zoom`.
function setup({ zoom = 1, camera = { x: 0, y: 0 }, autoArmy = false, orders = null } = {}) {
  const state = createAttackState(2, "normal", { aiSetup: false });
  state.economy.money = 0;
  const map = attackMapOf(levelData(2));
  const cam = { ...camera };
  let clock = 0;
  const refused = [];
  const env = {
    getState: () => state,
    worldAt: (evt) => ({ x: evt.clientX / zoom + cam.x, y: evt.clientY / zoom + cam.y }),
    canvasAt: (evt) => ({ x: evt.clientX, y: evt.clientY }),
    view: () => ({ x: cam.x, y: cam.y, w: 1200 / zoom, h: 750 / zoom }),
    canvasSize: { w: 1200, h: 750 },
    clientToCanvas: () => 1,
    panCanvas: (dx, dy) => {
      cam.x += dx / zoom;
      cam.y += dy / zoom;
    },
    centerOn: () => {},
    entries: () => map.entries,
    base: () => map.base,
    now: () => clock,
    onRefused: () => refused.push(true),
    autoArmy: () => autoArmy,
  };
  if (orders) env.orders = orders;
  const controls = createAttackControls(env);
  // A pointer event at world point p.
  const at = (p, extra = {}) => ({
    clientX: (p.x - cam.x) * zoom,
    clientY: (p.y - cam.y) * zoom,
    button: 0,
    pointerType: "mouse",
    target: {},
    preventDefault() {},
    ...extra,
  });
  const click = (p, extra = {}) => {
    controls.pointerDown(at(p, extra));
    controls.pointerUp(at(p, extra));
  };
  const drag = (from, to, extra = {}) => {
    controls.pointerDown(at(from, extra));
    controls.pointerMove(at({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, extra));
    controls.pointerMove(at(to, extra));
    controls.pointerUp(at(to, extra));
  };
  return { state, map, cam, controls, click, drag, refused, tick: (s) => (clock += s) };
}

const picked = (controls) => [...controls.selectedIds()].sort((a, b) => a - b);

test("a left click on a unit picks it; a left click on the ground then sends it there", () => {
  const { state, controls, click } = setup();
  buyUnits(state, "soldier", 2);
  const [a, b] = state.enemies;
  click(a);
  assert.deepEqual(picked(controls), [a.id]);
  click({ x: 457, y: 191 });
  assert.equal(a.order?.kind, "move");
  assert.equal(b.order, null);
  assert.deepEqual(picked(controls), [a.id]); // still picked
  assert.equal(controls.markers().at(-1).kind, "move");
});

test("a left click on the ground with nothing picked does nothing", () => {
  const { state, controls, click, refused } = setup();
  buyUnits(state, "soldier", 2);
  click({ x: 457, y: 191 });
  assert.ok(state.enemies.every((u) => u.order === null));
  assert.equal(controls.markers().length, 0);
  assert.equal(refused.length, 0);
});

test("a left click on another unit picks that one instead of ordering", () => {
  const { state, controls, click } = setup();
  buyUnits(state, "soldier", 2);
  const [a, b] = state.enemies;
  click(a);
  click(b);
  assert.deepEqual(picked(controls), [b.id]);
  assert.equal(a.order, null);
});

// Per user request («no puedo seleccionar unidades con el recuadro»): the
// units bought wait by their entry's flag, and a press there to start a box
// was taken as a click on the flag -- the further out the map was zoomed,
// the wider the flag's reach.
test("a left drag boxes units in, even one starting on the entry's flag, zoomed right out", () => {
  const zoom = 0.3;
  const { state, map, controls, drag } = setup({ zoom, camera: { x: -400, y: -300 } });
  buyUnits(state, "soldier", 6);
  const entry = map.entries[state.attack.entry];
  const flag = { x: entry.x + 6 / zoom, y: entry.y - 22 / zoom }; // where attackDraw.js puts it
  const xs = state.enemies.map((u) => u.x);
  const ys = state.enemies.map((u) => u.y);
  assert.ok(flag.x < Math.min(...xs) && flag.y < Math.min(...ys)); // the units are below and right of it
  drag(flag, { x: Math.max(...xs) + 20, y: Math.max(...ys) + 20 });
  assert.equal(controls.selectedIds().size, 6);
});

test("a left drag over some of a group picks just those", () => {
  const { state, controls, drag } = setup();
  buyUnits(state, "soldier", 6);
  drag({ x: 0, y: 0 }, { x: 1200, y: 750 });
  assert.equal(controls.selectedIds().size, 6);
  controls.keyDown({ code: "Digit1", key: "1", ctrlKey: true, preventDefault() {} });
  const [a, b] = state.enemies;
  drag({ x: Math.min(a.x, b.x) - 3, y: Math.min(a.y, b.y) - 3 }, { x: Math.max(a.x, b.x) + 3, y: Math.max(a.y, b.y) + 3 });
  const inBox = state.enemies.filter((u) => u.x >= Math.min(a.x, b.x) - 3 && u.x <= Math.max(a.x, b.x) + 3 && u.y >= Math.min(a.y, b.y) - 3 && u.y <= Math.max(a.y, b.y) + 3);
  assert.deepEqual(picked(controls), inBox.map((u) => u.id).sort((p, q) => p - q));
  assert.ok(controls.selectedIds().size < 6);
  assert.equal(controls.groupOf(a.id), 1); // still in group 1
});

test("a plain left click on an entry's flag makes it the active entry", () => {
  const { state, map, controls, click } = setup();
  assert.ok(map.entries.length > 1);
  const other = state.attack.entry === 0 ? 1 : 0;
  const e = map.entries[other];
  click({ x: e.x + 6, y: e.y - 22 });
  assert.equal(state.attack.entry, other);
  assert.equal(controls.selectedIds().size, 0);
});

test("a right click lets go of the selection; a right drag pans the map and keeps it", () => {
  const { state, cam, controls, click } = setup();
  buyUnits(state, "soldier", 2);
  const [a] = state.enemies;
  click(a);
  const right = { button: 2 };
  const from = { x: 600, y: 400 };
  controls.pointerDown({ clientX: 600, clientY: 400, button: 2, pointerType: "mouse", target: {}, preventDefault() {} });
  controls.pointerMove({ clientX: 500, clientY: 350, button: -1, pointerType: "mouse", target: {}, preventDefault() {} });
  controls.pointerUp({ clientX: 500, clientY: 350, button: 2, pointerType: "mouse", target: {}, preventDefault() {} });
  assert.deepEqual(cam, { x: 100, y: 50 });
  assert.deepEqual(picked(controls), [a.id]);
  assert.equal(a.order, null);
  click(from, right);
  assert.equal(controls.selectedIds().size, 0);
  assert.equal(a.order, null);
});

test("Ctrl + click adds a unit to the selection, like Shift", () => {
  const { state, controls, click } = setup();
  buyUnits(state, "soldier", 3);
  const [a, b, c] = state.enemies;
  click(a);
  click(b, { ctrlKey: true });
  click(c, { shiftKey: true });
  assert.deepEqual(picked(controls), [a.id, b.id, c.id]);
  click(b, { ctrlKey: true });
  assert.deepEqual(picked(controls), [a.id, c.id]);
});

test("zoomed right out, a click on the base's mark sends the units in", () => {
  const { state, map, controls, click } = setup({ zoom: 0.3, camera: { x: -400, y: -300 } });
  buyUnits(state, "soldier", 2);
  const [a] = state.enemies;
  click(a);
  // further than BASE_CLICK_RADIUS in the world, but within the mark on screen
  const p = { x: map.base.x + BASE_CLICK_RADIUS + 20, y: map.base.y };
  assert.equal(controls.hoverOrder(), null);
  controls.pointerMove({ clientX: (p.x + 400) * 0.3, clientY: (p.y + 300) * 0.3, pointerType: "mouse" });
  assert.equal(controls.hoverOrder(), "enter");
  click(p);
  assert.equal(a.order?.kind, "enter");
  assert.equal(controls.markers().at(-1).kind, "attack");
});

test("a left click on a tower the player can see sends the units against it", () => {
  const { state, controls, click } = setup();
  buyUnits(state, "tank", 1);
  const t = assignId(createTower("basic", 457, 230));
  t.buildTimeRemaining = 0;
  state.towers.push(t);
  const [u] = state.enemies;
  startAttack(state);
  // the whole map in sight, the tower with it
  state.attack.fog.visible.fill(1);
  state.attack.fog.explored.fill(1);
  click(u);
  click({ x: t.x + 5, y: t.y });
  assert.equal(u.order?.kind, "attack");
  assert.equal(u.order.targetId, t.id);
});

test("the pointer at the screen's edge, or gone out of the window across it, pans the map", () => {
  const { cam, controls } = setup();
  controls.pointerAt({ x: 600, y: 400 });
  controls.update(0.1);
  assert.deepEqual(cam, { x: 0, y: 0 });
  controls.pointerAt({ x: 5, y: 400 });
  controls.update(0.1);
  assert.ok(cam.x < 0 && cam.y === 0);
  const x = cam.x;
  controls.pointerAt({ x: 1300, y: -40 }); // out of the window, up and to the right
  controls.update(0.1);
  assert.ok(cam.x > x && cam.y < 0);
  const moved = { ...cam };
  controls.pointerAt(null); // over a panel, or the window left behind
  controls.update(0.1);
  assert.deepEqual(cam, moved);
});

test("with the automatic army, a left click neither picks nor orders, and a drag pans", () => {
  const { state, cam, controls, click } = setup({ autoArmy: true });
  buyUnits(state, "soldier", 2);
  const [a] = state.enemies;
  click(a);
  assert.equal(controls.selectedIds().size, 0);
  controls.pointerDown({ clientX: 600, clientY: 400, button: 0, pointerType: "mouse", target: {}, preventDefault() {} });
  controls.pointerMove({ clientX: 560, clientY: 400, button: -1, pointerType: "mouse", target: {}, preventDefault() {} });
  controls.pointerUp({ clientX: 560, clientY: 400, button: 0, pointerType: "mouse", target: {}, preventDefault() {} });
  assert.equal(cam.x, 40);
  assert.equal(controls.hoverOrder(), null);
});

// On the home network the orders go to the server (main.js's env.orders):
// nothing is carried out here, and the marks still show at once.
test("with orders of their own to give them to, the controls carry nothing out themselves", () => {
  const sent = [];
  const orders = {
    move: (ids, x, y) => sent.push(["move", ids, Math.round(x), Math.round(y)]),
    attack: (ids, targetId) => sent.push(["attack", ids, targetId]),
    enter: (ids) => sent.push(["enter", ids]),
    stop: (ids) => sent.push(["stop", ids]),
    entry: (index) => sent.push(["entry", index]),
  };
  const { state, map, controls, click } = setup({ orders });
  buyUnits(state, "soldier", 1);
  const [a] = state.enemies;
  click(a);
  click({ x: 457, y: 191 });
  click(map.base);
  controls.keyDown({ code: "KeyS", key: "s", preventDefault() {} });
  const other = state.attack.entry === 0 ? 1 : 0;
  const e = map.entries[other];
  click({ x: e.x + 6, y: e.y - 22 });
  assert.deepEqual(sent, [["move", [a.id], 457, 191], ["enter", [a.id]], ["stop", [a.id]], ["entry", other]]);
  assert.equal(a.order, null);
  assert.equal(state.attack.entry === other, false);
  assert.deepEqual(controls.markers().map((m) => m.kind), ["move", "attack"]);
});
