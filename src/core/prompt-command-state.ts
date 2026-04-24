/**
 * @file
 * @brief Persists prompt-command runtime state across session rebinding.
 * @details Stores the current prompt-orchestration workflow state, the pending or active execution plan, and the latest reusable command-capable replacement-session context on `globalThis` so slash-command worktree handoff survives pi session replacement in the same host process. Runtime is O(1). Side effects are limited to process-scoped state mutation.
 */

import path from "node:path";
import type { PromptCommandExecutionPlan } from "./prompt-command-runtime.js";

/**
 * @brief Represents the workflow-state domain persisted across session rebinding.
 * @details Mirrors the prompt-orchestration states used by the status controller so the process-scoped store can remain independent from module-local controller instances. The alias is compile-time only and introduces no runtime cost.
 */
export type PromptCommandRuntimeWorkflowState = "idle" | "checking" | "running" | "merging" | "error";

/**
 * @brief Stores the prompt-command facts persisted across extension rebinding.
 * @details Tracks the current workflow state plus the pending or active execution plan keyed implicitly by the surviving pi host process. The interface is compile-time only and introduces no runtime cost.
 */
export interface PersistedPromptCommandRuntimeState {
  workflowState: PromptCommandRuntimeWorkflowState;
  pendingPromptRequest: PromptCommandExecutionPlan | undefined;
  activePromptRequest: PromptCommandExecutionPlan | undefined;
}

/**
 * @brief Describes the reusable command-capable session context persisted for prompt closure.
 * @details Mirrors the minimal `ExtensionCommandContext` surface needed after prompt activation so lifecycle handlers can continue switching sessions, reading session facts, and delivering messages even when later pi lifecycle event contexts are non-command instances. The interface is compile-time only and introduces no runtime cost.
 */
export interface PersistedPromptCommandSessionContext {
  cwd?: string;
  switchSession?: (
    sessionPath: string,
    options?: any,
  ) => Promise<{ cancelled?: boolean } | void> | { cancelled?: boolean } | void;
  sendUserMessage?: (
    content: any,
    options?: any,
  ) => Promise<void> | void;
  sessionManager?: {
    getBranch?: () => any[];
    getCwd?: () => string;
    getSessionDir?: () => string | undefined;
    getSessionFile?: () => string | undefined;
  };
}

/**
 * @brief Defines the global property used for prompt-command runtime persistence.
 * @details The property lives on `globalThis` because pi tears down and reloads extension modules on session switches while the host process persists. Access complexity is O(1).
 */
const PI_USEREQ_PROMPT_COMMAND_STATE_KEY = "__piUsereqPromptCommandRuntimeState";

/**
 * @brief Defines the global property used for reusable prompt command-context persistence.
 * @details The property stores the latest execution-session file plus its matching command-capable context so closure handling can reuse that context after the active extension runtime is rebound. Access complexity is O(1).
 */
const PI_USEREQ_PROMPT_COMMAND_CONTEXT_KEY = "__piUsereqPromptCommandSessionContextState";

/**
 * @brief Returns the process-scoped prompt-command persistence store.
 * @details Lazily initializes one mutable record that survives extension rebinds in the same pi host process. Runtime is O(1). Side effect: initializes process-scoped state on first access.
 * @return {PersistedPromptCommandRuntimeState} Mutable persistence record.
 */
function getPersistedPromptCommandRuntimeStateStore(): PersistedPromptCommandRuntimeState {
  const globalState = globalThis as typeof globalThis & {
    __piUsereqPromptCommandRuntimeState?: PersistedPromptCommandRuntimeState;
  };
  globalState[PI_USEREQ_PROMPT_COMMAND_STATE_KEY] ??= {
    workflowState: "idle",
    pendingPromptRequest: undefined,
    activePromptRequest: undefined,
  };
  return globalState[PI_USEREQ_PROMPT_COMMAND_STATE_KEY]!;
}

/**
 * @brief Returns the process-scoped reusable prompt command-context store.
 * @details Lazily initializes one mutable record that survives extension rebinds in the same pi host process and tracks which execution-session file owns the stored command-capable context. Runtime is O(1). Side effect: initializes process-scoped state on first access.
 * @return {{ executionSessionFile: string | undefined; sessionContext: PersistedPromptCommandSessionContext | undefined }} Mutable reusable-context record.
 */
function getPersistedPromptCommandSessionContextStore(): {
  executionSessionFile: string | undefined;
  sessionContext: PersistedPromptCommandSessionContext | undefined;
} {
  const globalState = globalThis as typeof globalThis & {
    __piUsereqPromptCommandSessionContextState?: {
      executionSessionFile: string | undefined;
      sessionContext: PersistedPromptCommandSessionContext | undefined;
    };
  };
  globalState[PI_USEREQ_PROMPT_COMMAND_CONTEXT_KEY] ??= {
    executionSessionFile: undefined,
    sessionContext: undefined,
  };
  return globalState[PI_USEREQ_PROMPT_COMMAND_CONTEXT_KEY]!;
}

/**
 * @brief Returns a snapshot of the persisted prompt-command runtime state.
 * @details Copies the process-scoped workflow state and request references into one detached object so callers can reason about the current persistence payload without mutating it accidentally. Runtime is O(1). No external state is mutated.
 * @return {PersistedPromptCommandRuntimeState} Current persisted snapshot.
 */
export function readPersistedPromptCommandRuntimeState(): PersistedPromptCommandRuntimeState {
  const store = getPersistedPromptCommandRuntimeStateStore();
  return {
    workflowState: store.workflowState,
    pendingPromptRequest: store.pendingPromptRequest,
    activePromptRequest: store.activePromptRequest,
  };
}

/**
 * @brief Replaces the persisted prompt-command runtime state.
 * @details Writes the supplied workflow state and execution-plan references into the process-scoped store so later extension instances can recover prompt orchestration after a session switch. Runtime is O(1). Side effect: mutates process-scoped state.
 * @param[in] state {PersistedPromptCommandRuntimeState} Replacement persisted state.
 * @return {void} No return value.
 */
export function writePersistedPromptCommandRuntimeState(
  state: PersistedPromptCommandRuntimeState,
): void {
  const store = getPersistedPromptCommandRuntimeStateStore();
  store.workflowState = state.workflowState;
  store.pendingPromptRequest = state.pendingPromptRequest;
  store.activePromptRequest = state.activePromptRequest;
}

/**
 * @brief Clears the persisted prompt-command runtime state.
 * @details Resets the process-scoped workflow state to `idle` and removes both request references so future extension instances do not inherit stale prompt orchestration. Runtime is O(1). Side effect: mutates process-scoped state.
 * @return {void} No return value.
 */
export function clearPersistedPromptCommandRuntimeState(): void {
  writePersistedPromptCommandRuntimeState({
    workflowState: "idle",
    pendingPromptRequest: undefined,
    activePromptRequest: undefined,
  });
  clearPersistedPromptCommandSessionContext();
}

/**
 * @brief Replaces the reusable prompt command-capable session context.
 * @details Associates the supplied command-capable context with one execution-session file so later lifecycle handlers can recover it after pi rebinds the active extension runtime. Runtime is O(1). Side effect: mutates process-scoped state.
 * @param[in] executionSessionFile {string} Execution-session file that owns the context.
 * @param[in] sessionContext {PersistedPromptCommandSessionContext | undefined} Replacement command-capable context.
 * @return {void} No return value.
 */
export function writePersistedPromptCommandSessionContext(
  executionSessionFile: string,
  sessionContext: PersistedPromptCommandSessionContext | undefined,
): void {
  const store = getPersistedPromptCommandSessionContextStore();
  store.executionSessionFile = path.resolve(executionSessionFile);
  store.sessionContext = sessionContext;
}

/**
 * @brief Clears the reusable prompt command-capable session context.
 * @details Removes the stored execution-session file and context reference so future closure handling cannot reuse stale command objects after prompt orchestration finishes. Runtime is O(1). Side effect: mutates process-scoped state.
 * @return {void} No return value.
 */
export function clearPersistedPromptCommandSessionContext(): void {
  const store = getPersistedPromptCommandSessionContextStore();
  store.executionSessionFile = undefined;
  store.sessionContext = undefined;
}

/**
 * @brief Restores the reusable prompt command-capable session context for one execution-session file.
 * @details Returns the stored command-capable context only when the supplied execution-session file matches the latest stored execution-session file. Runtime is O(1). No external state is mutated.
 * @param[in] executionSessionFile {string | undefined} Candidate execution-session file.
 * @return {PersistedPromptCommandSessionContext | undefined} Matching stored context or `undefined` when unavailable.
 */
export function readPersistedPromptCommandSessionContext(
  executionSessionFile: string | undefined,
): PersistedPromptCommandSessionContext | undefined {
  if (typeof executionSessionFile !== "string" || executionSessionFile === "") {
    return undefined;
  }
  const store = getPersistedPromptCommandSessionContextStore();
  return typeof store.executionSessionFile === "string"
    && path.resolve(store.executionSessionFile) === path.resolve(executionSessionFile)
    ? store.sessionContext
    : undefined;
}

/**
 * @brief Restores persisted prompt-command runtime state for one active session file.
 * @details Returns the persisted workflow state plus execution-plan references only when the supplied session file matches the persisted execution-session file of the pending or active plan. Runtime is O(1). No external state is mutated.
 * @param[in] sessionFile {string | undefined} Current active session file.
 * @return {PersistedPromptCommandRuntimeState | undefined} Matching persisted state or `undefined` when no persisted plan targets the supplied session.
 */
export function restorePersistedPromptCommandRuntimeStateForSession(
  sessionFile: string | undefined,
): PersistedPromptCommandRuntimeState | undefined {
  if (typeof sessionFile !== "string" || sessionFile === "") {
    return undefined;
  }
  const normalizedSessionFile = path.resolve(sessionFile);
  const persistedState = readPersistedPromptCommandRuntimeState();
  const pendingExecutionSessionFile = persistedState.pendingPromptRequest?.executionSessionFile;
  if (typeof pendingExecutionSessionFile === "string" && path.resolve(pendingExecutionSessionFile) === normalizedSessionFile) {
    return persistedState;
  }
  const activeExecutionSessionFile = persistedState.activePromptRequest?.executionSessionFile;
  if (typeof activeExecutionSessionFile === "string" && path.resolve(activeExecutionSessionFile) === normalizedSessionFile) {
    return persistedState;
  }
  return undefined;
}
