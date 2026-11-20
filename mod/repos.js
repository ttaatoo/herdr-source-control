/** Repo switcher candidates, Auto mode, and recent-path persistence. */

const STORAGE_KEY = "herdr-source-control.repos.v1";
const MAX_RECENTS = 12;

export { STORAGE_KEY, MAX_RECENTS };

export function normalizeRepoPath(p) {
  if (p == null) return "";
  let s = String(p).trim();
  if (!s) return "";
  s = s.replaceAll("\\", "/");
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

export function uniquePaths(paths) {
  const seen = new Set();
  const out = [];
  for (const raw of paths || []) {
    const p = normalizeRepoPath(raw);
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

/** Priority folders to try in Auto mode: focused pane cwd, then other panes, then space folders. */
export function autoCandidates({ spaces = [], panes = [], focused = null } = {}) {
  const ordered = [];
  const activeSpace = (spaces || []).find((s) => s.active) || null;
  const focusedPane = focused?.pane ? (panes || []).find((p) => p.pane === focused.pane) : null;
  if (focusedPane?.cwd) ordered.push(focusedPane.cwd);
  if (focused?.cwd) ordered.push(focused.cwd);
  if (activeSpace?.folder) ordered.push(activeSpace.folder);
  for (const pane of panes || []) {
    if (pane?.cwd) ordered.push(pane.cwd);
  }
  for (const space of spaces || []) {
    if (space?.folder) ordered.push(space.folder);
  }
  return uniquePaths(ordered);
}

export function discoverWorkspaceRepos({ spaces = [], panes = [], focused = null } = {}) {
  return autoCandidates({ spaces, panes, focused }).map((path) => ({
    path,
    source: "workspace",
  }));
}

export function loadStored(raw) {
  const empty = { recents: [], pinned: [] };
  if (raw == null || raw === "") return empty;
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      recents: uniquePaths(data.recents || data.recent || []),
      pinned: uniquePaths(data.pinned || []),
    };
  } catch {
    return empty;
  }
}

export function dumpStored(stored) {
  return JSON.stringify({
    recents: uniquePaths(stored?.recents).slice(0, MAX_RECENTS),
    pinned: uniquePaths(stored?.pinned),
  });
}

export function rememberPath(stored, path) {
  const p = normalizeRepoPath(path);
  if (!p) return stored || { recents: [], pinned: [] };
  const recents = uniquePaths([p, ...(stored?.recents || [])]).slice(0, MAX_RECENTS);
  return { recents, pinned: uniquePaths(stored?.pinned) };
}

export function togglePinned(stored, path) {
  const p = normalizeRepoPath(path);
  const pinned = uniquePaths(stored?.pinned);
  const next = pinned.includes(p) ? pinned.filter((x) => x !== p) : uniquePaths([p, ...pinned]);
  return { recents: uniquePaths(stored?.recents), pinned: next };
}

export function mergeSwitcherList({ workspace = [], stored = { recents: [], pinned: [] }, current = null, autoRoot = null } = {}) {
  const rows = [];
  const seen = new Set();
  const add = (path, source) => {
    const p = normalizeRepoPath(path);
    if (!p || seen.has(p)) return;
    seen.add(p);
    rows.push({
      path: p,
      name: p.split("/").filter(Boolean).pop() || p,
      source,
      current: p === normalizeRepoPath(current),
      auto: p === normalizeRepoPath(autoRoot),
    });
  };
  for (const p of stored.pinned || []) add(p, "pinned");
  for (const item of workspace) add(item.path || item, "workspace");
  for (const p of stored.recents || []) add(p, "recent");
  if (current) add(current, "current");
  return rows;
}

export function readStorage(storage) {
  if (!storage || typeof storage.getItem !== "function") return loadStored(null);
  try {
    return loadStored(storage.getItem(STORAGE_KEY));
  } catch {
    return loadStored(null);
  }
}

export function writeStorage(storage, stored) {
  if (!storage || typeof storage.setItem !== "function") return;
  storage.setItem(STORAGE_KEY, dumpStored(stored));
}
