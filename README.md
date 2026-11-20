# Herdr Source Control

A [Herdr Desktop](https://herdr.dev) 0.1.16 mod that gives the right-hand panel a VS Code-style Source Control surface: **Staged Changes**, **Changes**, **Merge Changes**, per-file and hunk stage / unstage / discard, a commit box with ⌘Enter, and a repo switcher.

Installing the mod does **not** hide Herdr’s built-in Changes panel (0.1.16 has no `mod.json` replace hook). It is a standalone View that you can dock, split, or open as a tab. If you want **zero coexistence** with the built-in panel in a given window, clone the shipped `main` layout and point its `"id": "changes"` block at this mod — the recipe and script are below.

Upstream [issue #246](https://github.com/herdrdev/herdr-app/issues/246) / draft [PR #247](https://github.com/herdrdev/herdr-app/pull/247) would let a mod declare a tab-bar button without cloning a layout. That is **not** in 0.1.16.

## Features

- **Repo switcher** — Auto (follows the focused space / pane `cwd`), discovered workspace folders, pinned and recent local roots (persisted in `localStorage`), and a path field to open any local Git repo.
- **Branch pill** — current branch, unborn branch, or detached HEAD short SHA, plus `↑N ↓M` when an upstream exists.
- **Toolbar** — Refresh, Fetch, Pull (`--ff-only`), Push, collapse / expand all sections.
- **Commit box** — placeholder `Message (⌘Enter / Ctrl+Enter to commit on "<branch>")`. Only the platform-modified Enter key commits; plain Enter does not. Modes: **Commit**, **Amend**, **Commit & Push**.
- **Safe commit** — commits **staged** changes only, with `git commit -F <file>` so quotes and newlines in the message are not shell-injected. If nothing is staged but the worktree is dirty, the panel asks **Stage All & Commit** / **Cancel**.
- **File lists** — collapsible **Merge Changes**, **Staged Changes** (Unstage All), and **Changes** (Discard All with a confirm guard, Stage All). Rows show the filename, a muted parent path, a status letter (`M` / `A` / `D` / `R` / `U` / `C`), and Open / Stage / Unstage / Discard actions. A file with both staged and unstaged edits (`MM`) appears in **both** lists, each with its own diff.
- **Diff and preview** — staged diffs from `git diff --cached`, worktree diffs from `git diff`, untracked files as a new-file preview. Unified diff in a virtual list, with **Stage Hunk** / **Unstage Hunk** / **Revert Hunk** on `@@` headers (`git apply --cached` / `-R`). Open File shows a readonly editor in the panel, with a back-to-diff control and Open Externally.
- **Live refresh** — `watchFolder(repoRoot)`, a 10s fallback timer, and automatic follow when the active workspace `cwd` changes.
- **Narrow and wide** — a single column in a ~380–480px right panel; list + diff side by side at ≥760px. Follows the Herdr `graphite` / `paper` theme tokens.

## Install

Copy `mod/` to `mods/source-control` in a Herdr app home. The installer will not guess `~/.config/herdr-app`; pass `--home` explicitly.

```sh
git clone https://github.com/ttaatoo/herdr-source-control.git
cd herdr-source-control
node scripts/install.mjs --home "$HERDR_APP_HOME"   # e.g. ~/.config/herdr-app
```

`mod.json` is:

```json
{ "place": "right", "size": 380, "title": "Source Control", "focusable": true }
```

`place: "right"` asks Herdr to dock a copy the first time it sees a folder. On the **shipped** `main` layout, automatic docking is not always applied; if the panel does not appear after install, open it with:

```sh
herdr-app do pane.split '{"direction":"right","mod":"source-control"}'
# or
herdr-app do tab.new '{"name":"Source Control","mod":"source-control"}'
```

Then restart or reload Herdr if a running window does not pick up the new folder.

## Replace the built-in Changes panel (optional)

Herdr 0.1.16 keeps the shipped `changes` mod and the `main` layout read-only (they are restored on every start). To make the **Changes** button open this panel instead, clone `main` and retarget the block:

```json
{ "id": "changes", "type": "block", "content": { "mod": "source-control" } }
```

The helper is dry-run by default and will not write a live config unless you pass **both** `--apply` and an explicit `--home`:

```sh
node scripts/rewire-changes-layout.mjs
node scripts/rewire-changes-layout.mjs --home ~/.config/herdr-app --as my-main
node scripts/rewire-changes-layout.mjs --home ~/.config/herdr-app --as my-main --apply
herdr-app do layout.switch '{"name":"my-main"}'
```

Leave `"changes"` in the welcome `workspace.panels` list so the existing Changes button still shows — it now hosts this mod. Other layouts, and a later clone of `main`, still use the built-in panel until you rewire them the same way.

## Development

```sh
npm test
HERDR_APP_HOME=/tmp/herdr-scm-qa-home XDG_STATE_HOME=/tmp/herdr-scm-qa-state npm run check:native
HERDR_APP_HOME=/tmp/herdr-scm-qa-home XDG_STATE_HOME=/tmp/herdr-scm-qa-state npm run check:native:scenes
```

`npm test` covers the porcelain v2 parser, unified-diff / hunk patch builder, commit and confirm state, repo-switcher persistence, and a live Git integration suite against temporary repos under `/tmp/herdr-scm-live-test-*` (removed afterward).

## License

MIT. See [LICENSE](LICENSE).
