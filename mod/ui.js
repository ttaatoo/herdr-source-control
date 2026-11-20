/** VS Code-style Source Control panel render. */

import { div } from "gpui-kit";
import { v_flex, h_flex, Input, Editor, Scrollbar, v_virtual_list } from "gpui-base";
import { splitPath, statusLetter, displayLabel } from "./status.js";
import { letterColor } from "./palette.js";
import { primaryLabel, MODE_LABEL, MODES, discardConfirmText } from "./commit-state.js";

export function shortcutHint(platform) {
  return platform === "macos" ? "⌘Enter" : "Ctrl+Enter";
}

export function renderPanel(view, pal) {
  const model = view.model;
  const s = model.s;
  const wide = model.isWide();
  const body = wide
    ? h_flex().id("scm-body").flex_1().min_h(0).w_full().gap(1)
        .child(renderLists(view, pal).w(Math.min(380, Math.max(260, (s.width || 760) * 0.38))).flex_none().min_w(240).border_r_1().border_color(pal.border))
        .child(renderDetail(view, pal).flex_1().min_w(0).min_h(0))
    : v_flex().id("scm-body").flex_1().min_h(0).w_full()
        .child(renderLists(view, pal).flex_1().min_h(0))
        .when(s.view === "diff" || s.view === "file", (el) =>
          el.child(div().h(1).bg(pal.border).flex_none())
            .child(renderDetail(view, pal).flex_1().min_w(0).min_h(180)));

  return v_flex().id("root").size_full().bg(pal.background).text_color(pal.foreground)
    .on_size_change((size, cx) => view.resize(size, cx))
    .child(renderHeader(view, pal))
    .child(renderCommit(view, pal))
    .when(Boolean(s.error), (el) => el.child(banner(pal, pal.blocked, s.error, "Retry", () => view.refresh())))
    .when(Boolean(s.lastCommit) && !s.error, (el) => el.child(banner(pal, pal.done, s.lastCommit)))
    .when(Boolean(s.confirm), (el) => el.child(confirmBar(view, pal)))
    .child(body)
    .when(s.switcherOpen, (el) => el.child(renderSwitcher(view, pal)));
}

function renderHeader(view, pal) {
  const model = view.model;
  const meta = model.titleMeta();
  const auto = model.s.mode === "auto";
  return v_flex().id("scm-header").flex_none().px(10).pt(8).pb(6).gap(6).border_b_1().border_color(pal.border).bg(pal.chrome)
    .child(h_flex().w_full().items_center().gap(8)
      .child(div().id("scm-title").flex_1().min_w(0).font_semibold().text_size(13).child("Changes"))
      .child(toolBtn(view, pal, "refresh", "↻", "Refresh", () => view.refresh()))
      .child(toolBtn(view, pal, "fetch", "↓", "Fetch", () => view.fetch()))
      .child(toolBtn(view, pal, "pull", "↧", "Pull", () => view.pull()))
      .child(toolBtn(view, pal, "push", "↥", "Push", () => view.push()))
      .child(toolBtn(view, pal, "fold", model.s.sectionsOpen.staged && model.s.sectionsOpen.unstaged ? "−−" : "＋", "Collapse or expand all", () => view.toggleFold())))
    .child(h_flex().w_full().items_center().gap(6)
      .child(h_flex().id("scm-repo").flex_1().min_w(0).h(26).px(8).gap(6).items_center().rounded(6)
        .border_1().border_color(pal.input).cursor_pointer().hover((s) => s.bg(pal.hover))
        .on_click((_e, cx) => view.toggleSwitcher(cx))
        .child(div().text_size(12).text_color(pal.muted).flex_none().child(auto ? "Auto" : "Repo"))
        .child(div().flex_1().min_w(0).truncate().text_size(12).child(meta.rootName))
        .child(div().text_size(10).text_color(pal.dim).flex_none().child("▾")))
      .child(div().id("scm-branch").h(26).px(8).flex().items_center().rounded(6).bg(pal.raised).text_size(11)
        .text_color(pal.muted).max_w(160).child(div().truncate().child(meta.label)))
      .when(Boolean(meta.aheadBehind), (el) =>
        el.child(div().id("scm-ab").h(26).px(6).flex().items_center().text_size(11).text_color(pal.accent).child(meta.aheadBehind))));
}

function renderCommit(view, pal) {
  const model = view.model;
  const s = model.s;
  const decision = model.decision();
  const enabled = decision.action !== "disabled" && !s.busy;
  const branch = displayLabel(s.branch);
  const hint = shortcutHint(view.platform);
  const placeholder = `Message (${hint} to commit on "${branch}")`;
  view.syncPlaceholder(placeholder);

  return v_flex().id("scm-commit").flex_none().p(10).gap(8).border_b_1().border_color(pal.border)
    .child(div().id("commit-message").w_full().h(56).px(10).py(6).rounded(8).border_1()
      .border_color(view.typing ? pal.accent : pal.input).bg(pal.surface).cursor_text()
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(Input.new(view.input).size_full().text_size(12).text_color(pal.foreground)))
    .child(h_flex().w_full().gap(6).items_center()
      .child(div().id("commit").flex_1().h(32).px(14).flex().items_center().justify_center().rounded(8)
        .bg(enabled ? pal.solid : pal.raised).text_color(enabled ? pal.solidForeground : pal.dim).text_size(12).font_semibold()
        .when(enabled, (e) => e.cursor_pointer())
        .on_click((_e, cx) => view.requestCommit(cx))
        .child(s.busy ? "Working…" : primaryLabel(decision.action, s.commitMode)))
      .child(h_flex().id("commit-modes").h(32).rounded(8).border_1().border_color(pal.border).overflow_hidden()
        .children(MODES.map((mode) =>
          div().id(`mode-${mode}`).h_full().px(8).flex().items_center().text_size(11)
            .bg(s.commitMode === mode ? pal.selected : pal.surface)
            .text_color(s.commitMode === mode ? pal.foreground : pal.muted)
            .cursor_pointer().hover((st) => st.bg(pal.hover))
            .on_click((_e, cx) => view.setCommitMode(mode, cx))
            .child(MODE_LABEL[mode])))));
}

function confirmBar(view, pal) {
  const text = discardConfirmText(view.model.s.confirm);
  const kind = view.model.s.confirm?.kind;
  const go = kind === "stage-all-commit" ? "Stage All & Commit" : "Confirm";
  return h_flex().id("scm-confirm").flex_none().px(10).py(8).gap(8).items_center().bg(pal.raised).border_b_1().border_color(pal.border)
    .child(div().flex_1().min_w(0).text_size(12).text_color(pal.foreground).child(text))
    .child(div().id("confirm-yes").h(26).px(10).rounded(6).bg(kind === "stage-all-commit" ? pal.solid : pal.blocked)
      .text_color(kind === "stage-all-commit" ? pal.solidForeground : pal.background).text_size(11).cursor_pointer()
      .flex().items_center().on_click((_e, cx) => view.confirmPending(cx)).child(go))
    .child(div().id("confirm-no").h(26).px(10).rounded(6).border_1().border_color(pal.border)
      .text_size(11).cursor_pointer().flex().items_center().on_click((_e, cx) => view.cancelConfirm(cx)).child("Cancel"));
}

function banner(pal, color, text, action, fn) {
  return h_flex().id("scm-banner").flex_none().px(10).py(6).gap(8).items_center().border_b_1().border_color(pal.border)
    .child(div().flex_1().min_w(0).text_size(11).text_color(color).child(text))
    .when(Boolean(action), (el) =>
      el.child(div().id("banner-action").text_size(11).text_color(pal.accent).cursor_pointer().on_click((_e, cx) => fn && fn(cx)).child(action)));
}

function renderLists(view, pal) {
  const s = view.model.s;
  const empty = view.model.emptyKind();
  return v_flex().id("scm-lists").min_h(0).flex_1().overflow_y_scrollbar()
    .when(Boolean(empty), (el) => el.child(emptyState(pal, empty, s)))
    .when(!empty || s.merge.length || s.staged.length || s.unstaged.length, (el) => el
      .when(s.merge.length > 0, (e) => e.child(section(view, pal, "merge", "Merge Changes", s.merge, [])))
      .child(section(view, pal, "staged", "Staged Changes", s.staged, [
        { id: "unstage-all", label: "−", title: "Unstage All", run: (cx) => view.unstageAll(cx) },
      ]))
      .child(section(view, pal, "unstaged", "Changes", s.unstaged, [
        { id: "discard-all", label: "↺", title: "Discard All", run: (cx) => view.askDiscardAll(cx) },
        { id: "stage-all", label: "+", title: "Stage All", run: (cx) => view.stageAll(cx) },
      ])));
}

function emptyState(pal, kind, s) {
  const text = {
    "no-folder": "No folder",
    "not-git": "The folder is not a Git repository",
    clean: "No uncommitted changes",
    error: s.error || "Cannot load changes",
  }[kind] || "No uncommitted changes";
  return div().id("scm-empty").p(16).text_size(12).text_color(pal.dim).child(text);
}

function section(view, pal, id, title, entries, actions) {
  const open = view.model.s.sectionsOpen[id];
  return v_flex().id(`section-${id}`).flex_none()
    .child(h_flex().id(`section-${id}-head`).h(28).px(8).gap(6).items_center().cursor_pointer()
      .hover((st) => st.bg(pal.hover))
      .on_click((_e, cx) => view.toggleSection(id, cx))
      .child(div().w(10).text_size(11).text_color(pal.dim).child(open ? "▾" : "▸"))
      .child(div().flex_1().min_w(0).text_size(11).font_semibold().text_color(pal.muted).child(title))
      .children(actions.map((action) =>
        div().id(action.id).size(22).flex().items_center().justify_center().rounded(4)
          .text_size(13).text_color(pal.muted).cursor_pointer().hover((st) => st.bg(pal.selected).text_color(pal.foreground))
          .on_click((e, cx) => { e.stop_propagation?.(); cx.stop_propagation(); action.run(cx); })
          .child(action.label)))
      .child(div().id(`count-${id}`).h(18).min_w(18).px(5).rounded(9).bg(pal.raised).text_size(10)
        .text_color(pal.muted).flex().items_center().justify_center().child(String(entries.length))))
    .when(open, (el) => el.children(entries.map((entry) => fileRow(view, pal, id, entry))));
}

function fileRow(view, pal, sectionId, entry) {
  const { name, dir } = splitPath(entry.path);
  const letter = statusLetter(entry, sectionId === "unstaged" ? "unstaged" : sectionId === "merge" ? "merge" : "staged");
  const selected = view.model.s.selection?.path === entry.path && view.model.s.selection?.section === sectionId;
  const hoverActions = sectionId === "staged"
    ? [
        { id: "open", label: "◈", run: (cx) => view.openFromRow(entry, sectionId, cx) },
        { id: "unstage", label: "−", run: (cx) => view.unstage(entry, cx) },
      ]
    : sectionId === "merge"
      ? [{ id: "open", label: "◈", run: (cx) => view.openFromRow(entry, sectionId, cx) }]
      : [
          { id: "open", label: "◈", run: (cx) => view.openFromRow(entry, sectionId, cx) },
          { id: "discard", label: "↺", run: (cx) => view.askDiscard(entry, cx) },
          { id: "stage", label: "+", run: (cx) => view.stage(entry, cx) },
        ];

  return h_flex().id(`file-${sectionId}-${entry.path}`).h(28).px(8).gap(6).items_center().flex_none()
    .bg(selected ? pal.selected : pal.background)
    .hover((st) => st.bg(selected ? pal.selected : pal.hover))
    .cursor_pointer()
    .on_click((_e, cx) => view.selectFile(entry, sectionId, cx))
    .child(div().flex_1().min_w(0).text_size(12)
      .child(h_flex().w_full().gap(6).items_center()
        .child(div().flex_none().child(name))
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(pal.dim).child(dir))))
    .children(hoverActions.map((action) =>
      div().id(`row-${sectionId}-${action.id}-${entry.path}`).size(22).flex_none().flex().items_center().justify_center()
        .rounded(4).text_size(13).text_color(pal.muted).hover((st) => st.bg(pal.raised).text_color(pal.foreground))
        .on_click((e, cx) => { cx.stop_propagation(); action.run(cx); })
        .child(action.label)))
    .child(div().w(14).flex_none().text_size(11).font_semibold().text_color(letterColor(pal, letter)).child(letter));
}

function renderDetail(view, pal) {
  const s = view.model.s;
  if (s.view === "file" && s.fileText != null && view.editor) {
    return v_flex().id("scm-file").size_full().min_h(0)
      .child(detailBar(view, pal, s.selection?.path || "File", [
        { id: "back-diff", label: "← Diff", run: (cx) => view.backToDiff(cx) },
        { id: "open-ext", label: "Open Externally", run: (cx) => view.openExternally(cx) },
      ]))
      .child(Editor.new(view.editor).id("file-editor").flex_1().min_h(0));
  }
  const diff = s.diff;
  if (!diff || s.view === "list") {
    return v_flex().id("scm-detail-empty").size_full().min_h(0).p(16)
      .child(div().text_size(12).text_color(pal.dim).child("Select a file to see its diff"));
  }
  const stats = diff.stats || { added: 0, removed: 0 };
  const rows = diff.rows || [];
  const diffWidth = Math.max(300, ...rows.map((row) => ((row.text || "").length + 1) * 7 + 80));
  return v_flex().id("scm-diff").size_full().min_h(0)
    .child(detailBar(view, pal, diff.file?.path || "Diff", [
      { id: "open-file", label: "Open File", run: (cx) => view.openPreview(cx) },
    ], `+${stats.added} −${stats.removed}`))
    .when((diff.file?.hunks || []).length > 0 && !diff.file?.binary, (el) => el.child(hunkStrip(view, pal, diff)))
    .child(div().id("scm-diff-body").flex_1().min_h(0).w_full().relative()
      .child(div().id("scm-diff-x").size_full().overflow_x_scrollbar()
        .child(div().w_full().min_w(diffWidth).h_full()
          .child(v_virtual_list("scm-diff-rows", rows.length, 20, (i) => String(i),
            (range) => rows.slice(range.start, range.end).map((row) => diffRow(pal, row))).size_full())))
      .child(Scrollbar.vertical("scm-diff-rows").viewport_from_layout().absolute().inset_0()));
}


function hunkStrip(view, pal, diff) {
  const section = diff.section;
  return v_flex().id("scm-hunks").flex_none().border_b_1().border_color(pal.border)
    .children((diff.file.hunks || []).map((hunk, hunkIndex) => {
      const actions = section === "staged"
        ? [{ id: "unstage-hunk", label: "Unstage Hunk", run: (cx) => view.unstageHunk(hunkIndex, cx) }]
        : [
            { id: "stage-hunk", label: "Stage Hunk", run: (cx) => view.stageHunk(hunkIndex, cx) },
            { id: "revert-hunk", label: "Revert Hunk", run: (cx) => view.askRevertHunk(hunkIndex, cx) },
          ];
      return h_flex().id(`hunk-bar-${hunkIndex}`).h(24).px(8).gap(8).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(pal.hunk).child(hunk.header))
        .children(actions.map((action) =>
          div().id(`${action.id}-bar-${hunkIndex}`).px(6).h(18).rounded(4).text_size(10).text_color(pal.accent)
            .cursor_pointer().hover((st) => st.bg(pal.hover)).on_click((_e, cx) => action.run(cx)).child(action.label)));
    }));
}

function detailBar(view, pal, title, actions, stats) {
  return h_flex().id("scm-detail-bar").h(30).px(8).gap(8).items_center().flex_none().border_b_1().border_color(pal.border).bg(pal.chrome)
    .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(pal.muted).child(title))
    .when(Boolean(stats), (el) => el.child(div().text_size(11).text_color(pal.dim).child(stats)))
    .children(actions.map((action) =>
      div().id(action.id).h(22).px(8).rounded(4).text_size(11).text_color(pal.accent).cursor_pointer()
        .hover((st) => st.bg(pal.hover)).on_click((_e, cx) => action.run(cx)).child(action.label)));
}

/** Pure presentational row for v_virtual_list. Never register on_click/on_hover here:
 *  Herdr rebuilds virtual rows every frame and rejects interactive handlers in the item renderer. */
function diffRow(pal, row) {
  if (row.kind === "@") {
    return div().w_full().h(20).flex_none().px(12).truncate().bg(pal.raised).text_size(11).text_color(pal.hunk).child(row.text);
  }
  if (row.kind === "notice") {
    return div().w_full().px(12).py(8).text_size(12).text_color(pal.dim).child(row.text);
  }
  if (row.kind === "\\") {
    return div().w_full().h(20).flex_none().px(12).truncate().text_size(11).text_color(pal.dim).child(row.text);
  }
  const added = withAlpha(pal.added, "22");
  const removed = withAlpha(pal.removed, "22");
  const bg = row.kind === "+" ? added : row.kind === "-" ? removed : pal.background;
  const fg = row.kind === "+" ? pal.added : row.kind === "-" ? pal.removed : pal.foreground;
  const mark = row.kind === "+" || row.kind === "-" ? row.kind : " ";
  const oldNo = row.kind === "+" ? "" : (row.oldNumber == null ? "" : String(row.oldNumber));
  const newNo = row.kind === "-" ? "" : (row.newNumber == null && row.number == null ? "" : String(row.newNumber ?? row.number));
  return h_flex().w_full().h(20).flex_none().px(4).gap(8).items_center().bg(bg)
    .child(div().w(36).flex_none().text_right().text_size(10).text_color(pal.dim).child(oldNo))
    .child(div().w(36).flex_none().text_right().text_size(10).text_color(pal.dim).child(newNo))
    .child(div().w(10).flex_none().text_size(12).text_color(fg).child(mark))
    .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(fg).child(row.text));
}

function withAlpha(hex, alpha) {
  const raw = String(hex || "").replace("#", "");
  if (raw.length === 6 && /^[0-9a-fA-F]+$/.test(raw)) return `#${raw}${alpha}`;
  return hex;
}

function renderSwitcher(view, pal) {
  const s = view.model.s;
  const q = (s.switcherQuery || "").trim().toLowerCase();
  const rows = (s.switcherList || []).filter((r) => !q || r.path.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  return v_flex().id("scm-switcher").absolute().top(78).left(10).right(10).rounded(8).border_1().border_color(pal.border)
    .bg(pal.popover).shadow_md().p(8).gap(6)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(h_flex().gap(6).items_center()
      .child(div().id("switch-auto").h(24).px(8).rounded(6).text_size(11).cursor_pointer()
        .bg(s.mode === "auto" ? pal.selected : pal.raised)
        .on_click((_e, cx) => view.chooseAuto(cx)).child("Auto (Active Workspace)"))
      .child(div().flex_1())
      .child(div().id("switch-close").size(22).flex().items_center().justify_center().cursor_pointer()
        .on_click((_e, cx) => view.toggleSwitcher(cx, false)).child("×")))
    .child(div().id("switch-path").h(28).px(8).rounded(6).border_1().border_color(pal.input)
      .cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(Input.new(view.pathInput).h_full().text_size(12).text_color(pal.foreground)))
    .children(rows.map((row) =>
      h_flex().id(`repo-${row.path}`).h(28).px(8).gap(8).items_center().rounded(6).cursor_pointer()
        .bg(row.current ? pal.selected : pal.popover).hover((st) => st.bg(pal.hover))
        .on_click((_e, cx) => view.choosePath(row.path, cx))
        .child(div().flex_1().min_w(0)
          .child(div().text_size(12).child(row.name))
          .child(div().text_size(10).text_color(pal.dim).truncate().child(row.path)))
        .child(div().text_size(10).text_color(pal.muted).child(row.source))));
}

function toolBtn(view, pal, id, label, title, run) {
  return div().id(`tool-${id}`).size(26).flex_none().flex().items_center().justify_center().rounded(6)
    .text_size(13).text_color(pal.dim).cursor_pointer().hover((s) => s.bg(pal.hover).text_color(pal.foreground))
    .on_click((_e, cx) => run(cx))
    .child(label);
}

