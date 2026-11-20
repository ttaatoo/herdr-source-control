/** Node Git host used by live integration tests. */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createGit } from "../../mod/git.js";

export const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "SCM Test",
  GIT_AUTHOR_EMAIL: "scm-test@example.com",
  GIT_COMMITTER_NAME: "SCM Test",
  GIT_COMMITTER_EMAIL: "scm-test@example.com",
  LANG: "C",
};

export function exec(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: GIT_ENV,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", reject);
    const timer = options.timeout ? setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`timeout: ${command}`));
    }, options.timeout) : null;
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

export function execStdin(command, args, stdin, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: GIT_ENV,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", reject);
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

export function gitHost(messageDir) {
  return createGit({
    exec,
    execStdin,
    messageDir,
    writeFile: (p, text) => fs.writeFile(p, text, "utf8"),
    readFile: async (p) => {
      try { return await fs.readFile(p, "utf8"); }
      catch (err) {
        if (err && err.code === "ENOENT") return null;
        throw err;
      }
    },
  });
}

export async function makeTempRoot(prefix = "herdr-scm-live-test-") {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function initRepo(dir, { commit = true, files = { "README.md": "hello\n" } } = {}) {
  await exec("git", ["init", "-b", "main"], { cwd: dir });
  await exec("git", ["config", "user.name", "SCM Test"], { cwd: dir });
  await exec("git", ["config", "user.email", "scm-test@example.com"], { cwd: dir });
  await exec("git", ["config", "commit.gpgsign", "false"], { cwd: dir });
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body, "utf8");
  }
  if (commit) {
    await exec("git", ["add", "-A"], { cwd: dir });
    await exec("git", ["commit", "-m", "initial"], { cwd: dir });
  }
  return dir;
}

export async function writeRel(dir, rel, body) {
  const full = path.join(dir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body, "utf8");
  return full;
}

export function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    data,
  };
}
