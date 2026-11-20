/** Unified-diff parsing, virtual-list rows, and single-hunk patch building. */

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

const untab = (text) =>
  (text || "").replace(/[^\t]*\t/g, (s) => s.slice(0, -1).padEnd((s.length - 1) - (s.length - 1) % 4 + 4));

/**
 * Parse `git diff` / `git diff --cached` output into files and hunks.
 * @param {string} text
 */
export function parseUnifiedDiff(text) {
  const src = text ?? "";
  if (!src.trim()) return { files: [], binary: false };
  if (/^Binary files /.test(src) || /GIT binary patch/.test(src)) {
    const path = guessPathFromHeader(src);
    return {
      files: [{
        path,
        oldPath: path,
        binary: true,
        newFile: false,
        deleted: false,
        headers: src.trim().split("\n").filter((l) => !l.startsWith("Binary") && !l.startsWith("GIT ")),
        hunks: [],
        notice: "Binary file · no text diff",
      }],
    };
  }

  const files = [];
  let current = null;
  const lines = src.split("\n");
  // Drop a trailing empty line from the final newline without eating empty hunk context.
  if (lines.length && lines[lines.length - 1] === "") lines.pop();

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      current = newFile(line);
      files.push(current);
      current.headers.push(line);
      continue;
    }
    if (!current) {
      current = newFile(line);
      files.push(current);
    }
    const hunk = line.match(HUNK_RE);
    if (hunk) {
      current.hunks.push({
        header: line,
        oldStart: Number(hunk[1]),
        oldCount: hunk[2] == null ? 1 : Number(hunk[2]),
        newStart: Number(hunk[3]),
        newCount: hunk[4] == null ? 1 : Number(hunk[4]),
        trailer: hunk[5] || "",
        lines: [],
      });
      continue;
    }
    const lastHunk = current.hunks[current.hunks.length - 1];
    if (lastHunk && (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ") || line === "\\ No newline at end of file" || line.startsWith("\\"))) {
      if (line.startsWith("\\")) {
        lastHunk.lines.push({ kind: "\\", text: line });
      } else {
        lastHunk.lines.push({ kind: line[0], text: line.slice(1) });
      }
      continue;
    }
    current.headers.push(line);
    if (line.startsWith("+++ ")) current.path = stripPrefix(line.slice(4));
    if (line.startsWith("--- ")) current.oldPath = stripPrefix(line.slice(4));
    if (line.startsWith("new file mode")) current.newFile = true;
    if (line.startsWith("deleted file mode")) current.deleted = true;
    if (line.startsWith("rename from ")) current.oldPath = line.slice("rename from ".length);
    if (line.startsWith("rename to ")) current.path = line.slice("rename to ".length);
    if (/^Binary files /.test(line) || line === "Binary file changed") {
      current.binary = true;
      current.notice = "Binary file · no text diff";
    }
  }

  for (const file of files) {
    if (!file.path) file.path = file.oldPath || guessPathFromHeader(file.headers[0] || "");
    if (!file.oldPath) file.oldPath = file.path;
  }
  return { files };
}

function newFile(firstLine) {
  const guessed = guessPathFromHeader(firstLine);
  return {
    path: guessed,
    oldPath: guessed,
    binary: false,
    newFile: false,
    deleted: false,
    headers: [],
    hunks: [],
    notice: null,
  };
}

function guessPathFromHeader(line) {
  const m = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
  if (m) return m[2];
  return "";
}

function stripPrefix(path) {
  const raw = path.replace(/\t.*$/, "");
  if (raw === "/dev/null") return "/dev/null";
  if (raw.startsWith("a/") || raw.startsWith("b/")) return raw.slice(2);
  return raw;
}

/** Build a self-contained patch that applies one hunk of a parsed file diff. */
export function buildHunkPatch(file, hunkIndex) {
  if (!file || !file.hunks[hunkIndex]) throw new Error("No such hunk");
  const hunk = file.hunks[hunkIndex];
  const headers = ensureFileHeaders(file);
  const body = [hunk.header, ...hunk.lines.map(serializeLine)];
  const text = [...headers, ...body].join("\n");
  return text.endsWith("\n") ? text : `${text}\n`;
}

function ensureFileHeaders(file) {
  const headers = [...file.headers];
  const hasDiff = headers.some((l) => l.startsWith("diff --git "));
  const hasOld = headers.some((l) => l.startsWith("--- "));
  const hasNew = headers.some((l) => l.startsWith("+++ "));
  if (!hasDiff) {
    const a = file.deleted || file.oldPath === "/dev/null" ? file.path : (file.oldPath || file.path);
    headers.unshift(`diff --git a/${a} b/${file.path}`);
  }
  if (!hasOld) headers.push(file.newFile || file.oldPath === "/dev/null" ? "--- /dev/null" : `--- a/${file.oldPath || file.path}`);
  if (!hasNew) headers.push(file.deleted ? "+++ /dev/null" : `+++ b/${file.path}`);
  return headers;
}

function serializeLine(line) {
  if (line.kind === "\\") return line.text.startsWith("\\") ? line.text : `\\ ${line.text}`;
  return `${line.kind}${line.text}`;
}

/** Present an untracked file as a new-file unified diff so it can be previewed and hunk-staged. */
export function untrackedAsDiff(path, content) {
  const raw = content ?? "";
  const endsWithNl = raw.endsWith("\n") || raw.length === 0;
  const lines = raw.length === 0 ? [] : raw.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const plus = lines.map((text) => ({ kind: "+", text }));
  if (raw.length && !endsWithNl) plus.push({ kind: "\\", text: "\\ No newline at end of file" });
  const count = lines.length;
  const headers = [
    `diff --git a/${path} b/${path}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${path}`,
  ];
  const hunks = [{
    header: `@@ -0,0 +1,${count || 0} @@`.replace("+1,0", "+0,0"),
    oldStart: 0,
    oldCount: 0,
    newStart: count ? 1 : 0,
    newCount: count,
    trailer: "",
    lines: plus,
  }];
  if (count === 0) {
    hunks[0].header = "@@ -0,0 +0,0 @@";
  }
  return {
    path,
    oldPath: "/dev/null",
    binary: false,
    newFile: true,
    deleted: false,
    headers,
    hunks,
    notice: null,
  };
}

export function summarizeDiff(file) {
  let added = 0, removed = 0;
  if (!file) return { added: 0, removed: 0 };
  for (const hunk of file.hunks || []) {
    for (const line of hunk.lines) {
      if (line.kind === "+") added += 1;
      else if (line.kind === "-") removed += 1;
    }
  }
  return { added, removed };
}

export function summarizeAll(files) {
  return (files || []).reduce((acc, file) => {
    const s = summarizeDiff(file);
    acc.added += s.added;
    acc.removed += s.removed;
    return acc;
  }, { added: 0, removed: 0 });
}

/**
 * Flatten a file diff into virtual-list rows.
 * Each row: { kind: "hunk"|"+"|"-"|" "|"@"|"meta"|"notice", text, number?, hunkIndex?, oldNumber?, newNumber? }
 */
export function diffRows(file) {
  const rows = [];
  if (!file) return rows;
  if (file.notice) {
    rows.push({ kind: "notice", text: file.notice });
    return rows;
  }
  let oldNo = 0, newNo = 0;
  file.hunks.forEach((hunk, hunkIndex) => {
    oldNo = hunk.oldStart;
    newNo = hunk.newStart;
    const stats = summarizeDiff({ hunks: [hunk] });
    rows.push({
      kind: "@",
      text: hunk.header,
      hunkIndex,
      added: stats.added,
      removed: stats.removed,
    });
    for (const line of hunk.lines) {
      if (line.kind === "-") {
        rows.push({ kind: "-", text: untab(line.text) || " ", number: oldNo, oldNumber: oldNo, hunkIndex });
        oldNo += 1;
      } else if (line.kind === "+") {
        rows.push({ kind: "+", text: untab(line.text) || " ", number: newNo, newNumber: newNo, hunkIndex });
        newNo += 1;
      } else if (line.kind === " ") {
        rows.push({ kind: " ", text: untab(line.text) || " ", number: newNo, oldNumber: oldNo, newNumber: newNo, hunkIndex });
        oldNo += 1;
        newNo += 1;
      } else {
        rows.push({ kind: "\\", text: line.text, hunkIndex });
      }
    }
  });
  return rows;
}
