import { test } from "node:test";
import assert from "node:assert/strict";
import { isTypingTarget } from "./util.js";

test("a key pressed while typing in a text field is the field's, not a game shortcut", () => {
  assert.equal(isTypingTarget({ tagName: "INPUT", type: "text" }), true); // the end-of-game name field
  assert.equal(isTypingTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isTypingTarget({ tagName: "INPUT", type: "checkbox" }), false); // the settings switches
  assert.equal(isTypingTarget({ tagName: "CANVAS" }), false);
  assert.equal(isTypingTarget(null), false);
});
