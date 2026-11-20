import assert from "node:assert/strict";
import { test } from "node:test";
import { primaryAction, primaryLabel, reduceConfirm, discardConfirmText } from "../mod/commit-state.js";

test("commit requires a message and staged changes", () => {
  assert.equal(primaryAction({ stagedCount: 1, unstagedCount: 0, message: "", mode: "commit", hasHead: true }).action, "disabled");
  assert.equal(primaryAction({ stagedCount: 1, unstagedCount: 0, message: "ok", mode: "commit", hasHead: true }).action, "commit");
  assert.equal(primaryAction({ stagedCount: 0, unstagedCount: 2, message: "ok", mode: "commit", hasHead: true }).action, "prompt-stage-all");
  assert.equal(primaryAction({ stagedCount: 0, unstagedCount: 0, message: "ok", mode: "commit", hasHead: true }).action, "disabled");
});

test("amend is disabled on unborn / missing HEAD", () => {
  assert.equal(primaryAction({ stagedCount: 1, unstagedCount: 0, message: "ok", mode: "amend", hasHead: false, initial: true }).action, "disabled");
  assert.equal(primaryAction({ stagedCount: 0, unstagedCount: 0, message: "ok", mode: "amend", hasHead: true }).action, "amend");
  assert.equal(primaryLabel("amend", "amend"), "✓ Amend");
  assert.equal(primaryLabel("commit", "commit-push"), "✓ Commit & Push");
});

test("confirmation state machine for discard and stage-all-commit", () => {
  let s = { mode: "commit", message: "m", confirm: null, error: null };
  s = reduceConfirm(s, { type: "ask-discard-file", path: "apps/ui/bot-creation.tsx", untracked: false });
  assert.match(discardConfirmText(s.confirm), /Discard changes in bot-creation.tsx/);
  s = reduceConfirm(s, { type: "cancel" });
  assert.equal(s.confirm, null);
  s = reduceConfirm(s, { type: "ask-stage-all-commit" });
  assert.match(discardConfirmText(s.confirm), /Stage all changes and commit/);
  s = reduceConfirm(s, { type: "ask-discard-file", path: "tmp/x", untracked: true });
  assert.match(discardConfirmText(s.confirm), /Permanently delete x/);
});
