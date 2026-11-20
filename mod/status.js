/** Parse `git status --porcelain=v2 -z` (and optional `# branch.*` headers). */

const ORDINARY = /^1 (.)(.) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) (.*)$/;
const RENAME = /^2 (.)(.) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) ([RC])(\d+) (.*)$/;
const UNMERGED = /^u (.)(.) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) (.*)$/;
const UNTRACKED = /^\? (.*)$/;
const IGNORED = /^! (.*)$/;
const BRANCH_OID = /^# branch\.oid (.+)$/;
const BRANCH_HEAD = /^# branch\.head (.+)$/;
const BRANCH_UPSTREAM = /^# branch\.upstream (.+)$/;
const BRANCH_AB = /^# branch\.ab \+(\d+) -(\d+)$/;

/**
 * @typedef {object} StatusEntry
 * @property {"ordinary"|"rename"|"unmerged"|"untracked"} kind
 * @property {string} path
 * @property {string|null} origPath
 * @property {string} index  first XY letter (index vs HEAD); space if unchanged
 * @property {string} worktree  second XY letter (worktree vs index); space if unchanged
 * @property {string} xy
 * @property {boolean} staged
 * @property {boolean} unstaged
 */

/**
 * @param {string} text
 * @returns {{ entries: StatusEntry[], branch: {
 *   oid: string|null, initial: boolean, detached: boolean, head: string|null,
 *   upstream: string|null, ahead: number|null, behind: number|null
 * } }}
 */
export function parsePorcelainV2(text) {
  const src = text ?? "";
  const tokens = src.split("\0");
  const entries = [];
  const branch = {
    oid: null,
    initial: false,
    detached: false,
    head: null,
    upstream: null,
    ahead: null,
    behind: null,
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    let m = token.match(BRANCH_OID);
    if (m) {
      if (m[1] === "(initial)") {
        branch.initial = true;
        branch.oid = null;
      } else {
        branch.oid = m[1];
      }
      continue;
    }
    m = token.match(BRANCH_HEAD);
    if (m) {
      if (m[1] === "(detached)") {
        branch.detached = true;
        branch.head = null;
      } else {
        branch.head = m[1];
      }
      continue;
    }
    m = token.match(BRANCH_UPSTREAM);
    if (m) {
      branch.upstream = m[1];
      continue;
    }
    m = token.match(BRANCH_AB);
    if (m) {
      branch.ahead = Number(m[1]);
      branch.behind = Number(m[2]);
      continue;
    }
    if (token.startsWith("# ")) continue;

    m = token.match(ORDINARY);
    if (m) {
      entries.push(makeEntry("ordinary", m[1], m[2], m[9], null));
      continue;
    }
    m = token.match(RENAME);
    if (m) {
      const orig = tokens[i + 1] ?? "";
      i += 1;
      entries.push(makeEntry("rename", m[1], m[2], m[11], orig || null, m[9]));
      continue;
    }
    m = token.match(UNMERGED);
    if (m) {
      entries.push(makeEntry("unmerged", m[1], m[2], m[11], null));
      continue;
    }
    m = token.match(UNTRACKED);
    if (m) {
      entries.push(makeEntry("untracked", "?", "?", m[1], null));
      continue;
    }
    if (IGNORED.test(token)) continue;

    throw new Error(`Unrecognized porcelain v2 record: ${JSON.stringify(token)}`);
  }

  return { entries, branch };
}

function makeEntry(kind, index, worktree, path, origPath, renameKind = null) {
  const xy = `${index}${worktree}`;
  const staged = kind !== "untracked" && kind !== "unmerged" && index !== " " && index !== ".";
  const unstaged = kind === "untracked" || (kind !== "unmerged" && worktree !== " " && worktree !== ".");
  return {
    kind,
    path,
    origPath: origPath || null,
    index,
    worktree,
    xy,
    staged,
    unstaged,
    renameKind,
  };
}

/** Split entries into VS Code-style sections. An `MM` file appears in both staged and changes. */
export function classifyEntries(entries) {
  const merge = [];
  const staged = [];
  const unstaged = [];
  for (const entry of entries) {
    if (entry.kind === "unmerged") merge.push(entry);
    if (entry.staged) staged.push(entry);
    if (entry.unstaged) unstaged.push(entry);
  }
  return { merge, staged, unstaged };
}

/** Status letter shown in a given section, matching VS Code (U for untracked). */
export function statusLetter(entry, section) {
  if (section === "merge") return "C";
  if (section === "staged") {
    if (entry.index === "R" || entry.renameKind === "R") return "R";
    if (entry.index === "C" || entry.renameKind === "C") return "C";
    return (entry.index || "M").trim() || "M";
  }
  if (entry.kind === "untracked") return "U";
  if (entry.worktree === "R" || (entry.kind === "rename" && !entry.staged)) return "R";
  return (entry.worktree || "M").trim() || "M";
}

/** VS Code-style filename + muted parent path. */
export function splitPath(filePath) {
  const normalized = (filePath || "").replaceAll("\\", "/");
  const i = normalized.lastIndexOf("/");
  if (i < 0) return { name: normalized, dir: "" };
  return { name: normalized.slice(i + 1), dir: normalized.slice(0, i) };
}

export function displayLabel(branch) {
  if (!branch) return "no branch";
  if (branch.initial) return branch.head ? `${branch.head} (unborn)` : "unborn";
  if (branch.detached) {
    const sha = branch.oid ? branch.oid.slice(0, 7) : "HEAD";
    return `detached ${sha}`;
  }
  return branch.head || "HEAD";
}

export function aheadBehindText(branch) {
  if (!branch || branch.ahead == null || branch.behind == null) return "";
  if (!branch.ahead && !branch.behind) return "";
  const parts = [];
  if (branch.ahead) parts.push(`↑${branch.ahead}`);
  if (branch.behind) parts.push(`↓${branch.behind}`);
  return parts.join(" ");
}
