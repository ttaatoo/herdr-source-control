#!/usr/bin/env node
/**
 * Copy mod/ into <home>/mods/source-control/.
 *
 * Requires an explicit --home. Never implied as ~/.config/herdr-app.
 *
 *   node scripts/install.mjs --home /path/to/herdr-app
 *   node scripts/install.mjs --home /path/to/herdr-app --force
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: node scripts/install.mjs --home <Herdr app home> [--force] [--skip-check]");
  process.exit(0);
}
if (!args.home) {
  console.error("Pass --home <Herdr app home> explicitly. This installer will not guess ~/.config/herdr-app.");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "mod");
const home = path.resolve(expandHome(args.home));
const dest = path.join(home, "mods", "source-control");

if (!fs.existsSync(src)) fail(`Missing ${src}`);
if (!fs.existsSync(home)) fail(`Herdr app home does not exist: ${home}`);
if (fs.existsSync(dest) && !args.force) fail(`${dest} already exists. Pass --force to replace this mod only.`);

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.rmSync(dest, { recursive: true, force: true });
copyDir(src, dest);
console.log(`Installed ${src} → ${dest}`);

if (!args.skipCheck) {
  const env = { ...process.env, HERDR_APP_HOME: home };
  if (!env.XDG_STATE_HOME) env.XDG_STATE_HOME = path.join(path.dirname(home), "herdr-scm-install-state");
  const r = spawnSync("herdr-app", ["check", dest], { encoding: "utf8", env });
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  if (r.status !== 0) fail("herdr-app check failed after install");
  console.log("herdr-app check passed");
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === "gpui-kit.d.ts" || entry.name.startsWith(".")) continue;
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") out.help = true;
    else if (a === "--force") out.force = true;
    else if (a === "--skip-check") out.skipCheck = true;
    else if (a === "--home") out.home = argv[++i];
    else fail(`Unknown argument: ${a}`);
  }
  return out;
}

function expandHome(p) {
  if (p === "~") return process.env.HOME || p;
  if (p.startsWith("~/")) return path.join(process.env.HOME || "", p.slice(2));
  return p;
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
