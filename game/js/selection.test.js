import { test } from "node:test";
import assert from "node:assert/strict";
import { unitAt, unitsInBox, applyPick, sameTypeInView, createGroups, isDoublePress, attackKey, DOUBLE_PRESS } from "./selection.js";

const unit = (id, type, x, y, angle = 0) => ({ id, type, x, y, angle, alive: true });

test("a click picks the unit whose body is under it, the nearest if several", () => {
  const tank = unit(1, "tank", 100, 100); // 72 x 36, facing right
  const soldier = unit(2, "soldier", 160, 100);
  assert.equal(unitAt([tank, soldier], 130, 105), tank);
  assert.equal(unitAt([tank, soldier], 100, 130), null); // beside the tank, off its body
  assert.equal(unitAt([tank, soldier], 158, 102), soldier);
  assert.equal(unitAt([{ ...soldier, alive: false }], 160, 100), null);
  const turned = unit(3, "tank", 300, 300, Math.PI / 2); // facing down
  assert.equal(unitAt([turned], 300, 335), turned);
  assert.equal(unitAt([turned], 335, 300), null);
});

test("a box picks every unit inside it, drawn in any direction", () => {
  const units = [unit(1, "soldier", 10, 10), unit(2, "buggy", 50, 50), unit(3, "tank", 200, 200)];
  assert.deepEqual(unitsInBox(units, 0, 0, 60, 60).map((u) => u.id), [1, 2]);
  assert.deepEqual(unitsInBox(units, 60, 60, 0, 0).map((u) => u.id), [1, 2]);
  assert.deepEqual(unitsInBox(units, 100, 100, 120, 120), []);
});

test("a pick replaces the selection; with Shift a click toggles a unit and a box adds -- or takes out a box of units already all selected", () => {
  const sel = new Set([1, 2]);
  assert.deepEqual([...applyPick(sel, [3])], [3]);
  assert.deepEqual([...applyPick(sel, [])], []);
  assert.deepEqual([...applyPick(sel, [3], { shift: true })].sort(), [1, 2, 3]);
  assert.deepEqual([...applyPick(sel, [2], { shift: true })], [1]);
  assert.deepEqual([...applyPick(sel, [2, 3], { shift: true, box: true })].sort(), [1, 2, 3]);
  assert.deepEqual([...applyPick(sel, [1, 2], { shift: true, box: true })], []);
  assert.deepEqual([...sel].sort(), [1, 2]); // the old selection is left as it was
});

test("a double click picks every unit of that type in view", () => {
  const units = [unit(1, "buggy", 10, 10), unit(2, "buggy", 500, 10), unit(3, "tank", 20, 20), unit(4, "buggy", 90, 90)];
  assert.deepEqual(sameTypeInView(units, "buggy", { x: 0, y: 0, w: 100, h: 100 }), [1, 4]);
});

test("groups: a unit is in one group at most, and the fallen drop out", () => {
  const g = createGroups();
  const units = [1, 2, 3, 4].map((id) => unit(id, "soldier", id * 10, 0));
  g.assign(1, [1, 2]);
  g.assign(2, [2, 3]);
  assert.deepEqual(g.members(1, units), [1]);
  assert.deepEqual(g.members(2, units), [2, 3]);
  assert.equal(g.groupOf(2), 2);
  assert.equal(g.groupOf(4), null);
  units[2].alive = false;
  assert.deepEqual(g.members(2, units), [2]);
  assert.deepEqual(g.members(5, units), []);
  g.clear();
  assert.deepEqual(g.members(1, units), []);
});

test("pressing a group's number twice in half a second is a double press", () => {
  assert.equal(DOUBLE_PRESS, 0.5);
  assert.equal(isDoublePress({ key: 3, time: 10 }, 3, 10.4), true);
  assert.equal(isDoublePress({ key: 3, time: 10 }, 3, 10.6), false);
  assert.equal(isDoublePress({ key: 2, time: 10 }, 3, 10.1), false);
  assert.equal(isDoublePress(null, 3, 10), false);
});

test("the attack mode's keys: Ctrl or Alt + 1-9 keep a group, 1-9 pick it, S stops", () => {
  assert.deepEqual(attackKey({ code: "Digit3", key: "3", ctrlKey: true }), { kind: "assign", n: 3 });
  assert.deepEqual(attackKey({ code: "Digit3", key: "|", altKey: true }), { kind: "assign", n: 3 });
  assert.deepEqual(attackKey({ code: "Digit7", key: "7" }), { kind: "select", n: 7 });
  assert.deepEqual(attackKey({ code: "Numpad7", key: "7" }), { kind: "select", n: 7 });
  assert.deepEqual(attackKey({ code: "KeyS", key: "s" }), { kind: "stop" });
  assert.deepEqual(attackKey({ code: "KeyS", key: "S", shiftKey: true }), { kind: "stop" });
  assert.equal(attackKey({ code: "KeyS", key: "s", ctrlKey: true }), null);
  assert.equal(attackKey({ code: "Digit0", key: "0" }), null);
  assert.equal(attackKey({ code: "KeyW", key: "w" }), null);
});
