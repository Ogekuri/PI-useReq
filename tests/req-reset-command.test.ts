import test from "node:test";
import assert from "node:assert/strict";
import {
  executeReqResetCommandExecution,
} from "../src/core/req-reset-command.js";
import {
  clearPersistedPromptCommandRuntimeState,
  readPersistedPromptCommandRuntimeState,
  writePersistedPromptCommandRuntimeState,
} from "../src/core/prompt-command-state.js";

/**
 * @brief Verifies `req-reset` clears the persisted prompt-orchestration state without worktree cleanup or client relocation.
 * @details Seeds one persisted `error` prompt-orchestration state, executes the `req-reset` plan, and verifies the persisted workflow state returns to the bootstrap `idle` state with no active request while the execution reports the cleared fact. The reset performs no git operation and no session switch by contract. Runtime is O(1). Side effects are limited to process-scoped prompt-state mutation.
 * @return {Promise<void>} Promise resolved after reset assertions complete.
 * @throws {AssertionError} Throws when the reset leaves a non-`idle` persisted state, keeps an active request, or reports a failed reset.
 * @satisfies REQ-305, REQ-307, REQ-312, TST-106
 */
test("req-reset execution clears persisted prompt-orchestration state without worktree cleanup", async () => {
  clearPersistedPromptCommandRuntimeState();
  writePersistedPromptCommandRuntimeState({
    workflowState: "error",
    workflowRequest: "change",
    pendingPromptRequest: undefined,
    activePromptRequest: undefined,
  });
  const before = readPersistedPromptCommandRuntimeState();
  assert.equal(before.workflowState, "error");

  const result = await executeReqResetCommandExecution();

  assert.equal(result.clearedPersistedState, true);
  const after = readPersistedPromptCommandRuntimeState();
  assert.equal(after.workflowState, "idle");
  assert.equal(after.workflowRequest, undefined);
  assert.equal(after.pendingPromptRequest, undefined);
  assert.equal(after.activePromptRequest, undefined);
});
