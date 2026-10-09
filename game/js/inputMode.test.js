import { test } from "node:test";
import assert from "node:assert/strict";
import { detectControls, resolveControls } from "./inputMode.js";

const phone = { coarsePointer: true, maxTouchPoints: 5 };
const pc = { coarsePointer: false, maxTouchPoints: 0 };
const touchLaptop = { coarsePointer: false, maxTouchPoints: 10 };

test("a phone plays with the automatic army, a PC (even a touch laptop) with the mouse", () => {
  assert.equal(detectControls(phone), "touch");
  assert.equal(detectControls(pc), "mouse");
  assert.equal(detectControls(touchLaptop), "mouse");
});

test("the setting can force either one; «auto» goes by the device", () => {
  assert.equal(resolveControls("auto", phone), "touch");
  assert.equal(resolveControls("auto", pc), "mouse");
  assert.equal(resolveControls("mouse", phone), "mouse");
  assert.equal(resolveControls("touch", pc), "touch");
  assert.equal(resolveControls(undefined, pc), "mouse");
  assert.equal(resolveControls("nonsense", phone), "touch");
});
