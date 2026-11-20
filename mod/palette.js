/** Map Herdr theme() tokens to Source Control colors. */

export function paletteFrom(theme) {
  const t = theme || {};
  return {
    background: t.background || t.surface || "#17191d",
    surface: t.surface || t.background || "#17191d",
    canvas: t.canvas || t.background || "#131518",
    chrome: t.chrome || t.surface || "#101114",
    popover: t.popover || t.raised || "#25272b",
    raised: t.raised || "#2c2e31",
    hover: t.hover || "#ffffff0e",
    selected: t.selected || "#ffffff17",
    border: t.border || "#ffffff18",
    input: t.input || t.border || "#ffffff24",
    foreground: t.foreground || "#eeeeef",
    muted: t.muted || "#98999b",
    dim: t.dim || t.muted || "#98999b",
    accent: t.accent || "#96b2d7",
    accentForeground: t.accent_foreground || t.foreground || "#eeeeef",
    solid: t.solid || t.foreground || "#eeeeef",
    solidForeground: t.solid_foreground || t.background || "#111215",
    working: t.working || t.ansi3 || "#e5c07b",
    blocked: t.blocked || t.ansi1 || "#f0705f",
    done: t.done || t.ansi2 || "#89b482",
    added: t.ansi2 || "#89b482",
    removed: t.ansi1 || "#f0705f",
    hunk: t.ansi6 || t.accent || "#96b2d7",
    conflict: t.blocked || "#f0705f",
  };
}

/** Status letter color by letter. */
export function letterColor(pal, letter) {
  switch (letter) {
    case "A":
    case "U":
      return pal.added;
    case "D":
      return pal.removed;
    case "C":
      return pal.conflict;
    case "R":
      return pal.accent;
    case "M":
    default:
      return pal.working;
  }
}

export const GRAPHITE = {
  background: "#17191d", surface: "#17191d", foreground: "#eeeeef", canvas: "#131518",
  chrome: "#101114", popover: "#25272b", raised: "#2c2e31", hover: "#ffffff0e",
  selected: "#ffffff17", border: "#ffffff18", input: "#ffffff24", muted: "#98999b",
  dim: "#98999b", accent: "#96b2d7", accentForeground: "#eeeeef", solid: "#eeeeef",
  solidForeground: "#111215", working: "#e5c07b", blocked: "#f0705f", done: "#89b482",
  added: "#98c379", removed: "#e06c75", hunk: "#c678dd", conflict: "#f0705f",
};

export const PAPER = {
  background: "#ffffff", surface: "#ffffff", foreground: "#1b1b1e", canvas: "#fafaf9",
  chrome: "#f1f1ee", popover: "#ffffff", raised: "#f6f6f6", hover: "#0000000c",
  selected: "#00000012", border: "#00000017", input: "#00000026", muted: "#69696a",
  dim: "#69696a", accent: "#1f62d0", accentForeground: "#ffffff", solid: "#1b1b1e",
  solidForeground: "#ffffff", working: "#9a6700", blocked: "#c93c2c", done: "#1a7f37",
  added: "#1a7f37", removed: "#c93c2c", hunk: "#6f42c1", conflict: "#c93c2c",
};
