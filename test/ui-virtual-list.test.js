import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "mod/ui.js"), "utf8");

test("v_virtual_list item renderer does not register interactive handlers", () => {
  const start = src.indexOf("function diffRow");
  const end = src.indexOf("function renderSwitcher");
  assert.ok(start >= 0 && end > start, "diffRow and renderSwitcher must exist");
  const body = src.slice(start, end);
  assert.match(body, /function diffRow\(pal, row\)/);
  for (const token of ["on_click", "on_hover", "on_mouse_down", "on_mouse_up", "on_item_click"]) {
    assert.equal(body.includes(token), false, `${token} must not appear in diffRow`);
  }
});

test("diff body uses a relatively positioned flex_1 shell like shipped changes", () => {
  assert.match(src, /id\("scm-diff-body"\)\.flex_1\(\)\.min_h\(0\)\.w_full\(\)\.relative\(\)/);
  assert.match(src, /v_virtual_list\("scm-diff-rows", rows\.length, 20,/);
  assert.match(src, /hunkStrip\(/);
});
