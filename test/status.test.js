import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePorcelainV2, classifyEntries, statusLetter, splitPath, displayLabel, aheadBehindText } from "../mod/status.js";

function z(...records) {
  return records.join("\0") + "\0";
}

test("parses porcelain v2 -z records used by VS Code sections", () => {
  const cjk = "笔记/你好.txt";
  const quoted = `docs/he said "hi".txt`;
  const spaced = "apps/my file.ts";
  const records = [
    "# branch.oid abcdef1234567890",
    "# branch.head taoyi/v1.0.0-rc-2026",
    "# branch.upstream origin/taoyi/v1.0.0-rc-2026",
    "# branch.ab +2 -1",
    `1 M  N... 100644 100644 100644 aaaaaaaaa aaaaaaaaa staged-only.md`,
    `1  M N... 100644 100644 100644 bbbbbbbbb bbbbbbbbb ${spaced}`,
    `1 MM N... 100644 100644 100644 ccccccccc ccccccccc apps/packages/product-ui/bot-creation.tsx`,
    `1 A  N... 100644 100644 100644 ddddddddd ddddddddd ${quoted}`,
    `1  D N... 100644 100644 100644 eeeeeeeee eeeeeeeee old/legacy.js`,
    `2 R  N... 100644 100644 100644 fffffffff fffffffff R100 new/name.txt`,
    "from/old name.txt",
    "u UU N... 100644 100644 100644 100644 111 222 333 conflict.md",
    `? ${cjk}`,
  ];
  const { entries, branch } = parsePorcelainV2(z(...records));
  assert.equal(branch.head, "taoyi/v1.0.0-rc-2026");
  assert.equal(branch.ahead, 2);
  assert.equal(branch.behind, 1);
  assert.equal(branch.detached, false);
  assert.equal(branch.initial, false);

  const groups = classifyEntries(entries);
  assert.equal(groups.merge.length, 1);
  assert.equal(groups.merge[0].path, "conflict.md");
  assert.equal(statusLetter(groups.merge[0], "merge"), "C");

  const stagedPaths = groups.staged.map((e) => e.path);
  assert.deepEqual(stagedPaths, [
    "staged-only.md",
    "apps/packages/product-ui/bot-creation.tsx",
    quoted,
    "new/name.txt",
  ]);
  assert.equal(statusLetter(groups.staged[0], "staged"), "M");
  assert.equal(statusLetter(groups.staged[2], "staged"), "A");
  assert.equal(statusLetter(groups.staged[3], "staged"), "R");
  assert.equal(groups.staged[3].origPath, "from/old name.txt");

  const unstagedPaths = groups.unstaged.map((e) => e.path);
  assert.deepEqual(unstagedPaths, [
    spaced,
    "apps/packages/product-ui/bot-creation.tsx",
    "old/legacy.js",
    cjk,
  ]);
  assert.equal(statusLetter(groups.unstaged[0], "unstaged"), "M");
  assert.equal(statusLetter(groups.unstaged[2], "unstaged"), "D");
  assert.equal(statusLetter(groups.unstaged[3], "unstaged"), "U");

  const mm = entries.find((e) => e.path.endsWith("bot-creation.tsx"));
  assert.equal(mm.staged, true);
  assert.equal(mm.unstaged, true);
  assert.ok(groups.staged.includes(mm));
  assert.ok(groups.unstaged.includes(mm));
});

test("unborn and detached labels", () => {
  const unborn = parsePorcelainV2(z("# branch.oid (initial)", "# branch.head main"));
  assert.equal(unborn.branch.initial, true);
  assert.equal(displayLabel(unborn.branch), "main (unborn)");

  const detached = parsePorcelainV2(z("# branch.oid abcdef123", "# branch.head (detached)"));
  assert.equal(detached.branch.detached, true);
  assert.equal(displayLabel(detached.branch), "detached abcdef1");
  assert.equal(aheadBehindText(unborn.branch), "");
  assert.equal(aheadBehindText({ ahead: 0, behind: 0 }), "");
  assert.equal(aheadBehindText({ ahead: 3, behind: 1 }), "↑3 ↓1");
});

test("splitPath matches VS Code filename + muted parent", () => {
  assert.deepEqual(splitPath("apps/packages/product-ui/bot-creation.tsx"), {
    name: "bot-creation.tsx",
    dir: "apps/packages/product-ui",
  });
  assert.deepEqual(splitPath("README.md"), { name: "README.md", dir: "" });
});
