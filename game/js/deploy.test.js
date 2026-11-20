// What Vercel publishes must hold everything the browser loads: a module
// that .vercelignore leaves out is a 404 there, and one 404 among main.js's
// imports leaves the page black.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const gameDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// A .vercelignore line as a test on a path: "*" stands for any run of
// characters within one folder, and a folder's name covers what is in it.
function ignoreRule(pattern) {
  const parts = pattern.split("*").map((part) => part.replace(/[^A-Za-z0-9_/-]/g, (ch) => "[" + ch + "]"));
  return new RegExp("^" + parts.join("[^/]*") + "(/|$)");
}

function ignoreRules() {
  return readFileSync(path.join(gameDir, ".vercelignore"), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map(ignoreRule);
}

function browserModules(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(path.join(gameDir, file), "utf8");
    for (const match of source.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+\.js)["']/g)) {
      queue.push(path.posix.join(path.posix.dirname(file), match[1]));
    }
  }
  return [...seen];
}

test("every module the browser loads from main.js is published", () => {
  const rules = ignoreRules();
  const modules = browserModules("js/main.js");
  assert.ok(modules.length > 20, "the walk found main.js's imports");
  assert.ok(rules.some((rule) => rule.test("js/map.test.js")), "the rules are read: tests aren't published");
  const leftOut = modules.filter((file) => rules.some((rule) => rule.test(file)));
  assert.deepEqual(leftOut, []);
});
