#!/usr/bin/env node
/**
 * Point a personal layout's `"id": "changes"` block at this mod.
 *
 * Dry-run is the default. This never writes ~/.config/herdr-app unless you
 * pass both --apply and an explicit --home.
 *
 *   node scripts/rewire-changes-layout.mjs
 *   node scripts/rewire-changes-layout.mjs --home /path/to/herdr-app --as my-main
 *   node scripts/rewire-changes-layout.mjs --home /path/to/herdr-app --as my-main --apply
 */
import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const apply = !!args.apply;
const home = args.home ? path.resolve(expandHome(args.home)) : null;
const sourceName = args.from || "main";
const destName = args.as || "my-main";
const modName = args.mod || "source-control";

if (apply && !home) {
  fail("Refusing to apply: pass --home <Herdr app home> explicitly (for example --home ~/.config/herdr-app).");
}

const layoutDir = home ? path.join(home, "layouts") : null;
const sourceFile = layoutDir ? path.join(layoutDir, `${sourceName}.json`) : null;
const destFile = layoutDir ? path.join(layoutDir, `${destName}.json`) : null;

console.log("Herdr Source Control — layout rewire");
console.log(`  mode:        ${apply ? "APPLY" : "dry-run"}`);
console.log(`  app home:    ${home || "(not set — showing the recipe only)"}`);
console.log(`  source:      layouts/${sourceName}.json`);
console.log(`  destination: layouts/${destName}.json`);
console.log(`  changes →    { "mod": "${modName}" }`);
console.log("");

if (!home) {
  printRecipe(modName, destName);
  process.exit(0);
}

if (!fs.existsSync(home)) fail(`Herdr app home does not exist: ${home}`);
if (!fs.existsSync(sourceFile)) fail(`No such layout: ${sourceFile}`);

const raw = fs.readFileSync(sourceFile, "utf8");
const layout = JSON.parse(raw);
const block = findById(layout, "changes");
if (!block) fail(`Layout ${sourceName} has no node with id "changes".`);
if (block.type && block.type !== "block") {
  fail(`Node "changes" is a ${block.type}, not a block.`);
}

const before = JSON.stringify(block.content || {}, null, 2);
const next = { ...(block.content || {}), mod: modName };
const already = block.content?.mod === modName;

console.log("Current changes block content:");
console.log(before);
console.log(already ? `\nAlready pointed at "${modName}".` : `\nWould become:\n${JSON.stringify(next, null, 2)}`);

if (!apply) {
  console.log("\nDry-run only. Re-run with --apply to write the personal layout.");
  if (sourceName === destName) {
    console.log("Note: --as equals --from. Prefer cloning main to a new name; shipped layouts are restored on start.");
  }
  process.exit(0);
}

if (sourceName === destName && isProbablyShipped(sourceFile, destName)) {
  fail(`Refusing to overwrite shipped layout "${destName}". Clone it first with --as my-main (Herdr restores shipped layouts on start).`);
}

if (already && fs.existsSync(destFile) && destName !== sourceName) {
  console.log(`Nothing to write: ${destFile} would be unchanged.`);
  process.exit(0);
}

const clone = JSON.parse(raw);
const target = findById(clone, "changes");
target.content = { ...(target.content || {}), mod: modName };
if (destName !== sourceName && !clone.cloned_from) {
  clone.cloned_from = { name: sourceName, version: "manual" };
}
fs.mkdirSync(path.dirname(destFile), { recursive: true });
if (fs.existsSync(destFile) && !args.force) {
  fail(`${destFile} already exists. Pass --force to overwrite a personal layout.`);
}
fs.writeFileSync(destFile, `${JSON.stringify(clone, null, 2)}\n`);
console.log(`\nWrote ${destFile}`);
console.log(`Switch to it with: herdr-app do layout.switch '{"name":"${destName}"}'`);
console.log("Keep \"changes\" in the welcome / workspace.panels list so the Changes button opens this panel.");

function findById(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.id === id) return node;
  for (const child of node.children || []) {
    const hit = findById(child, id);
    if (hit) return hit;
  }
  return null;
}

function isProbablyShipped(file, name) {
  if (!["main", "terminals", "win98"].includes(name)) return false;
  return true;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") out.help = true;
    else if (a === "--apply") out.apply = true;
    else if (a === "--dry-run") out.apply = false;
    else if (a === "--force") out.force = true;
    else if (a === "--home" || a === "--from" || a === "--as" || a === "--mod") {
      out[a.slice(2)] = argv[++i];
    } else {
      fail(`Unknown argument: ${a}`);
    }
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

function printHelp() {
  printRecipe("source-control", "my-main");
}

function printRecipe(modName, destName) {
  console.log(`On Herdr Desktop 0.1.16, installing this mod does not hide the built-in Changes
panel. To use this panel as Changes — with zero coexistence in that layout —
clone the shipped main layout and retarget the changes block:

  1. Install the mod into $HERDR_APP_HOME/mods/${modName}/  (see README).
  2. Clone the layout (needs a running Herdr window), or copy the file:
       herdr-app do layout.clone '{"name":"main","as":"${destName}"}'
       node scripts/rewire-changes-layout.mjs --home "$HERDR_APP_HOME" --as ${destName} --apply
  3. The changes block should read:
       { "id": "changes", "type": "block", "content": { "mod": "${modName}" } }
  4. Switch to the clone if needed:
       herdr-app do layout.switch '{"name":"${destName}"}'

Do not edit shipped layouts/main.json in place — Herdr restores it on start.
Upstream PR #247 (still unmerged at 0.1.16) would let a mod declare a tab-bar
button without cloning a layout.`);
}
