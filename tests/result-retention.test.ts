import test from "node:test";
import assert from "node:assert/strict";
import {
  REQ_PRINT_RESULT_COMMAND_DESCRIPTION,
  captureRetainedResultMessage,
  clearRetainedResultMessage,
  getRetainedResultMessage,
  resetResultRetentionStateForTests,
} from "../src/core/result-retention.js";

/**
 * @brief Verifies the retained final-output notification capture, readback, and wipe lifecycle.
 * @details Captures one composed message, asserts the exact text is returned, captures a successor message and asserts the store reflects only the latest capture, clears the store and asserts the readback becomes `undefined`, and re-captures after the wipe so the store accepts later flows. Runtime is O(n) in message length. Side effects are limited to process-scoped retention state mutation.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the capture loses or mutates the message, the readback returns a stale message, or the wipe fails to clear the store.
 * @satisfies REQ-771, REQ-772, REQ-773, REQ-774, TST-243
 */
test("result retention captures the exact message, keeps the latest capture, and wipes on demand", () => {
  resetResultRetentionStateForTests();
  assert.equal(getRetainedResultMessage(), undefined);

  const firstMessage = "╭─ Summary ─╮\nContext retained. Current context usage: 42%.";
  captureRetainedResultMessage(firstMessage);
  assert.equal(getRetainedResultMessage(), firstMessage);

  const secondMessage = "╭─ Summary ─╮\nContext retained. Current context usage: 87%.";
  captureRetainedResultMessage(secondMessage);
  assert.equal(getRetainedResultMessage(), secondMessage);

  clearRetainedResultMessage();
  assert.equal(getRetainedResultMessage(), undefined);

  captureRetainedResultMessage(firstMessage);
  assert.equal(getRetainedResultMessage(), firstMessage);
  resetResultRetentionStateForTests();
});

/**
 * @brief Verifies the retained message readback returns the identical string reference semantics after process-scoped store reuse.
 * @details Captures one message containing ANSI escape sequences plus newlines, reads it back twice, and asserts both readbacks return the identical byte-for-byte content so `/req-print-result` redelivers the notification without recomposition. Runtime is O(n) in message length. Side effects are limited to process-scoped retention state mutation.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when any readback differs from the captured message text.
 * @satisfies REQ-771, REQ-772, TST-243
 */
test("result retention readback is byte-identical across repeated reads", () => {
  resetResultRetentionStateForTests();
  const ansiMessage = "\u001b[1m╭─── Next Workflow ───╮\u001b[22m\n│ /req-continue 1 │ FIX │ Fix it │\nContext retained.";
  captureRetainedResultMessage(ansiMessage);
  assert.equal(getRetainedResultMessage(), ansiMessage);
  assert.equal(getRetainedResultMessage(), ansiMessage);
  resetResultRetentionStateForTests();
  assert.equal(getRetainedResultMessage(), undefined);
});

/**
 * @brief Verifies the dedicated `/req-print-result` command description constant.
 * @details Asserts the exported description equals the mandated non-empty text so the command registration never depends on a bundled prompt Markdown heading. Runtime is O(1). No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the description constant drifts from the mandated text.
 * @satisfies REQ-776, TST-243
 */
test("req-print-result command description is pinned", () => {
  assert.equal(REQ_PRINT_RESULT_COMMAND_DESCRIPTION, "Print the final-output report notification of the last completed agentic workflow");
});
