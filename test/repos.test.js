import assert from "node:assert/strict";
import { test } from "node:test";
import {
  autoCandidates, loadStored, dumpStored, rememberPath, togglePinned,
  mergeSwitcherList, uniquePaths, readStorage, writeStorage, STORAGE_KEY,
} from "../mod/repos.js";

test("autoCandidates prefer focused pane cwd, then space folder", () => {
  const paths = autoCandidates({
    focused: { pane: "p2", cwd: "/work/b" },
    panes: [
      { pane: "p1", cwd: "/work/a" },
      { pane: "p2", cwd: "/work/b" },
    ],
    spaces: [{ active: true, folder: "/work/space" }, { active: false, folder: "/work/other" }],
  });
  assert.deepEqual(paths, ["/work/b", "/work/space", "/work/a", "/work/other"]);
});

test("persistence remembers recents and pins without duplicates", () => {
  let stored = loadStored(null);
  stored = rememberPath(stored, "/work/open_tag/");
  stored = rememberPath(stored, "/work/delta");
  stored = rememberPath(stored, "/work/open_tag");
  assert.deepEqual(stored.recents, ["/work/open_tag", "/work/delta"]);
  stored = togglePinned(stored, "/work/delta");
  const bag = {};
  const storage = { getItem: (k) => bag[k] ?? null, setItem: (k, v) => { bag[k] = v; } };
  writeStorage(storage, stored);
  assert.equal(Boolean(bag[STORAGE_KEY]), true);
  const loaded = readStorage(storage);
  assert.deepEqual(loaded.pinned, ["/work/delta"]);
  const list = mergeSwitcherList({
    workspace: [{ path: "/work/open_tag" }],
    stored: loaded,
    current: "/work/open_tag",
    autoRoot: "/work/open_tag",
  });
  assert.equal(list[0].path, "/work/delta");
  assert.equal(list[0].source, "pinned");
  assert.equal(list.find((r) => r.path === "/work/open_tag").current, true);
  assert.deepEqual(uniquePaths(["/a/", "/a", "/b"]), ["/a", "/b"]);
  assert.deepEqual(loadStored("{not json").recents, []);
  assert.ok(dumpStored(loaded).includes("open_tag"));
});
