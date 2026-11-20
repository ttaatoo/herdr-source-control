/** Injectable Git runner. Host `exec` in Herdr, child_process in tests. */

export const READ_FLAGS = [
  "--no-optional-locks",
  "-c", "core.fsmonitor=false",
  "-c", "diff.autoRefreshIndex=false",
  "-c", "core.quotepath=false",
];

export function createGit(host) {
  const exec = host.exec;
  const writeFile = host.writeFile;
  const readFile = host.readFile;
  const messageDir = host.messageDir;

  async function run(args, { cwd, on, timeout, read = false } = {}) {
    const argv = read ? [...READ_FLAGS, ...args] : args;
    const result = await exec("git", argv, { cwd, on, timeout });
    return {
      code: result.code ?? 0,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  }

  async function ok(args, opts) {
    const r = await run(args, opts);
    if (r.code !== 0) {
      const err = new Error((r.stderr || r.stdout || `git ${args[0]} failed`).trim());
      err.result = r;
      throw err;
    }
    return r;
  }

  return {
    run,
    ok,

    async revParse(cwd, on, arg = "--show-toplevel") {
      const r = await run(["rev-parse", arg], { cwd, on, read: true });
      return r.code === 0 ? r.stdout.trim() : null;
    },

    async repoRoot(cwd, on) {
      const root = await this.revParse(cwd, on, "--show-toplevel");
      return root || null;
    },

    async status(cwd, on) {
      return run(
        ["status", "--porcelain=v2", "-z", "--untracked-files=all", "--branch"],
        { cwd, on, read: true },
      );
    },

    async diff(cwd, on, { cached = false, path = null } = {}) {
      const args = ["diff", "--no-ext-diff", "--no-textconv", "--no-color", "--find-renames"];
      if (cached) args.push("--cached");
      if (path) args.push("--", path);
      return run(args, { cwd, on, read: true });
    },

    async showHeadMessage(cwd, on) {
      const r = await run(["log", "-1", "--pretty=%B"], { cwd, on, read: true });
      return r.code === 0 ? r.stdout.replace(/\s+$/, "\n") : "";
    },

    async writeMessage(text) {
      if (!writeFile || !messageDir) {
        throw new Error("No message file writer configured");
      }
      const path = `${String(messageDir).replace(/\/$/, "")}/.commit-msg`;
      await writeFile(path, text.endsWith("\n") ? text : `${text}\n`);
      return path;
    },

    async commit(cwd, on, { message, amend = false, messagePath }) {
      let path = messagePath;
      if (!path) path = await this.writeMessage(message ?? "");
      const args = ["commit"];
      if (amend) args.push("--amend");
      args.push("-F", path);
      return ok(args, { cwd, on });
    },

    async add(cwd, on, paths) {
      const list = paths == null || paths === true ? ["-A"] : ["--", ...paths];
      return ok(["add", ...list], { cwd, on });
    },

    async unstage(cwd, on, paths, { hasHead = true } = {}) {
      const targets = paths == null || paths === true ? ["."] : paths;
      if (hasHead) return ok(["restore", "--staged", "--", ...targets], { cwd, on });
      return ok(["rm", "-r", "--cached", "--ignore-unmatch", "--", ...targets], { cwd, on });
    },

    async restoreWorktree(cwd, on, paths) {
      const targets = Array.isArray(paths) ? paths : [paths];
      return ok(["restore", "--worktree", "--", ...targets], { cwd, on });
    },

    async clean(cwd, on, paths) {
      const targets = Array.isArray(paths) ? paths : [paths];
      return ok(["clean", "-f", "--", ...targets], { cwd, on });
    },

    async apply(cwd, on, patch, { cached = false, reverse = false } = {}) {
      const args = ["apply", "--whitespace=nowarn"];
      if (cached) args.push("--cached");
      if (reverse) args.push("-R");
      args.push("-");
      if (typeof host.execStdin === "function") {
        const r = await host.execStdin("git", [...READ_FLAGS, ...args], patch, { cwd, on });
        if ((r.code ?? 0) !== 0) {
          const err = new Error((r.stderr || r.stdout || "git apply failed").trim());
          err.result = r;
          throw err;
        }
        return r;
      }
      if (!writeFile || !messageDir) throw new Error("No way to feed a patch to git apply");
      const path = `${String(messageDir).replace(/\/$/, "")}/.hunk.patch`;
      await writeFile(path, patch.endsWith("\n") ? patch : `${patch}\n`);
      return ok(["apply", "--whitespace=nowarn", ...(cached ? ["--cached"] : []), ...(reverse ? ["-R"] : []), "--", path], { cwd, on });
    },

    async fetch(cwd, on) {
      return ok(["fetch", "--prune"], { cwd, on, timeout: 120000 });
    },

    async pull(cwd, on) {
      return ok(["pull", "--ff-only"], { cwd, on, timeout: 120000 });
    },

    async push(cwd, on) {
      return ok(["push"], { cwd, on, timeout: 120000 });
    },

    async readText(path, on) {
      if (!readFile) throw new Error("No file reader configured");
      return readFile(path, on);
    },
  };
}
