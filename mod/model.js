/** Source Control panel state. Live Git or fixture-driven for check/scenes. */

import { parsePorcelainV2, classifyEntries, displayLabel, aheadBehindText } from "./status.js";
import { parseUnifiedDiff, untrackedAsDiff, diffRows, buildHunkPatch, summarizeDiff } from "./diff.js";
import { primaryAction, reduceConfirm, MODES } from "./commit-state.js";
import {
  autoCandidates, discoverWorkspaceRepos, readStorage, writeStorage,
  rememberPath, togglePinned, mergeSwitcherList, normalizeRepoPath, loadStored,
} from "./repos.js";
import { createGit } from "./git.js";
import { sceneState } from "./fixtures.js";

export class Model {
  constructor(opts = {}) {
    this.git = opts.git || null;
    this.storage = opts.storage || null;
    this.location = opts.location || (() => ({ cwd: null, on: null, spaces: [], panes: [], focused: null }));
    this.now = opts.now || (() => Date.now());
    this.s = blankState();
    this.s.stored = readStorage(this.storage);
    if (opts.fixture) this.loadFixture(opts.fixture);
  }

  loadFixture(name) {
    const snap = sceneState(name);
    this.s = { ...blankState(), ...snap, fixture: name, stored: snap.stored || this.s.stored };
    return this;
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.s));
  }

  decision() {
    return primaryAction({
      stagedCount: this.s.staged.length,
      unstagedCount: this.s.unstaged.length,
      message: this.s.message,
      mode: this.s.commitMode,
      hasHead: !!(this.s.branch && this.s.branch.oid && !this.s.branch.initial),
      initial: !!(this.s.branch && this.s.branch.initial),
    });
  }

  setWidth(width) {
    this.s.width = width || 0;
  }

  isWide() {
    return (this.s.width || 0) >= 760;
  }

  setMessage(text) {
    this.s.message = text;
  }

  setCommitMode(mode) {
    if (!MODES.includes(mode)) return;
    this.s = reduceConfirm(this.s, { type: "set-mode", mode });
    this.s.commitMode = mode;
  }

  toggleSection(id) {
    this.s.sectionsOpen = { ...this.s.sectionsOpen, [id]: !this.s.sectionsOpen[id] };
  }

  setAllSections(open) {
    this.s.sectionsOpen = { merge: open, staged: open, unstaged: open };
  }

  toggleSwitcher(open) {
    this.s.switcherOpen = open ?? !this.s.switcherOpen;
    if (this.s.switcherOpen) this.refreshSwitcher();
  }

  setSwitcherQuery(q) {
    this.s.switcherQuery = q;
  }

  refreshSwitcher() {
    const loc = this.location();
    const workspace = discoverWorkspaceRepos(loc);
    this.s.switcherList = mergeSwitcherList({
      workspace,
      stored: this.s.stored,
      current: this.s.mode === "auto" ? this.s.root : (this.s.pinnedPath || this.s.root),
      autoRoot: this.s.root,
    });
  }

  async chooseAuto() {
    this.s.mode = "auto";
    this.s.pinnedPath = null;
    this.s.switcherOpen = false;
    await this.refresh();
  }

  async choosePath(path) {
    const p = normalizeRepoPath(path);
    if (!p) return;
    this.s.mode = "pinned";
    this.s.pinnedPath = p;
    this.s.stored = rememberPath(this.s.stored, p);
    writeStorage(this.storage, this.s.stored);
    this.s.switcherOpen = false;
    await this.refresh();
  }

  pinCurrent() {
    if (!this.s.root) return;
    this.s.stored = togglePinned(this.s.stored, this.s.root);
    writeStorage(this.storage, this.s.stored);
    this.refreshSwitcher();
  }

  cancelConfirm() {
    this.s = reduceConfirm(this.s, { type: "cancel" });
  }

  askDiscardFile(entry) {
    this.s = reduceConfirm(this.s, {
      type: "ask-discard-file",
      path: entry.path,
      untracked: entry.kind === "untracked",
    });
  }

  askDiscardAll() {
    this.s = reduceConfirm(this.s, { type: "ask-discard-all", count: this.s.unstaged.length });
  }

  askRevertHunk(hunkIndex) {
    this.s = reduceConfirm(this.s, {
      type: "ask-revert-hunk",
      path: this.s.diff?.file?.path,
      hunkIndex,
    });
  }

  async refresh() {
    if (this.s.fixture && !this.git) return;
    if (this.s.busy) return;
    const loc = this.location();
    const wanted = this.s.mode === "pinned" ? this.s.pinnedPath : autoCandidates(loc)[0] || loc.cwd || null;
    const on = loc.on ?? null;
    this.s.cwd = wanted;
    this.s.on = on;
    this.s.loading = true;
    this.s.error = null;

    if (!wanted) {
      this.s.root = null;
      this.s.notGit = false;
      this.s.emptyFolder = true;
      this.s.merge = [];
      this.s.staged = [];
      this.s.unstaged = [];
      this.s.branch = null;
      this.s.diff = null;
      this.s.loading = false;
      return;
    }

    try {
      const root = await this.git.repoRoot(wanted, on);
      if (!root) {
        this.s.root = null;
        this.s.notGit = true;
        this.s.emptyFolder = false;
        this.s.merge = [];
        this.s.staged = [];
        this.s.unstaged = [];
        this.s.branch = null;
        this.s.diff = null;
        this.s.loading = false;
        return;
      }
      this.s.root = root;
      this.s.notGit = false;
      this.s.emptyFolder = false;
      this.s.stored = rememberPath(this.s.stored, root);
      writeStorage(this.storage, this.s.stored);

      const st = await this.git.status(root, on);
      if (st.code !== 0) throw new Error((st.stderr || "git status failed").trim());
      const parsed = parsePorcelainV2(st.stdout);
      const groups = classifyEntries(parsed.entries);
      this.s.branch = parsed.branch;
      this.s.merge = groups.merge;
      this.s.staged = groups.staged;
      this.s.unstaged = groups.unstaged;
      if (this.s.selection) {
        const still = this.findSelected();
        if (!still) {
          this.s.selection = null;
          if (this.s.view !== "list") this.s.view = "list";
          this.s.diff = null;
        } else {
          await this.loadSelectionDiff();
        }
      }
    } catch (err) {
      this.s.error = String(err.message || err);
    } finally {
      this.s.loading = false;
    }
  }

  findSelected() {
    const sel = this.s.selection;
    if (!sel) return null;
    const list = sel.section === "staged" ? this.s.staged : sel.section === "merge" ? this.s.merge : this.s.unstaged;
    return list.find((e) => e.path === sel.path) || null;
  }

  async selectFile(entry, section) {
    this.s.selection = { path: entry.path, section, kind: entry.kind };
    this.s.view = "diff";
    this.s.fileText = null;
    await this.loadSelectionDiff();
  }

  async loadSelectionDiff() {
    const entry = this.findSelected();
    if (!entry || !this.s.root || !this.git) return;
    const section = this.s.selection.section;
    try {
      if (section === "unstaged" && entry.kind === "untracked") {
        const text = await this.git.readText(`${this.s.root}/${entry.path}`, this.s.on);
        if (text == null) {
          this.s.diff = { file: { path: entry.path, binary: false, hunks: [], notice: "This file is no longer available" }, section, rows: [] };
          return;
        }
        if (typeof text === "string" && text.includes("\0")) {
          this.s.diff = { file: { path: entry.path, binary: true, hunks: [], notice: "Binary file · no text preview" }, section, rows: [] };
          return;
        }
        const file = untrackedAsDiff(entry.path, text);
        this.s.diff = { file, section, rows: diffRows(file), stats: summarizeDiff(file) };
        return;
      }
      const cached = section === "staged";
      const r = await this.git.diff(this.s.root, this.s.on, { cached, path: entry.path });
      const parsed = parseUnifiedDiff(r.stdout || "");
      const file = parsed.files[0] || { path: entry.path, hunks: [], notice: r.stdout.trim() ? "No text diff available" : (entry.index === "D" || entry.worktree === "D" ? "File deleted" : "No text diff available") };
      if (file.deleted && !file.notice && file.hunks.length === 0) file.notice = "File deleted";
      this.s.diff = { file, section, rows: diffRows(file), stats: summarizeDiff(file) };
    } catch (err) {
      this.s.diff = { file: { path: entry.path, hunks: [], notice: String(err.message || err) }, section, rows: [] };
    }
  }

  async openPreview() {
    const entry = this.findSelected();
    if (!entry || !this.s.root || !this.git) return;
    if (entry.index === "D" && this.s.selection.section === "staged" && entry.worktree !== "D") {
      // staged deletion — no worktree file; keep diff
      return;
    }
    try {
      const text = await this.git.readText(`${this.s.root}/${entry.path}`, this.s.on);
      if (text == null) {
        this.s.error = "This file is no longer available";
        return;
      }
      if (String(text).includes("\0")) {
        this.s.error = "Binary file · no text preview";
        return;
      }
      const value = String(text);
      this.s.fileText = value.length > 400000 ? `${value.slice(0, 400000)}\n… (file truncated)` : value;
      this.s.view = "file";
    } catch (err) {
      this.s.error = String(err.message || err);
    }
  }

  backToDiff() {
    if (this.s.view === "file") this.s.view = "diff";
    else {
      this.s.view = "list";
      this.s.selection = null;
      this.s.diff = null;
      this.s.fileText = null;
    }
  }

  async stage(entry) {
    await this.mutate(() => this.git.add(this.s.root, this.s.on, [entry.path]));
  }

  async unstage(entry) {
    const hasHead = !!(this.s.branch && this.s.branch.oid && !this.s.branch.initial);
    await this.mutate(() => this.git.unstage(this.s.root, this.s.on, [entry.path], { hasHead }));
  }

  async stageAll() {
    await this.mutate(() => this.git.add(this.s.root, this.s.on, true));
  }

  async unstageAll() {
    const hasHead = !!(this.s.branch && this.s.branch.oid && !this.s.branch.initial);
    await this.mutate(() => this.git.unstage(this.s.root, this.s.on, true, { hasHead }));
  }

  async confirmPending() {
    const c = this.s.confirm;
    if (!c) return;
    this.s.confirm = null;
    if (c.kind === "discard-file") await this.discardPath(c.path, c.untracked);
    else if (c.kind === "discard-all") await this.discardAll();
    else if (c.kind === "stage-all-commit") {
      await this.stageAll();
      await this.commitNow();
    } else if (c.kind === "revert-hunk") {
      await this.revertHunk(c.hunkIndex);
    }
  }

  async discardPath(path, untracked) {
    if (untracked) await this.mutate(() => this.git.clean(this.s.root, this.s.on, [path]));
    else await this.mutate(() => this.git.restoreWorktree(this.s.root, this.s.on, [path]));
  }

  async discardAll() {
    const tracked = this.s.unstaged.filter((e) => e.kind !== "untracked").map((e) => e.path);
    const untracked = this.s.unstaged.filter((e) => e.kind === "untracked").map((e) => e.path);
    await this.mutate(async () => {
      if (tracked.length) await this.git.restoreWorktree(this.s.root, this.s.on, tracked);
      if (untracked.length) await this.git.clean(this.s.root, this.s.on, untracked);
    });
  }

  async stageHunk(hunkIndex) {
    const file = this.s.diff?.file;
    const section = this.s.diff?.section;
    if (!file) return;
    const patch = buildHunkPatch(file, hunkIndex);
    if (section === "staged") return;
    await this.mutate(() => this.git.apply(this.s.root, this.s.on, patch, { cached: true, reverse: false }));
  }

  async unstageHunk(hunkIndex) {
    const file = this.s.diff?.file;
    if (!file || this.s.diff?.section !== "staged") return;
    const patch = buildHunkPatch(file, hunkIndex);
    await this.mutate(() => this.git.apply(this.s.root, this.s.on, patch, { cached: true, reverse: true }));
  }

  async revertHunk(hunkIndex) {
    const file = this.s.diff?.file;
    if (!file || this.s.diff?.section !== "unstaged") return;
    const patch = buildHunkPatch(file, hunkIndex);
    await this.mutate(() => this.git.apply(this.s.root, this.s.on, patch, { cached: false, reverse: true }));
  }

  async requestCommit() {
    const decision = this.decision();
    if (decision.action === "disabled") {
      this.s.error = decision.reason;
      return;
    }
    if (decision.action === "prompt-stage-all") {
      this.s = reduceConfirm(this.s, { type: "ask-stage-all-commit" });
      return;
    }
    await this.commitNow();
  }

  async commitNow() {
    const decision = this.decision();
    const amend = decision.action === "amend" || this.s.commitMode === "amend";
    const alsoPush = this.s.commitMode === "commit-push" && !amend;
    await this.mutate(async () => {
      await this.git.commit(this.s.root, this.s.on, { message: this.s.message, amend });
      this.s.message = "";
      this.s.lastCommit = amend ? "Amended" : "Committed";
      if (alsoPush) await this.git.push(this.s.root, this.s.on);
    });
  }

  async fetch() { await this.mutate(() => this.git.fetch(this.s.root, this.s.on)); }
  async pull() { await this.mutate(() => this.git.pull(this.s.root, this.s.on)); }
  async push() { await this.mutate(() => this.git.push(this.s.root, this.s.on)); }

  async loadAmendMessage() {
    if (!this.s.root || !this.git) return;
    const text = await this.git.showHeadMessage(this.s.root, this.s.on);
    if (text) this.s.message = text.replace(/\n$/, "");
  }

  async mutate(fn) {
    if (!this.git || !this.s.root) return;
    if (this.s.busy) return;
    this.s.busy = true;
    this.s.error = null;
    try {
      await fn();
    } catch (err) {
      this.s.error = String(err.message || err);
    } finally {
      this.s.busy = false;
      await this.refresh();
    }
  }

  emptyKind() {
    if (this.s.emptyFolder && !this.s.root) return "no-folder";
    if (this.s.notGit) return "not-git";
    if (this.s.error && !this.s.merge.length && !this.s.staged.length && !this.s.unstaged.length) return "error";
    if (!this.s.merge.length && !this.s.staged.length && !this.s.unstaged.length) return "clean";
    return null;
  }

  titleMeta() {
    return {
      label: displayLabel(this.s.branch),
      aheadBehind: aheadBehindText(this.s.branch),
      rootName: this.s.root ? this.s.root.split("/").filter(Boolean).pop() : (this.s.cwd ? this.s.cwd.split("/").filter(Boolean).pop() : "No folder"),
    };
  }
}

function blankState() {
  return {
    mode: "auto",
    pinnedPath: null,
    root: null,
    cwd: null,
    on: null,
    branch: null,
    merge: [],
    staged: [],
    unstaged: [],
    message: "",
    commitMode: "commit",
    confirm: null,
    error: null,
    lastCommit: null,
    loading: false,
    busy: false,
    selection: null,
    view: "list",
    fileText: null,
    diff: null,
    sectionsOpen: { merge: true, staged: true, unstaged: true },
    switcherOpen: false,
    switcherQuery: "",
    switcherList: [],
    stored: loadStored(null),
    notGit: false,
    emptyFolder: false,
    width: 380,
    fixture: null,
  };
}

export function createLiveModel(host) {
  return new Model({
    git: createGit(host),
    storage: host.storage,
    location: host.location,
  });
}

export { displayLabel, aheadBehindText, blankState };
