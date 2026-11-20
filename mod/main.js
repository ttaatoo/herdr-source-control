/** Herdr Source Control panel — VS Code-style staged / unstaged changes. */

import { View } from "gpui-kit";
import { InputState, EditorState } from "gpui-base";
import {
  spaces, panes, focused, exec, readTextFile, writeTextFile, watchFolder,
  theme, settings, checking, props, appHome, window as herdrWindow,
} from "herdr";
import { Model, createLiveModel } from "./model.js";
import { renderPanel, shortcutHint } from "./ui.js";
import { paletteFrom } from "./palette.js";

function location() {
  const space = spaces().find((s) => s.active);
  const f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return {
    cwd: pane?.cwd || f?.cwd || space?.folder || null,
    on,
    spaces: spaces(),
    panes: panes(),
    focused: f,
  };
}

const keyOf = () => JSON.stringify({ cwd: location().cwd, on: location().on, pane: focused()?.pane || null });

export default class SourceControl extends View {
  init(_props, cx) {
    this.size = { width: 380, height: 720 };
    this.typing = false;
    this.placeholder = "";
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: `Message (${shortcutHint(this.platformOf())} to commit)` });
    this.pathInput = InputState.new({ placeholder: "Add or open a local repository path" });
    this.editor = null;
    this.watched = null;
    this.context = null;

    this.input.on("change", (_e, cx) => {
      this.model.setMessage(this.input.value());
      cx.notify();
    });
    this.input.on("submit", (e, cx) => {
      if (e?.secondary) this.requestCommit(cx);
    });
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    this.pathInput.on("submit", (_e, cx) => {
      const value = (this.pathInput.value() || "").trim();
      if (value) this.choosePath(value, cx);
    });

    const forced = props()?.scene || props()?.fixture;
    if (checking() || forced) {
      this.model = new Model({ fixture: forced || "mm" });
      if (this.model.s.message) this.input.set_value(this.model.s.message);
      this.model.setWidth(this.size.width);
    } else {
      this.model = createLiveModel({
        exec,
        execStdin: null,
        storage: globalThis.localStorage,
        location,
        messageDir: `${appHome()}/mods/source-control`,
        writeFile: async (path, text) => {
          const prev = await readTextFile(path);
          await writeTextFile(path, text, prev ?? null);
        },
        readFile: (path, on) => readTextFile(path, { on }),
      });
      this.refresh(cx);
      cx.timer.every(10000, (cx) => this.refresh(cx));
    }
  }

  platformOf() {
    try { return herdrWindow()?.platform || "linux"; } catch { return "linux"; }
  }

  get platform() {
    return this.platformOf();
  }

  syncPlaceholder(text) {
    if (this.placeholder === text) return;
    this.placeholder = text;
  }

  resize(size, cx) {
    this.size = size;
    this.model.setWidth(size?.width || 0);
    if (cx) cx.notify();
  }

  render() {
    const pal = paletteFrom(theme());
    return renderPanel(this, pal)
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.keystroke === "cmd-enter" || e.keystroke === "ctrl-enter") {
          this.requestCommit(cx);
        }
      });
  }

  async close() {
    this.watched = null;
    this.input?.release?.();
    this.pathInput?.release?.();
    this.editor?.release?.();
  }

  notifyRefresh(cx) {
    if (cx) cx.notify();
  }

  work(cx, fn) {
    cx.spawn(async (cx) => {
      try {
        await fn();
      } finally {
        this.syncEditor();
        cx.notify();
      }
    });
  }

  syncEditor() {
    if (this.model.s.view === "file" && this.model.s.fileText != null) {
      if (this.editor) this.editor.release?.();
      const t = theme();
      const path = this.model.s.selection?.path || "file";
      const ext = path.includes(".") ? path.split(".").pop() : "txt";
      this.editor = EditorState.new({
        language: ext,
        value: this.model.s.fileText,
        readonly: true,
        font_family: settings()?.font_family,
        font_size: 12,
        syntax: {
          keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4,
          type: t.ansi3, number: t.ansi1, constant: t.ansi6,
        },
      });
    } else if (this.model.s.view !== "file" && this.editor) {
      this.editor.release?.();
      this.editor = null;
    }
  }

  refresh(cx) {
    if (this.model.s.fixture && !this.model.git) {
      if (cx) cx.notify();
      return;
    }
    const context = keyOf();
    if (context !== this.context) {
      this.context = context;
      this.watched = null;
    }
    this.work(cx, async () => {
      await this.model.refresh();
      this.watchRoot(cx);
    });
  }

  watchRoot(cx) {
    const root = this.model.s.root;
    const on = this.model.s.on;
    if (!root || on || this.watched === root) return;
    this.watched = root;
    cx.spawn(async (cx) => {
      try {
        while (this.watched === root) {
          await watchFolder(root);
          if (this.watched === root) {
            await this.model.refresh();
            this.syncEditor();
            cx.notify();
          }
        }
      } catch {
        if (this.watched === root) this.watched = null;
      }
    });
  }

  toggleSwitcher(cx, open) {
    this.model.toggleSwitcher(open);
    this.model.refreshSwitcher();
    cx.notify();
  }

  chooseAuto(cx) { this.work(cx, () => this.model.chooseAuto()); }
  choosePath(path, cx) {
    this.pathInput.set_value("");
    this.work(cx, () => this.model.choosePath(path));
  }

  setCommitMode(mode, cx) {
    this.model.setCommitMode(mode);
    if (mode === "amend") {
      this.work(cx, async () => {
        await this.model.loadAmendMessage();
        if (this.model.s.message) this.input.set_value(this.model.s.message);
      });
      return;
    }
    cx.notify();
  }

  requestCommit(cx) {
    this.model.setMessage(this.input.value());
    this.work(cx, async () => {
      await this.model.requestCommit();
      if (!this.model.s.message) this.input.set_value("");
    });
  }

  confirmPending(cx) { this.work(cx, () => this.model.confirmPending()); }
  cancelConfirm(cx) { this.model.cancelConfirm(); cx.notify(); }

  toggleSection(id, cx) { this.model.toggleSection(id); cx.notify(); }
  toggleFold(cx) {
    const open = !(this.model.s.sectionsOpen.staged && this.model.s.sectionsOpen.unstaged);
    this.model.setAllSections(open);
    cx.notify();
  }

  selectFile(entry, section, cx) { this.work(cx, () => this.model.selectFile(entry, section)); }
  openFromRow(entry, section, cx) {
    this.work(cx, async () => {
      await this.model.selectFile(entry, section);
      await this.model.openPreview();
    });
  }
  openPreview(cx) { this.work(cx, () => this.model.openPreview()); }
  backToDiff(cx) { this.model.backToDiff(); this.syncEditor(); cx.notify(); }

  openExternally(cx) {
    const root = this.model.s.root;
    const path = this.model.s.selection?.path;
    if (!root || !path) return;
    const full = `${root}/${path}`;
    const platform = this.platformOf();
    const cmd = platform === "macos" ? "open" : platform === "windows" ? "explorer" : "xdg-open";
    this.work(cx, async () => {
      try { await exec(cmd, [full], { on: this.model.s.on }); }
      catch (err) { this.model.s.error = String(err.message || err); }
    });
  }

  stage(entry, cx) { this.work(cx, () => this.model.stage(entry)); }
  unstage(entry, cx) { this.work(cx, () => this.model.unstage(entry)); }
  stageAll(cx) { this.work(cx, () => this.model.stageAll()); }
  unstageAll(cx) { this.work(cx, () => this.model.unstageAll()); }
  askDiscard(entry, cx) { this.model.askDiscardFile(entry); cx.notify(); }
  askDiscardAll(cx) { this.model.askDiscardAll(); cx.notify(); }
  stageHunk(index, cx) { this.work(cx, () => this.model.stageHunk(index)); }
  unstageHunk(index, cx) { this.work(cx, () => this.model.unstageHunk(index)); }
  askRevertHunk(index, cx) { this.model.askRevertHunk(index); cx.notify(); }
  fetch(cx) { this.work(cx, () => this.model.fetch()); }
  pull(cx) { this.work(cx, () => this.model.pull()); }
  push(cx) { this.work(cx, () => this.model.push()); }
}
