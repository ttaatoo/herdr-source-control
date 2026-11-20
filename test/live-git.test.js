import assert from "node:assert/strict";
import { after, test } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { Model } from "../mod/model.js";
import { parsePorcelainV2, classifyEntries } from "../mod/status.js";
import { exec, gitHost, initRepo, makeTempRoot, memoryStorage, writeRel } from "./helpers/git-runner.js";

const temps = [];
after(async () => {
  await Promise.all(temps.map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function fresh(opts) {
  const dir = await makeTempRoot();
  const messages = await makeTempRoot("herdr-scm-msg-");
  temps.push(dir, messages);
  await initRepo(dir, opts);
  const git = gitHost(messages);
  const storage = memoryStorage();
  const loc = { cwd: dir, on: null, spaces: [{ active: true, folder: dir }], panes: [], focused: { cwd: dir, pane: null } };
  const model = new Model({ git, storage, location: () => loc });
  return { dir, git, model, loc };
}

test("live: init, modify, stage, unstage, MM, hunks, discard, commit, amend, switch repos", async () => {
  const { dir, git, model, loc } = await fresh({
    files: {
      "README.md": "hello\n",
      "src/a.txt": "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n",
    },
  });

  await model.refresh();
  assert.equal(model.s.root, await realpath(dir));
  assert.equal(model.emptyKind(), "clean");
  assert.equal(model.s.branch.head, "main");

  await writeRel(dir, "src/a.txt", "ONE\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nTEN\n");
  await writeRel(dir, "notes/你好.txt", "hi\n");
  await writeRel(dir, "docs/he said \"hi\".txt", "quoted\n");
  await model.refresh();
  assert.ok(model.s.unstaged.some((e) => e.path === "src/a.txt"));
  assert.ok(model.s.unstaged.some((e) => e.path === "notes/你好.txt" && e.kind === "untracked"));
  assert.ok(model.s.unstaged.some((e) => e.path.includes("he said")));

  const a = model.s.unstaged.find((e) => e.path === "src/a.txt");
  await model.stage(a);
  assert.ok(model.s.staged.some((e) => e.path === "src/a.txt"));
  assert.ok(!model.s.unstaged.some((e) => e.path === "src/a.txt"));

  await model.unstage(model.s.staged.find((e) => e.path === "src/a.txt"));
  assert.ok(model.s.unstaged.some((e) => e.path === "src/a.txt"));
  assert.ok(!model.s.staged.some((e) => e.path === "src/a.txt"));

  // MM: stage current contents, then edit again.
  await model.stage(model.s.unstaged.find((e) => e.path === "src/a.txt"));
  await writeRel(dir, "src/a.txt", "ONE\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nTEN\nPLUS\n");
  await model.refresh();
  const mm = model.s.staged.find((e) => e.path === "src/a.txt");
  assert.ok(mm && mm.staged && mm.unstaged);
  assert.ok(model.s.unstaged.includes(mm) || model.s.unstaged.some((e) => e.path === "src/a.txt"));

  // Partial hunks on a dedicated two-hunk file.
  await writeRel(dir, "src/hunks.txt", "alpha\nbravo\ncharlie\n\n\n\n\n\n\nyankee\nxray\n");
  await exec("git", ["add", "src/hunks.txt"], { cwd: dir });
  await exec("git", ["commit", "-m", "hunks base"], { cwd: dir });
  await writeRel(dir, "src/hunks.txt", "alpha\nBRAVO\ncharlie\n\n\n\n\n\n\nyankee\nzulu\nxray\n");
  await model.refresh();
  const hunkFile = model.s.unstaged.find((e) => e.path === "src/hunks.txt");
  await model.selectFile(hunkFile, "unstaged");
  assert.equal(model.s.diff.file.hunks.length, 2);
  await model.stageHunk(0);
  const st = parsePorcelainV2((await git.status(dir)).stdout);
  const groups = classifyEntries(st.entries);
  const hunkEntry = groups.staged.concat(groups.unstaged).find((e) => e.path === "src/hunks.txt");
  assert.ok(hunkEntry.staged, "first hunk staged");
  assert.ok(hunkEntry.unstaged, "second hunk still unstaged");

  await model.selectFile(hunkEntry, "staged");
  assert.ok(model.s.diff.file.hunks.length >= 1);
  await model.unstageHunk(0);
  await model.refresh();
  const afterUnstage = classifyEntries(parsePorcelainV2((await git.status(dir)).stdout).entries);
  const hunk2 = afterUnstage.unstaged.find((e) => e.path === "src/hunks.txt");
  assert.ok(hunk2);
  assert.equal(afterUnstage.staged.some((e) => e.path === "src/hunks.txt"), false);

  await model.selectFile(hunk2, "unstaged");
  const before = await fs.readFile(path.join(dir, "src/hunks.txt"), "utf8");
  await model.revertHunk(0);
  const after = await fs.readFile(path.join(dir, "src/hunks.txt"), "utf8");
  assert.notEqual(after, before);
  assert.match(after, /bravo/);

  // Discard tracked + untracked with the same semantics as the UI.
  await writeRel(dir, "README.md", "dirty readme\n");
  await model.refresh();
  await model.discardPath("README.md", false);
  assert.equal(await fs.readFile(path.join(dir, "README.md"), "utf8"), "hello\n");

  await writeRel(dir, "scratch/tmp.txt", "tmp\n");
  await model.refresh();
  await model.discardPath("scratch/tmp.txt", true);
  await assert.rejects(fs.access(path.join(dir, "scratch/tmp.txt")));

  await writeRel(dir, "keep.md", "keep\n");
  await writeRel(dir, "README.md", "again\n");
  await model.refresh();
  await model.stageAll();
  assert.ok(model.s.staged.length >= 2);
  await model.unstageAll();
  assert.equal(model.s.staged.length, 0);
  assert.ok(model.s.unstaged.length >= 2);

  await model.stageAll();
  model.setMessage('Release "quotes" and\nnewlines');
  const decision = model.decision();
  assert.equal(decision.action, "commit");
  await model.commitNow();
  const log = await exec("git", ["log", "-1", "--pretty=%B"], { cwd: dir });
  assert.match(log.stdout, /Release "quotes" and/);
  assert.match(log.stdout, /newlines/);
  assert.equal(model.emptyKind(), "clean");

  model.setCommitMode("amend");
  await model.loadAmendMessage();
  assert.match(model.s.message, /quotes/);
  model.setMessage("amended message");
  await model.commitNow();
  const log2 = await exec("git", ["log", "-1", "--pretty=%B"], { cwd: dir });
  assert.match(log2.stdout, /amended message/);

  // Switch between two real repos.
  const other = await makeTempRoot();
  temps.push(other);
  await initRepo(other, { files: { "other.txt": "repo b\n" } });
  await writeRel(other, "other.txt", "repo b changed\n");
  loc.cwd = other;
  loc.spaces = [{ active: true, folder: other }];
  loc.focused = { cwd: other, pane: null };
  await model.choosePath(other);
  assert.equal(model.s.mode, "pinned");
  assert.ok(model.s.unstaged.some((e) => e.path === "other.txt"));
  await model.chooseAuto();
  assert.equal(model.s.mode, "auto");
});

test("live: unborn branch can stage and commit; non-git folder is reported", async () => {
  const { dir, model } = await fresh({ commit: false, files: { "README.md": "unborn\n" } });
  await model.refresh();
  assert.equal(model.s.branch.initial, true);
  assert.ok(model.s.unstaged.some((e) => e.path === "README.md"));
  await model.stageAll();
  assert.ok(model.s.staged.some((e) => e.path === "README.md"));
  model.setMessage("first commit");
  await model.commitNow();
  assert.equal(model.s.branch.initial, false);
  assert.equal(model.emptyKind(), "clean");

  const plain = await makeTempRoot();
  temps.push(plain);
  await fs.writeFile(path.join(plain, "x"), "no git\n");
  const git = gitHost(plain);
  const stray = new Model({
    git,
    storage: memoryStorage(),
    location: () => ({ cwd: plain, on: null, spaces: [{ active: true, folder: plain }], panes: [], focused: { cwd: plain } }),
  });
  await stray.refresh();
  assert.equal(stray.s.notGit, true);
  assert.equal(stray.emptyKind(), "not-git");
});

async function realpath(p) {
  return fs.realpath(p);
}
