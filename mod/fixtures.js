/** Fixture snapshots for herdr-app check and native scene matrix. */

import { parseUnifiedDiff, diffRows, summarizeDiff, untrackedAsDiff } from "./diff.js";

const MM_DIFF_UNSTAGED = `diff --git a/apps/packages/product-ui/bot-creation.tsx b/apps/packages/product-ui/bot-creation.tsx
index 1111111..2222222 100644
--- a/apps/packages/product-ui/bot-creation.tsx
+++ b/apps/packages/product-ui/bot-creation.tsx
@@ -10,7 +10,8 @@ export function BotCreation() {
   const ready = true;
-  return <Panel title="Draft" />;
+  const title = "Ready";
+  return <Panel title={title} />;
 }
@@ -40,6 +40,7 @@ function Footer() {
   return (
     <footer>
       <span>Save</span>
+      <span>Publish</span>
     </footer>
   );
 }
`;

const MM_DIFF_STAGED = `diff --git a/apps/packages/product-ui/bot-creation.tsx b/apps/packages/product-ui/bot-creation.tsx
index 0000000..1111111 100644
--- a/apps/packages/product-ui/bot-creation.tsx
+++ b/apps/packages/product-ui/bot-creation.tsx
@@ -1,5 +1,6 @@
 import { Panel } from "./panel";
+import { useReady } from "./hooks";
 
 export function BotCreation() {
   return null;
 }
`;

const mmFile = (path, xy) => ({
  kind: "ordinary",
  path,
  origPath: null,
  index: xy[0] === " " ? " " : xy[0],
  worktree: xy[1] === " " ? " " : xy[1],
  xy,
  staged: xy[0] !== " ",
  unstaged: xy[1] !== " ",
  renameKind: null,
});

function withDiff(fileText, section) {
  const parsed = parseUnifiedDiff(fileText);
  const file = parsed.files[0];
  return { file, section, rows: diffRows(file), stats: summarizeDiff(file) };
}

const BASE = {
  mode: "auto",
  pinnedPath: null,
  root: "/work/open_tag",
  cwd: "/work/open_tag",
  on: null,
  branch: { oid: "aaaaaaaaaaaaaaaa", initial: false, detached: false, head: "taoyi/v1.0.0-rc-2026", upstream: "origin/taoyi/v1.0.0-rc-2026", ahead: 1, behind: 0 },
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
  switcherList: [
    { path: "/work/open_tag", name: "open_tag", source: "workspace", current: true, auto: true },
    { path: "/work/herdr-source-control", name: "herdr-source-control", source: "recent", current: false, auto: false },
  ],
  stored: { recents: ["/work/open_tag"], pinned: [] },
  notGit: false,
  emptyFolder: false,
  width: 380,
  fixture: true,
};

export const SCENES = ["clean", "mm", "diff-hunk", "discard-confirm", "repo-switcher", "not-git", "unborn"];

export function sceneState(name) {
  switch (name) {
    case "clean":
      return { ...clone(BASE), staged: [], unstaged: [], merge: [] };
    case "unborn":
      return {
        ...clone(BASE),
        branch: { oid: null, initial: true, detached: false, head: "main", upstream: null, ahead: null, behind: null },
        staged: [mmFile("README.md", "A ")],
        unstaged: [{ ...mmFile("notes/你好.txt", "??"), kind: "untracked", index: "?", worktree: "?", xy: "??", staged: false, unstaged: true }],
      };
    case "not-git":
      return {
        ...clone(BASE),
        root: null,
        cwd: "/tmp/plain-folder",
        branch: null,
        notGit: true,
        emptyFolder: false,
        staged: [],
        unstaged: [],
        switcherList: [{ path: "/tmp/plain-folder", name: "plain-folder", source: "workspace", current: true, auto: false }],
      };
    case "repo-switcher":
      return { ...clone(BASE), switcherOpen: true };
    case "discard-confirm":
      return {
        ...mmState(),
        confirm: { kind: "discard-file", path: "apps/packages/product-ui/bot-creation.tsx", untracked: false },
      };
    case "diff-hunk":
      return {
        ...mmState(),
        selection: { path: "apps/packages/product-ui/bot-creation.tsx", section: "unstaged", kind: "ordinary" },
        view: "diff",
        diff: withDiff(MM_DIFF_UNSTAGED, "unstaged"),
      };
    case "mm":
    default:
      return mmState();
  }
}

function mmState() {
  const path = "apps/packages/product-ui/bot-creation.tsx";
  const mm = mmFile(path, "MM");
  const added = mmFile("docs/guide.md", "A ");
  const untracked = { ...mmFile("scratch/tmp file.txt", "??"), kind: "untracked", index: "?", worktree: "?", staged: false, unstaged: true, xy: "??" };
  const deleted = mmFile("old/legacy.js", " D");
  return {
    ...clone(BASE),
    staged: [mm, added],
    unstaged: [mm, deleted, untracked],
    merge: [],
  };
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

export const SAMPLE_DIFFS = { MM_DIFF_UNSTAGED, MM_DIFF_STAGED };
export { untrackedAsDiff };
