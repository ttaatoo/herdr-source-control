import assert from "node:assert/strict";
import { test } from "node:test";
import { parseUnifiedDiff, buildHunkPatch, untrackedAsDiff, diffRows, summarizeDiff } from "../mod/diff.js";

const TWO_HUNKS = `diff --git a/file.txt b/file.txt
index 111..222 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
 alpha
-bravo
+BRAVO
 charlie
@@ -10,2 +10,3 @@
 yankee
+zulu
 xray
`;

test("parses unified diffs into hunks and summary", () => {
  const { files } = parseUnifiedDiff(TWO_HUNKS);
  assert.equal(files.length, 1);
  assert.equal(files[0].path, "file.txt");
  assert.equal(files[0].hunks.length, 2);
  assert.deepEqual(summarizeDiff(files[0]), { added: 2, removed: 1 });
  const rows = diffRows(files[0]);
  assert.equal(rows[0].kind, "@");
  assert.equal(rows[0].hunkIndex, 0);
  assert.ok(rows.some((r) => r.kind === "+" && r.text === "BRAVO"));
  assert.ok(rows.some((r) => r.kind === "-" && r.text === "bravo"));
});

test("buildHunkPatch keeps file headers and a single hunk", () => {
  const file = parseUnifiedDiff(TWO_HUNKS).files[0];
  const patch = buildHunkPatch(file, 0);
  assert.match(patch, /^diff --git a\/file.txt b\/file.txt\n/);
  assert.match(patch, /@@ -1,3 \+1,3 @@/);
  assert.doesNotMatch(patch, /@@ -10,2 \+10,3 @@/);
  assert.match(patch, /\+BRAVO\n/);
  const second = buildHunkPatch(file, 1);
  assert.match(second, /\+zulu\n/);
  assert.doesNotMatch(second, /BRAVO/);
});

test("untrackedAsDiff builds a new-file patch including CJK and spaces", () => {
  const file = untrackedAsDiff("笔记/a file.txt", "你好\nworld");
  assert.equal(file.newFile, true);
  assert.equal(file.hunks[0].lines.filter((l) => l.kind === "+").length, 2);
  const patch = buildHunkPatch(file, 0);
  assert.match(patch, /new file mode 100644/);
  assert.match(patch, /\+你好\n\+world\n/);
});

test("binary and empty diffs", () => {
  const bin = parseUnifiedDiff("Binary files a/x.bin and b/x.bin differ\n");
  assert.equal(bin.files[0].binary, true);
  assert.equal(parseUnifiedDiff("").files.length, 0);
});
