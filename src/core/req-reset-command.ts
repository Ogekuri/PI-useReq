/**
 * @file
 * @brief Implements the specialized `req-reset` slash-command workflow.
 * @details Performs non-agentic prompt-orchestration recovery by clearing the persisted prompt-orchestration state and returning deterministic reset facts to the extension command handler. The reset never deletes worktrees or branches, never switches sessions, and never relocates the client working position. Runtime is O(1). Side effects are limited to process-scoped prompt-state mutation.
 * @satisfies DES-014, REQ-304, REQ-305, REQ-306, REQ-307, REQ-312, REQ-313
 */

import { clearPersistedPromptCommandRuntimeState } from "./prompt-command-state.js";

/**
 * @brief Declares the fixed slash-command description for `req-reset`.
 * @details Preserves a deterministic human-facing label for the dedicated non-agentic recovery command while keeping the implementation independent from bundled prompt Markdown files. Access complexity is O(1).
 * @satisfies REQ-304
 */
export const REQ_RESET_COMMAND_DESCRIPTION = "Reset req workflow state to idle without worktree cleanup or client relocation";

/**
 * @brief Describes the outcome of one `req-reset` execution attempt.
 * @details Reports whether the persisted prompt-orchestration state was cleared so the next orchestration starts from the bootstrap `idle` state. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-312
 */
export interface ReqResetCommandExecutionResult {
  clearedPersistedState: boolean;
}

/**
 * @brief Executes the specialized `req-reset` recovery workflow.
 * @details Clears the persisted prompt-orchestration state so the next orchestration starts from the bootstrap `idle` state, and never deletes worktrees or branches, never switches sessions, and never mutates the client working position. Runtime is O(1). Side effects are limited to process-scoped prompt-state mutation.
 * @return {Promise<ReqResetCommandExecutionResult>} Reset outcome facts.
 * @satisfies REQ-305, REQ-306, REQ-307, REQ-312, REQ-313
 */
export async function executeReqResetCommandExecution(): Promise<ReqResetCommandExecutionResult> {
  clearPersistedPromptCommandRuntimeState();
  return { clearedPersistedState: true };
}
