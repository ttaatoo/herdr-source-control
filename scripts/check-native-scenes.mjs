#!/usr/bin/env node
/** Hidden materialization checks. Not GUI layout certification. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-scm-scenes-"));
const home = process.env.HERDR_APP_HOME || "/tmp/herdr-scm-qa-home";
const state = process.env.XDG_STATE_HOME || "/tmp/herdr-scm-qa-state";
fs.mkdirSync(home, { recursive: true });
fs.mkdirSync(state, { recursive: true });

const palettes = {
  graphite: {
    background: "#17191d", surface: "#17191d", foreground: "#eeeeef", canvas: "#131518",
    chrome: "#101114", popover: "#25272b", raised: "#2c2e31", hover: "#ffffff0e",
    selected: "#ffffff17", border: "#ffffff18", input: "#ffffff24", muted: "#98999b",
    dim: "#98999b", accent: "#96b2d7", accentForeground: "#eeeeef", solid: "#eeeeef",
    solidForeground: "#111215", working: "#e5c07b", blocked: "#f0705f", done: "#89b482",
    added: "#98c379", removed: "#e06c75", hunk: "#c678dd", conflict: "#f0705f",
  },
  paper: {
    background: "#ffffff", surface: "#ffffff", foreground: "#1b1b1e", canvas: "#fafaf9",
    chrome: "#f1f1ee", popover: "#ffffff", raised: "#f6f6f6", hover: "#0000000c",
    selected: "#00000012", border: "#00000017", input: "#00000026", muted: "#69696a",
    dim: "#69696a", accent: "#1f62d0", accentForeground: "#ffffff", solid: "#1b1b1e",
    solidForeground: "#ffffff", working: "#9a6700", blocked: "#c93c2c", done: "#1a7f37",
    added: "#1a7f37", removed: "#c93c2c", hunk: "#6f42c1", conflict: "#c93c2c",
  },
};

const scenes = {
  clean: { fixture: "clean", expect: ["No uncommitted changes", "Changes"] },
  mm: { fixture: "mm", expect: ["Staged Changes", "bot-creation.tsx", "apps/packages/product-ui"] },
  "diff-hunk": { fixture: "diff-hunk", expect: ["Stage Hunk", "Revert Hunk", "@@ -10,7 +10,8 @@"] },
  "discard-confirm": { fixture: "discard-confirm", expect: ["Discard changes in bot-creation.tsx", "Confirm", "Cancel"] },
  "repo-switcher": { fixture: "repo-switcher", expect: ["Auto (Active Workspace)", "herdr-source-control"] },
  "not-git": { fixture: "not-git", expect: ["The folder is not a Git repository"] },
  unborn: { fixture: "unborn", expect: ["unborn", "README.md", "你好.txt"] },
};

const widths = [380, 480, 1280];
let count = 0;

for (const [theme, palette] of Object.entries(palettes)) {
  for (const width of widths) {
    for (const [scene, spec] of Object.entries(scenes)) {
      const folder = path.join(root, `${theme}-${width}-${scene}`);
      fs.cpSync(path.join(project, "mod"), folder, { recursive: true });
      fs.renameSync(path.join(folder, "main.js"), path.join(folder, "panel.js"));
      fs.writeFileSync(path.join(folder, "main.js"), wrapperSource(spec.fixture, width, palette));
      const r = spawnSync("herdr-app", ["check", folder, "--print-spec"], {
        encoding: "utf8",
        env: { ...process.env, HERDR_APP_HOME: home, XDG_STATE_HOME: state },
      });
      const out = `${r.stdout || ""}${r.stderr || ""}`;
      fs.writeFileSync(`${folder}.log`, out);
      const ok = r.status === 0 && out.includes(`.bg[Str("${palette.background}")]`);
      const missing = spec.expect.filter((s) => !out.includes(s));
      if (!ok || missing.length) {
        console.error(`FAIL ${theme} ${width} ${scene} status=${r.status} missing=${JSON.stringify(missing)}\n${out}`);
        process.exit(1);
      }
      count += 1;
    }
  }
}

console.log(`${count} hidden native scene checks passed (7 scenes × 3 widths × 2 official token fixtures). Logs: ${root}`);
console.log("CLI theme picks are not tested; explicit token fixtures are used. State inputs are not actual window dimensions. Real paint and interaction QA remain required.");

function wrapperSource(fixture, width, palette) {
  return `import App from "./panel.js";
import { renderPanel } from "./ui.js";
export default class extends App {
  init(p, cx) {
    super.init(p, cx);
    this.model.loadFixture(${JSON.stringify(fixture)});
    if (this.model.s.message) this.input.set_value(this.model.s.message);
    this.resize({ width: ${width}, height: 720 }, cx);
  }
  render() {
    return renderPanel(this, ${JSON.stringify(palette)});
  }
}
`;
}
