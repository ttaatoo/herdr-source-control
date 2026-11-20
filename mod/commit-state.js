/** Pure commit / amend / discard decision logic. No Git, no UI. */

export const MODES = ["commit", "amend", "commit-push"];

export const MODE_LABEL = {
  commit: "Commit",
  amend: "Amend",
  "commit-push": "Commit & Push",
};

/**
 * Decide what the primary button should do.
 * @returns {{ action: "commit"|"amend"|"prompt-stage-all"|"disabled", reason?: string }}
 */
export function primaryAction({ stagedCount, unstagedCount, message, mode, hasHead, initial }) {
  const text = (message || "").trim();
  const modeName = MODES.includes(mode) ? mode : "commit";

  if (modeName === "amend") {
    if (!hasHead || initial) return { action: "disabled", reason: "No commit to amend" };
    if (!text) return { action: "disabled", reason: "Enter a commit message" };
    return { action: "amend" };
  }

  if (!text) return { action: "disabled", reason: "Enter a commit message" };
  if (stagedCount > 0) return { action: modeName === "commit-push" ? "commit" : "commit" };
  if (unstagedCount > 0) return { action: "prompt-stage-all" };
  return { action: "disabled", reason: "There are no changes to commit" };
}

export function primaryLabel(action, mode) {
  if (action === "prompt-stage-all") return "Stage All & Commit";
  if (action === "amend") return "✓ Amend";
  if (mode === "commit-push") return "✓ Commit & Push";
  return "✓ Commit";
}

export function canCommitNow(decision) {
  return decision.action === "commit" || decision.action === "amend";
}

/**
 * Reduce UI confirmation / mode state.
 * State shape:
 *   { mode, message, confirm: null | { kind, path?, section? }, error }
 */
export function reduceConfirm(state, event) {
  const next = { ...state, confirm: state.confirm ? { ...state.confirm } : null };
  switch (event.type) {
    case "set-mode":
      next.mode = event.mode;
      next.confirm = null;
      return next;
    case "set-message":
      next.message = event.message;
      return next;
    case "ask-stage-all-commit":
      next.confirm = { kind: "stage-all-commit" };
      return next;
    case "ask-discard-file":
      next.confirm = { kind: "discard-file", path: event.path, untracked: !!event.untracked };
      return next;
    case "ask-discard-all":
      next.confirm = { kind: "discard-all", count: event.count ?? 0 };
      return next;
    case "ask-revert-hunk":
      next.confirm = { kind: "revert-hunk", path: event.path, hunkIndex: event.hunkIndex };
      return next;
    case "cancel":
      next.confirm = null;
      return next;
    case "clear-error":
      next.error = null;
      return next;
    case "error":
      next.error = event.error || "Something went wrong";
      return next;
    default:
      return state;
  }
}

export function discardConfirmText(confirm) {
  if (!confirm) return "";
  if (confirm.kind === "discard-file") {
    const name = (confirm.path || "").split("/").pop() || confirm.path;
    return confirm.untracked
      ? `Permanently delete ${name}?`
      : `Discard changes in ${name}?`;
  }
  if (confirm.kind === "discard-all") {
    return `Discard all ${confirm.count || ""} unstaged changes?`.replace("  ", " ");
  }
  if (confirm.kind === "stage-all-commit") {
    return "No staged changes. Stage all changes and commit?";
  }
  if (confirm.kind === "revert-hunk") return "Revert this hunk in the working tree?";
  return "";
}
