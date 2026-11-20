/**
 * @file
 * @brief Tracks pi-usereq extension status state and renders status-bar telemetry.
 * @details Centralizes hook interception, context-usage snapshots, active-branch lookup, run timing, and deterministic status-bar formatting for the pi-usereq extension. Runtime
 * is O(1) per event plus interval-driven re-renders while a prompt remains
 * active. Side effects are limited to in-memory state mutation and interval
 * scheduling through exported controller helpers.
 */

import type {
  ContextUsage,
  ExtensionContext,
  ThemeColor,
} from "@earendil-works/pi-coding-agent";
import type { AgentFinalOutputReport } from "./agent-final-output.js";
import type { UseReqConfig } from "./config.js";
import type { PiNotifyOutcome, PiNotifySoundLevel } from "./pi-notify.js";
import type { PromptCommandExecutionPlan, PromptCommandStatusMarker } from "./prompt-command-runtime.js";
import {
  clearPersistedPromptCommandFinalizationSnapshot,
  readPersistedPromptCommandTerminalState,
  restorePersistedPromptCommandRuntimeStateForSession,
  writePersistedPromptCommandRuntimeState,
} from "./prompt-command-state.js";
import { getInstallationPackageMetadata } from "./path-context.js";
import { resolveRuntimeGitBranchName } from "./runtime-project-paths.js";

/**
 * @brief Enumerates the CLI-supported theme tokens consumed by status rendering.
 * @details Restricts the status formatter to documented pi theme tokens so the
 * status bar remains compatible with the active CLI theme schema. Compile-time
 * only and introduces no runtime cost.
 */
type StatusForegroundColor = Extract<
  ThemeColor,
  "accent" | "warning" | "dim" | "error"
>;

/**
 * @brief Describes the raw theme capabilities required for status rendering.
 * @details Accepts the `ctx.ui.theme` foreground renderer used by the
 * single-line footer. Compile-time only and introduces no runtime cost.
 */
interface RawStatusTheme {
  fg: (color: StatusForegroundColor, text: string) => string;
}

/**
 * @brief Describes the normalized theme adapter used by status formatters.
 * @details Exposes deterministic label, value, foreground, and separator
 * renderers so status text generation stays independent from the raw theme API.
 * Compile-time only and introduces no runtime cost.
 */
interface StatusThemeAdapter {
  label: (fieldName: string) => string;
  value: (text: string) => string;
  colorize: (color: StatusForegroundColor, text: string) => string;
  separator: string;
}

/**
 * @brief Lists every pi lifecycle hook intercepted by pi-usereq status logic.
 * @details Preserves the canonical user-requested registration order so the
 * extension can install wrappers for all supported resource, session, agent,
 * model, tool, bash, and input hooks. Access complexity is O(1).
 */
export const PI_USEREQ_STATUS_HOOK_NAMES = [
  "resources_discover",
  "session_start",
  "session_before_switch",
  "session_before_fork",
  "session_before_compact",
  "session_compact",
  "session_shutdown",
  "session_before_tree",
  "session_tree",
  "context",
  "before_provider_request",
  "after_provider_response",
  "before_agent_start",
  "agent_start",
  "agent_end",
  "agent_settled",
  "turn_start",
  "turn_end",
  "message_start",
  "message_update",
  "message_end",
  "tool_execution_start",
  "tool_execution_update",
  "tool_execution_end",
  "model_select",
  "tool_call",
  "tool_result",
  "user_bash",
  "input",
] as const;

/**
 * @brief Represents one hook name handled by the pi-usereq status controller.
 * @details Narrows hook registration and event-update calls to the canonical
 * intercepted-hook set. Compile-time only and introduces no runtime cost.
 */
export type PiUsereqStatusHookName = (typeof PI_USEREQ_STATUS_HOOK_NAMES)[number];

/**
 * @brief Describes one prompt request tracked across extension command delivery and runtime execution.
 * @details Reuses the prepared prompt-command execution plan so status rendering and prompt-end side effects can recover the original project base, active execution base, and optional worktree metadata for the current prompt run. The alias is compile-time only and introduces no runtime cost.
 */
export type PiUsereqPromptRequest = PromptCommandExecutionPlan;

/**
 * @brief Represents one prompt-orchestration workflow state displayed in the status bar.
 * @details Narrows workflow tracking to the documented `idle`, `checking`, `running`, `merging`, `done`, `warning`, and `error` states reused by prompt-command gating, prompt-end orchestration, and status rendering. Compile-time only and introduces no runtime cost.
 */
export type PiUsereqWorkflowState = "idle" | "checking" | "running" | "merging" | "done" | "warning" | "error";

/**
 * @brief Stores the mutable runtime facts displayed by the status bar.
 * @details Persists the prompt-orchestration workflow state, the active orchestration request token, the latest context-usage snapshot, the in-flight orchestration start timestamp driving all three elapsed timers, the frozen final duration of the most recently ended orchestration, the accumulated completed orchestration durations for the current context and for the whole pi process, the orchestration elapsed value captured at the terminal agent event for `%%TIME%%` substitution, the flag marking that the in-flight or most recently ended agent run belongs to the active prompt request, the in-memory runtime sound level, prompt-request metadata carried from command dispatch into the next runtime execution, and the deferred terminal finalization outcome, inspected status gate, blocked-gate message, and parsed final-output report recorded at intermediate `agent_end` events and consumed at orchestration termination. Runtime state is mutated in-place by controller helpers. Compile-time only and introduces no runtime cost.
 */
export interface PiUsereqStatusState {
  workflowState: PiUsereqWorkflowState;
  workflowRequest: string | undefined;
  contextUsage: ContextUsage | undefined;
  orchestrationStartMs: number | undefined;
  runningFinalMs: number;
  contextBaseMs: number;
  sessionBaseMs: number;
  endedOrchestrationElapsedMs: number | undefined;
  activeRunBelongsToPrompt: boolean;
  runtimeSoundLevel: PiNotifySoundLevel | undefined;
  pendingPromptRequest: PiUsereqPromptRequest | undefined;
  activePromptRequest: PiUsereqPromptRequest | undefined;
  pendingFinalizationOutcome: PiNotifyOutcome | undefined;
  pendingFinalizationStatusMarker: PromptCommandStatusMarker | undefined;
  pendingFinalizationBlockedMessage: string | undefined;
  /** Parsed final-output report of a blocked terminal run recorded at `agent_end` and consumed by the settle-time report notification. */
  pendingFinalizationReport: AgentFinalOutputReport | undefined;
  agentSettledEventSupported: boolean | undefined;
}

/**
 * @brief Stores the controller state required for event-driven status updates.
 * @details Keeps the mutable status snapshot, the current configuration, the
 * latest extension context used for rendering, and the interval handle used
 * for live elapsed-time refreshes. Compile-time only and introduces no runtime
 * cost.
 */
export interface PiUsereqStatusController {
  config: UseReqConfig | undefined;
  latestContext: ExtensionContext | undefined;
  state: PiUsereqStatusState;
  tickHandle: ReturnType<typeof setInterval> | undefined;
}

/**
 * @brief Stores the process-scoped elapsed-timer snapshot reused across session replacement.
 * @details Preserves the frozen running-timer value, the context and session accumulated orchestration durations, and the in-flight orchestration start timestamp so `/new`, `/resume`, and `/fork` can restore elapsed counters after the extension runtime is rebound. The `activeRunBelongsToPrompt` flag is agent-run-scoped: it is written only at `agent_start` and cleared only at terminal agent events, so a terminal hook on a replacement runtime can recover the ended run's prompt association when the in-memory flag was cleared mid-run. Compile-time only and introduces no runtime cost.
 */
interface PiUsereqStatusPersistenceStore {
  runningFinalMs: number;
  contextBaseMs: number;
  sessionBaseMs: number;
  orchestrationStartMs: number | undefined;
  activeRunBelongsToPrompt: boolean;
  /** One-shot fact recorded at the `/new` session-start boundary: the next orchestration starts on a fresh, empty context and must restart `context_timer` from zero. */
  pendingEmptyContextReset: boolean;
}

/**
 * @brief Defines the global property name used for elapsed-timer persistence.
 * @details The property lives on `globalThis` so prompt counters can survive extension-runtime replacement within the same pi process while remaining internal to pi-usereq. Access complexity is O(1).
 */
const PI_USEREQ_STATUS_PERSISTENCE_KEY = "__piUsereqStatusPersistenceStore";

/**
 * @brief Returns the process-scoped elapsed-timer persistence store.
 * @details Lazily initializes one internal `globalThis` record because pi rebinds extension modules for `/new`, `/resume`, `/fork`, and `/reload`, but the hosting process persists across those operations. Runtime is O(1). Side effect: initializes internal process-scoped state on first access.
 * @return {PiUsereqStatusPersistenceStore} Mutable persistence record.
 * @note Design rationale: required to preserve elapsed counters across session replacement without writing session-global menu state into project configuration.
 */
function getPiUsereqStatusPersistenceStore(): PiUsereqStatusPersistenceStore {
  const globalState = globalThis as typeof globalThis & {
    __piUsereqStatusPersistenceStore?: PiUsereqStatusPersistenceStore;
  };
  globalState[PI_USEREQ_STATUS_PERSISTENCE_KEY] ??= {
    runningFinalMs: 0,
    contextBaseMs: 0,
    sessionBaseMs: 0,
    orchestrationStartMs: undefined,
    activeRunBelongsToPrompt: false,
    pendingEmptyContextReset: false,
  };
  return globalState[PI_USEREQ_STATUS_PERSISTENCE_KEY]!;
}

/**
 * @brief Restores persisted elapsed-timer facts into one mutable status snapshot.
 * @details Copies the process-scoped frozen running-timer value, context and session accumulated orchestration durations, and in-flight orchestration start timestamp into the supplied controller state so rebinding events can continue showing and ticking prior counters. The agent-run-scoped ownership flag is intentionally not restored because terminal agent events recover it directly from the process-scoped store. Runtime is O(1). Side effect: mutates `state`.
 * @param[in,out] state {PiUsereqStatusState} Mutable status state.
 * @return {void} No return value.
 * @satisfies REQ-809
 */
function restorePersistedElapsedState(state: PiUsereqStatusState): void {
  const store = getPiUsereqStatusPersistenceStore();
  state.runningFinalMs = store.runningFinalMs;
  state.contextBaseMs = store.contextBaseMs;
  state.sessionBaseMs = store.sessionBaseMs;
  state.orchestrationStartMs = store.orchestrationStartMs;
}

/**
 * @brief Persists elapsed-timer facts from one mutable status snapshot.
 * @details Copies the frozen running-timer value, context and session accumulated orchestration durations, and in-flight orchestration start timestamp into the process-scoped store so later extension instances can restore them after session replacement. The agent-run-scoped ownership flag is intentionally not mirrored here because shutdown handling clears the in-memory flag while the run record must survive for terminal-event recovery. Runtime is O(1). Side effect: mutates internal process-scoped state.
 * @param[in] state {PiUsereqStatusState} Mutable status state snapshot.
 * @return {void} No return value.
 * @satisfies REQ-809
 */
function persistElapsedState(state: PiUsereqStatusState): void {
  const store = getPiUsereqStatusPersistenceStore();
  store.runningFinalMs = state.runningFinalMs;
  store.contextBaseMs = state.contextBaseMs;
  store.sessionBaseMs = state.sessionBaseMs;
  store.orchestrationStartMs = state.orchestrationStartMs;
}

/**
 * @brief Reconciles one rebound controller's stale in-flight elapsed state with the process-scoped store.
 * @details Extension runtimes rebound mid-orchestration restore the in-flight orchestration start from the process-scoped store at `session_start`, but the initiating runtime may close that orchestration afterwards on its own controller while writing the frozen timer facts into the shared store. Without reconciliation the rebound controller keeps ticking its stale in-memory start past the terminal boundary, renders growing elapsed timers beside an adopted terminal workflow state, and its hook-end persistence would overwrite the frozen store values with still-growing accumulators. The helper adopts the persisted frozen timer facts only when the controller still tracks an in-flight orchestration that the store reports as closed, so live ticking stops at the orchestration end and the accumulated durations stay intact for the next orchestration. Runtime is O(1). Side effects include in-memory state mutation.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller whose stale in-flight elapsed state is healed in place.
 * @return {boolean} `true` when stale in-flight elapsed facts were adopted from the store; `false` when the controller and the store already agree.
 * @note Complexity: O(1).
 * @satisfies REQ-159, REQ-803, REQ-804, REQ-808, REQ-809
 */
function reconcileReboundOrchestrationElapsedState(controller: PiUsereqStatusController): boolean {
  const store = getPiUsereqStatusPersistenceStore();
  if (
    controller.state.orchestrationStartMs !== undefined
    && store.orchestrationStartMs === undefined
  ) {
    restorePersistedElapsedState(controller.state);
    return true;
  }
  return false;
}

/**
 * @brief Freezes one controller's stale in-flight elapsed record after a terminal workflow-state adoption.
 * @details Terminal workflow states can be adopted directly from the process-scoped prompt-command persistence (`resynchronizePersistedTerminalWorkflowState` and the `session_start` terminal restore) without driving `applyOrchestrationElapsedLifecycle`, so a controller that restored an in-flight `orchestrationStartMs` before the adoption keeps computing growing elapsed timers and feeding a live ticker after the orchestration terminated. This helper runs the store-based reconciliation first (adopting the authoritative frozen facts when the store reports the orchestration closed) and otherwise closes the stale record locally through `closeInFlightOrchestration`, freezing `running_timer` and absorbing the executed duration into the context plus session accumulators. Genuinely in-flight workflow states return unchanged so REQ-809 record preservation stays intact. Later authoritative writes converge because every writer stores absolute frozen values computed from the same shared bases. Runtime is O(1). Side effects include in-memory state mutation, process-scoped persistence updates, and optional footer renders through the reconciliation path.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller whose adopted terminal elapsed record is frozen in place.
 * @return {void} No return value.
 * @post `controller.state.orchestrationStartMs === undefined` whenever the workflow state is terminal and a stale in-flight record existed; genuinely in-flight states are untouched.
 * @satisfies REQ-159, REQ-803, REQ-804, REQ-808, REQ-809
 */
function freezeAdoptedTerminalOrchestrationElapsed(controller: PiUsereqStatusController): void {
  if (isPiUsereqWorkflowStateInFlight(controller.state.workflowState)) {
    return;
  }
  if (controller.state.orchestrationStartMs === undefined) {
    return;
  }
  if (reconcileReboundOrchestrationElapsedState(controller)) {
    return;
  }
  closeInFlightOrchestration(controller.state, Date.now());
}

/**
 * @brief Persists the in-flight agent-run prompt-ownership flag into the process-scoped store.
 * @details Mirrors the ownership flag computed at `agent_start` onto `globalThis` so a terminal hook on a replacement extension instance can recover the ended run's prompt association after the in-memory flag was cleared by session replacement or fault-injected state loss. Runtime is O(1). Side effect: mutates process-scoped state.
 * @param[in] state {PiUsereqStatusState} Controller state carrying the in-flight run facts.
 * @return {void} No return value.
 * @satisfies REQ-187, REQ-809
 */
function persistActiveRunOwnership(state: PiUsereqStatusState): void {
  getPiUsereqStatusPersistenceStore().activeRunBelongsToPrompt = state.activeRunBelongsToPrompt;
}

/**
 * @brief Clears the process-scoped in-flight agent-run ownership record.
 * @details Removes the persisted prompt-ownership flag after a terminal hook so later terminal events without their own `agent_start` can never borrow another run's prompt association. Runtime is O(1). Side effect: mutates process-scoped state.
 * @return {void} No return value.
 * @satisfies REQ-809
 */
function clearPersistedActiveRunOwnership(): void {
  getPiUsereqStatusPersistenceStore().activeRunBelongsToPrompt = false;
}

/**
 * @brief Mirrors one controller prompt state into the process-scoped persistence store.
 * @details Persists the current workflow state, the active orchestration request token, plus the pending and active prompt execution plans so prompt orchestration can survive session replacement. Runtime is O(1). Side effect: mutates process-scoped prompt-command persistence state.
 * @param[in] state {PiUsereqStatusState} Current controller state snapshot.
 * @return {void} No return value.
 */
function persistPromptCommandState(state: PiUsereqStatusState): void {
  writePersistedPromptCommandRuntimeState({
    workflowState: state.workflowState,
    workflowRequest: state.workflowRequest,
    pendingPromptRequest: state.pendingPromptRequest,
    activePromptRequest: state.activePromptRequest,
  });
}

/**
 * @brief Detects whether `session_shutdown` must preserve prompt-command state.
 * @details Keeps both the in-memory controller prompt state and the process-scoped prompt execution plan intact while pi switches from the original session into the forked execution session, because the old extension instance can keep running the initiating command handler after `session_shutdown` fires and before the replacement session fully takes over. Runtime is O(1). No external state is mutated.
 * @param[in] state {PiUsereqStatusState} Controller state before shutdown mutation.
 * @return {boolean} `true` when prompt-command state must survive the shutdown event.
 * @satisfies REQ-278
 */
export function shouldPreservePromptCommandStateOnShutdown(state: PiUsereqStatusState): boolean {
  return state.workflowState !== "idle"
    && (state.pendingPromptRequest !== undefined || state.activePromptRequest !== undefined);
}

/**
 * @brief Restores prompt-command persistence into one fresh controller when the active session matches.
 * @details Rehydrates workflow state, the active request token, and pending or active prompt execution plans only when the current session file targets the persisted execution session created for prompt orchestration. Runtime is O(1). Side effect: mutates `state` when persisted prompt state is available.
 * @param[in,out] state {PiUsereqStatusState} Mutable controller state.
 * @param[in] sessionFile {string | undefined} Current active session file.
 * @return {void} No return value.
 */
function restorePersistedPromptCommandState(
  state: PiUsereqStatusState,
  sessionFile: string | undefined,
): void {
  const persistedState = restorePersistedPromptCommandRuntimeStateForSession(sessionFile);
  if (persistedState === undefined) {
    return;
  }
  state.workflowState = persistedState.workflowState;
  state.workflowRequest = persistedState.workflowRequest;
  state.pendingPromptRequest = persistedState.pendingPromptRequest;
  state.activePromptRequest = persistedState.activePromptRequest;
}

/**
 * @brief Resolves the active session file exposed by one extension context.
 * @details Reads the session-manager session-file getter when available so prompt-command persistence can be resynchronized on every lifecycle hook after session replacement. Runtime is O(1). No external state is mutated.
 * @param[in] ctx {ExtensionContext} Active extension context.
 * @return {string | undefined} Current session file when available.
 */
function getContextSessionFile(ctx: ExtensionContext): string | undefined {
  return typeof ctx.sessionManager?.getSessionFile === "function"
    ? ctx.sessionManager.getSessionFile()
    : undefined;
}

/**
 * @brief Detects stale extension-context access after session replacement.
 * @details Matches the guarded pi runtime error emitted when one invalidated extension context, command context, or replacement-session context is accessed after session replacement or reload. Runtime is O(n) in message length only when an error is supplied. No external state is mutated.
 * @param[in] error {unknown} Candidate thrown value.
 * @return {boolean} `true` when the value matches the stale-extension-context runtime error.
 * @satisfies REQ-280
 */
export function isStaleExtensionContextError(error: unknown): boolean {
  return error instanceof Error
    && /stale after session replacement or reload/i.test(error.message);
}

/**
 * @brief Detects whether a `session_start` event must close an in-flight orchestration.
 * @details Treats `reload` as a hard orchestration boundary that freezes `running_timer` and absorbs the in-flight duration into `context_timer` plus `session_timer`, while `new`, `resume`, and `fork` keep the in-flight orchestration ticking across the rebind. Runtime is O(1). No external state is mutated.
 * @param[in] event {unknown} Session-start payload.
 * @return {boolean} `true` when an in-flight orchestration must close.
 * @satisfies REQ-217
 */
function shouldCloseInFlightOrchestrationOnSessionStart(event: unknown): boolean {
  const reason = (event as { reason?: unknown }).reason;
  return reason === "reload";
}

/**
 * @brief Detects whether a `session_start` event is the pi process bootstrap boundary.
 * @details Matches the `startup` reason, which pi emits exactly once per host process before any command can run. Runtime is O(1). No external state is mutated.
 * @param[in] event {unknown} Session-start payload.
 * @return {boolean} `true` when the event marks pi client start.
 * @satisfies REQ-807
 */
function isSessionStartReasonStartup(event: unknown): boolean {
  return (event as { reason?: unknown }).reason === "startup";
}

/**
 * @brief Detects whether a `session_start` event marks the `/new` fresh-context boundary.
 * @details Matches the `new` reason, which the pi host emits exactly once per session replacement that creates a brand-new empty session, so the extension can record the authoritative empty-context fact consumed by the next orchestration-start `context_timer` reset decision. Runtime is O(1). No external state is mutated.
 * @param[in] event {unknown} Session-start payload.
 * @return {boolean} `true` when the event starts a new, empty session context.
 * @satisfies REQ-805, REQ-806
 */
function isSessionStartReasonNewSession(event: unknown): boolean {
  return (event as { reason?: unknown }).reason === "new";
}

/**
 * @brief Records the one-shot empty-context reset fact at the `/new` session-start boundary.
 * @details Stores the fact into the process-scoped elapsed persistence store so the next orchestration-start decision treats the current context as fresh even when the command-time session-entry probe cannot report the fresh-session emptiness. The flag is a decision input only: it never mutates any timer accumulator at recording time, so REQ-809 accumulator preservation across session replacement stays intact. Runtime is O(1). Side effect: mutates process-scoped persistence state.
 * @return {void} No return value.
 * @satisfies REQ-805, REQ-806, REQ-809
 */
function markPendingEmptyContextReset(): void {
  getPiUsereqStatusPersistenceStore().pendingEmptyContextReset = true;
}

/**
 * @brief Consumes the one-shot empty-context reset fact recorded at the `/new` boundary.
 * @details Reads and clears the process-scoped fact so exactly one orchestration start can honor it; the one-shot semantics prevent a stale fact recorded before an earlier flow from restarting `context_timer` for a later flow running on an already-populated context. Runtime is O(1). Side effect: mutates process-scoped persistence state.
 * @return {boolean} `true` when the fact was pending and is now consumed.
 * @satisfies REQ-805, REQ-806
 */
function consumePendingEmptyContextReset(): boolean {
  const store = getPiUsereqStatusPersistenceStore();
  const pending = store.pendingEmptyContextReset === true;
  store.pendingEmptyContextReset = false;
  return pending;
}

/**
 * @brief Re-establishes the process-fresh elapsed-timer state at pi client start.
 * @details Zeroes every elapsed-timer field in the supplied state and resets the process-scoped persistence store to its fresh defaults, anchoring `session_timer`, `context_timer`, and `running_timer` to zero at pi client start. The `startup` reason fires exactly once per pi host process before any orchestration can run, so this reset is a no-op in production and restores deterministic timer isolation for runtime rebinds that replay the bootstrap boundary. Runtime is O(1). Side effects include mutable state reset and process-scoped persistence reset.
 * @param[in,out] state {PiUsereqStatusState} Mutable status state.
 * @return {void} No return value.
 * @satisfies REQ-807
 */
function resetPiUsereqElapsedTimerState(state: PiUsereqStatusState): void {
  state.orchestrationStartMs = undefined;
  state.runningFinalMs = 0;
  state.contextBaseMs = 0;
  state.sessionBaseMs = 0;
  state.endedOrchestrationElapsedMs = undefined;
  state.activeRunBelongsToPrompt = false;
  const globalState = globalThis as typeof globalThis & {
    __piUsereqStatusPersistenceStore?: PiUsereqStatusPersistenceStore;
  };
  delete globalState[PI_USEREQ_STATUS_PERSISTENCE_KEY];
  persistElapsedState(state);
}

/**
 * @brief Detects whether the active context is empty at orchestration start.
 * @details Reads the session-entry count exposed by the active extension context through a throw-safe probe: the non-copying `sessionManager.getEntryCount()` count is preferred when the runtime exposes it, the `sessionManager.getEntries()` list length is the fallback, and every unreadable surface — a guarded stale accessor that throws, a missing session manager, or a missing probe method — marks an empty context per the documented probe contract, so the starting orchestration must restart `context_timer` from zero; any positive entry count marks an already-present context. Runtime is O(1). No external state is mutated.
 * @param[in] ctx {ExtensionContext | undefined} Active extension context captured at orchestration start.
 * @return {boolean} `true` when the orchestration starts on an empty context.
 * @satisfies REQ-805, REQ-806
 */
export function isPiUsereqContextEmptyAtOrchestrationStart(
  ctx: ExtensionContext | undefined,
): boolean {
  try {
    const sessionManager = (ctx as { sessionManager?: unknown } | undefined)?.sessionManager as
      | { getEntryCount?: () => unknown; getEntries?: () => unknown }
      | undefined;
    const entryCount = sessionManager?.getEntryCount?.();
    if (typeof entryCount === "number" && Number.isFinite(entryCount)) {
      return entryCount <= 0;
    }
    const entries = sessionManager?.getEntries?.();
    return !Array.isArray(entries) || entries.length === 0;
  } catch {
    return true;
  }
}

/**
 * @brief Starts the elapsed-timer lifecycle for one new orchestration.
 * @details Resets `running_timer` to zero and stamps the shared in-flight orchestration start timestamp, resets `context_timer` to zero when the orchestration starts on an empty context — detected through the live session-entry probe or through the one-shot `/new` boundary fact recorded at the session replacement that created the current empty context, consumed exactly once so a stale fact can never restart the timer for a later flow on a populated context — leaves `session_timer` accumulation untouched, and mirrors every timer fact into the process-scoped persistence store. Runtime is O(1). Side effects include mutable state mutation and process-scoped persistence update.
 * @param[in,out] state {PiUsereqStatusState} Mutable status state.
 * @param[in] ctx {ExtensionContext | undefined} Active extension context used for empty-context detection.
 * @param[in] nowMs {number} Wall-clock orchestration start timestamp in milliseconds.
 * @return {void} No return value.
 * @satisfies REQ-803, REQ-805, REQ-806, REQ-807
 */
function startPiUsereqOrchestrationElapsed(
  state: PiUsereqStatusState,
  ctx: ExtensionContext | undefined,
  nowMs: number,
): void {
  state.orchestrationStartMs = nowMs;
  state.runningFinalMs = 0;
  const pendingEmptyContextReset = consumePendingEmptyContextReset();
  if (pendingEmptyContextReset || isPiUsereqContextEmptyAtOrchestrationStart(ctx)) {
    state.contextBaseMs = 0;
  }
  persistElapsedState(state);
}

/**
 * @brief Closes the in-flight orchestration and freezes all elapsed timers.
 * @details Computes the executed orchestration duration, freezes `running_timer` at that final value, absorbs the duration into the `context_timer` and `session_timer` accumulators regardless of the terminal outcome, clears the in-flight start timestamp, invalidates the one-shot `/new` empty-context reset fact because the closed orchestration proves the current context holds session entries, and mirrors every timer fact into the process-scoped persistence store. No-op when no orchestration is in flight. Runtime is O(1). Side effects include mutable state mutation and process-scoped persistence update.
 * @param[in,out] state {PiUsereqStatusState} Mutable status state.
 * @param[in] nowMs {number} Current wall-clock time in milliseconds.
 * @return {void} No return value.
 * @satisfies REQ-159, REQ-803, REQ-805, REQ-807
 */
function closeInFlightOrchestration(state: PiUsereqStatusState, nowMs: number): void {
  const orchestrationStartMs = state.orchestrationStartMs;
  if (orchestrationStartMs === undefined) {
    return;
  }
  const durationMs = Math.max(0, nowMs - orchestrationStartMs);
  state.orchestrationStartMs = undefined;
  state.runningFinalMs = durationMs;
  state.contextBaseMs += durationMs;
  state.sessionBaseMs += durationMs;
  getPiUsereqStatusPersistenceStore().pendingEmptyContextReset = false;
  persistElapsedState(state);
}

/**
 * @brief Tests whether one workflow state admits an in-flight orchestration.
 * @details Accepts exactly `checking`, `running`, and `merging` as the in-flight orchestration states. Runtime is O(1). No external state is mutated.
 * @param[in] workflowState {PiUsereqWorkflowState} Candidate workflow state.
 * @return {boolean} `true` when the state marks an in-flight orchestration.
 * @satisfies REQ-804
 */
function isPiUsereqWorkflowStateInFlight(workflowState: PiUsereqWorkflowState): boolean {
  return workflowState === "checking"
    || workflowState === "running"
    || workflowState === "merging";
}

/**
 * @brief Drives the elapsed-timer lifecycle across one workflow-state transition.
 * @details Applies the orchestration-start rule (non-in-flight state entering `checking` or `running` restarts `running_timer` from zero and applies the empty-context `context_timer` reset) and the orchestration-end rule (in-flight state entering `done`, `warning`, `error`, or `idle` freezes `running_timer` and accumulates the executed duration into `context_timer` plus `session_timer`). Runtime is O(1). Side effects include mutable timer-state mutation and process-scoped persistence updates.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
 * @param[in] previousState {PiUsereqWorkflowState} Workflow state before the transition.
 * @param[in] nextState {PiUsereqWorkflowState} Workflow state after the transition.
 * @param[in] ctx {ExtensionContext | undefined} Active extension context used for empty-context detection.
 * @return {void} No return value.
 * @satisfies REQ-159, REQ-803, REQ-804, REQ-805, REQ-806, REQ-807
 */
function applyOrchestrationElapsedLifecycle(
  controller: PiUsereqStatusController,
  previousState: PiUsereqWorkflowState,
  nextState: PiUsereqWorkflowState,
  ctx: ExtensionContext | undefined,
): void {
  if (
    !isPiUsereqWorkflowStateInFlight(previousState)
    && (nextState === "checking" || nextState === "running")
  ) {
    startPiUsereqOrchestrationElapsed(controller.state, ctx ?? controller.latestContext, Date.now());
    return;
  }
  if (
    isPiUsereqWorkflowStateInFlight(previousState)
    && !isPiUsereqWorkflowStateInFlight(nextState)
  ) {
    closeInFlightOrchestration(controller.state, Date.now());
  }
}

/**
 * @brief Detects whether a `session_start` event must reset the workflow state to `idle`.
 * @details Treats `startup` and `reload` as workflow-reset boundaries so prompt-orchestration state never leaks across boot or extension reload, while non-reset session-start reasons preserve the persisted terminal orchestration outcome. Runtime is O(1). No external state is mutated.
 * @param[in] event {unknown} Session-start payload.
 * @return {boolean} `true` when workflow state must reset to `idle`.
 * @satisfies REQ-009, REQ-221, REQ-633
 */
export function shouldResetWorkflowStateOnSessionStart(event: unknown): boolean {
  const reason = (event as { reason?: unknown }).reason;
  return reason === "startup" || reason === "reload";
}

/**
 * @brief Tests whether one workflow state admits a new orchestration.
 * @details Accepts the request-less bootstrap `idle` state and the successful terminal `done` state, so a subsequent orchestration can transition `done` into `running` without an intervening reset while `warning` and `error` keep requiring an explicit `/req-reset`. Runtime is O(1). No external state is mutated.
 * @param[in] workflowState {PiUsereqWorkflowState} Candidate workflow state.
 * @return {boolean} `true` when a new orchestration may start from the supplied state.
 * @satisfies REQ-635
 */
export function isPiUsereqWorkflowStartable(workflowState: PiUsereqWorkflowState): boolean {
  return workflowState === "idle" || workflowState === "done";
}

/**
 * @brief Builds the normalized theme adapter used by pi-usereq status formatters.
 * @details Precomputes label, value, foreground, and separator renderers so
 * status formatting remains stable across real TUI themes and deterministic
 * test doubles. Runtime is O(1). No external state is mutated.
 * @param[in] theme {RawStatusTheme} Raw theme implementation from `ctx.ui.theme`.
 * @return {StatusThemeAdapter} Normalized status-theme adapter.
 */
function createStatusThemeAdapter(theme: RawStatusTheme): StatusThemeAdapter {
  const colorize = (color: StatusForegroundColor, text: string): string =>
    theme.fg(color, text);
  return {
    label: (fieldName: string): string => colorize("accent", `${fieldName}:`),
    value: (text: string): string => colorize("warning", text),
    colorize,
    separator: colorize("dim", " • "),
  };
}

/**
 * @brief Prefixes the rendered status-bar `branch` field value.
 * @details Prepends the documented `⎇` symbol plus one trailing space to the active git branch name so the field renders as `branch:⎇ <branch>` while the field label and theme token split stay unchanged. Access complexity is O(1). No external state is mutated.
 * @satisfies REQ-121
 */
const PI_USEREQ_STATUS_BRANCH_PREFIX = "⎇ ";

/**
 * @brief Resolves the active git branch value rendered in the status bar.
 * @details Reads the current branch from the active context working directory on every status render so worktree switches and restored base-session renders expose the latest branch immediately. The returned token stays prefix-free because the documented `⎇ ` display prefix is applied by `buildPiUsereqStatusText(...)`. Runtime is dominated by git execution when the working directory belongs to a repository. Side effects include subprocess creation.
 * @param[in] ctx {ExtensionContext} Active extension context.
 * @return {string} Active branch name or `unknown` when unavailable.
 * @satisfies REQ-121, REQ-283
 */
function resolveStatusBranchValue(ctx: ExtensionContext): string {
  return resolveRuntimeGitBranchName(ctx.cwd);
}

/**
 * @brief Normalizes one raw context-usage snapshot.
 * @details Preserves the runtime token and context-window counts, derives a
 * percentage when the runtime omits it, clamps negative percentages to `0`,
 * and preserves overflow above `100` for footer rendering. Runtime is O(1). No
 * external state is mutated.
 * @param[in] contextUsage {ContextUsage | undefined} Raw runtime snapshot.
 * @return {ContextUsage | undefined} Normalized snapshot.
 */
function normalizeContextUsage(
  contextUsage: ContextUsage | undefined,
): ContextUsage | undefined {
  if (!contextUsage) {
    return undefined;
  }
  const derivedPercent = contextUsage.percent ?? (
    contextUsage.tokens === null || contextUsage.contextWindow <= 0
      ? null
      : (contextUsage.tokens / contextUsage.contextWindow) * 100
  );
  return {
    ...contextUsage,
    percent: derivedPercent === null
      ? null
      : Math.max(0, derivedPercent),
  };
}

/**
 * @brief Resolves the selected model max input context tokens from one normalized context-usage snapshot.
 * @details Accepts only finite positive `contextWindow` numbers so missing, non-numeric, and non-positive runtime values degrade to `undefined`, which every context-occupancy consumer treats as the documented unknown basis. Runtime is O(1). No external state is mutated.
 * @param[in] contextUsage {ContextUsage | undefined} Normalized context-usage snapshot from the status controller state.
 * @return {number | undefined} Selected model max input context tokens, or undefined when unknown.
 * @satisfies REQ-401
 */
export function resolveModelContextWindowTokens(
  contextUsage: ContextUsage | undefined,
): number | undefined {
  const contextWindow = contextUsage?.contextWindow;
  return typeof contextWindow === "number" && Number.isFinite(contextWindow) && contextWindow > 0
    ? contextWindow
    : undefined;
}

/**
 * @brief Refreshes the stored context-usage snapshot from the active extension context.
 * @details Calls `ctx.getContextUsage()` on every intercepted event so the
 * controller retains the newest context-usage facts available from the pi
 * runtime. Runtime is O(1). Side effect: mutates `state.contextUsage`.
 * @param[in,out] state {PiUsereqStatusState} Mutable status state.
 * @param[in] ctx {ExtensionContext} Active extension context.
 * @return {void} No return value.
 * @satisfies REQ-118, REQ-119
 */
function refreshContextUsage(
  state: PiUsereqStatusState,
  ctx: ExtensionContext,
): void {
  state.contextUsage = normalizeContextUsage(ctx.getContextUsage());
}

/**
 * @brief Resolves the icon text for one normalized context-usage snapshot.
 * @details Maps context usage to one fixed-width icon band so footer rendering remains compact and deterministic across the documented `0`, `>0-<25`, `>=25-<50`, `>=50-<75`, and `>=75` percent bands. Unavailable usage degrades to the `0%` icon. Runtime is O(1). No external state is mutated.
 * @param[in] contextUsage {ContextUsage | undefined} Normalized context snapshot.
 * @return {string} Fixed-width gauge icon text.
 * @satisfies REQ-122, REQ-284
 */
function resolveContextUsageIconText(
  contextUsage: ContextUsage | undefined,
): string {
  const percent = contextUsage?.percent;
  if (percent === undefined || percent === null || percent <= 0) {
    return "▕_▏";
  }
  if (percent < 25) {
    return "▕▂▏";
  }
  if (percent < 50) {
    return "▕▄▏";
  }
  if (percent < 75) {
    return "▕▆▏";
  }
  return "▕█▏";
}

/**
 * @brief Formats one icon-based context-usage gauge.
 * @details Renders the documented gauge icon with the same non-error status-value theme token used by `status` below `90%`, switches to theme `error` for `>=90%`, and enables terminal blink only for `>=100%`. Runtime is O(1). No external state is mutated.
 * @param[in] theme {StatusThemeAdapter} Normalized status theme.
 * @param[in] contextUsage {ContextUsage | undefined} Normalized context snapshot.
 * @return {string} Rendered fixed-width gauge icon.
 * @satisfies REQ-122, REQ-126, REQ-127, REQ-128, REQ-233, REQ-284
 */
function formatContextUsageBar(
  theme: StatusThemeAdapter,
  contextUsage: ContextUsage | undefined,
): string {
  const percent = contextUsage?.percent ?? 0;
  if (percent >= 100) {
    return theme.colorize("error", "\u001b[5m▕█▏\u001b[25m");
  }
  if (percent >= 90) {
    return theme.colorize("error", "▕█▏");
  }
  return theme.value(resolveContextUsageIconText(contextUsage));
}

/**
 * @brief Formats one elapsed-duration value as `M:SS`.
 * @details Floors the input to whole seconds, keeps minutes unbounded above 59,
 * and zero-pads seconds to two digits. Runtime is O(1). No external state is
 * mutated.
 * @param[in] durationMs {number} Duration in milliseconds.
 * @return {string} Duration rendered as `M:SS`.
 * @satisfies REQ-125
 */
function formatStatusDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * @brief Resolves the three elapsed-timer values for one status render.
 * @details Computes the shared in-flight orchestration elapsed once, derives `running_timer` from the in-flight elapsed or the frozen final value, and adds the same in-flight elapsed to the `context_timer` and `session_timer` accumulated bases so all three timers advance concurrently while an orchestration runs and hold `running_timer <= context_timer <= session_timer`. Runtime is O(1). No external state is mutated.
 * @param[in] state {PiUsereqStatusState} Mutable status state snapshot.
 * @param[in] nowMs {number} Current wall-clock time in milliseconds.
 * @return {{ runningMs: number; contextMs: number; sessionMs: number }} Resolved elapsed-timer durations in milliseconds.
 * @satisfies REQ-803, REQ-808, REQ-810
 */
function resolveElapsedTimerSnapshot(
  state: PiUsereqStatusState,
  nowMs: number,
): { runningMs: number; contextMs: number; sessionMs: number } {
  const inFlightMs = state.orchestrationStartMs === undefined
    ? 0
    : Math.max(0, nowMs - state.orchestrationStartMs);
  return {
    runningMs: state.orchestrationStartMs === undefined ? state.runningFinalMs : inFlightMs,
    contextMs: state.contextBaseMs + inFlightMs,
    sessionMs: state.sessionBaseMs + inFlightMs,
  };
}

/**
 * @brief Formats the consolidated `elapsed` status-bar value.
 * @details Emits the running-orchestration segment `⏱︎ <running_timer>`, the
 * current-context segment `⚑ <context_timer>`, and the process-lifetime
 * segment `⌛︎<session_timer>` with fixed spacing, rendering every timer from
 * zero as `M:SS` without unset placeholders. Runtime is O(1). No external state
 * is mutated.
 * @param[in] state {PiUsereqStatusState} Mutable status state snapshot.
 * @param[in] nowMs {number} Current wall-clock time in milliseconds.
 * @return {string} Consolidated `elapsed` field value.
 * @satisfies REQ-123, REQ-124, REQ-125, REQ-803, REQ-810
 */
function formatElapsedStatusValue(
  state: PiUsereqStatusState,
  nowMs: number,
): string {
  const timers = resolveElapsedTimerSnapshot(state, nowMs);
  return `⏱︎ ${formatStatusDuration(timers.runningMs)} ⚑ ${formatStatusDuration(timers.contextMs)} ⌛︎${formatStatusDuration(timers.sessionMs)}`;
}

/**
 * @brief Formats one standard status-bar field.
 * @details Renders the field label in accent color and the value in warning
 * color. Runtime is O(n) in combined text length. No external state is mutated.
 * @param[in] theme {StatusThemeAdapter} Normalized status theme.
 * @param[in] fieldName {string} Field label emitted before the colon.
 * @param[in] value {string} Unstyled field value.
 * @return {string} Rendered status-field fragment.
 */
function formatStatusField(
  theme: StatusThemeAdapter,
  fieldName: string,
  value: string,
): string {
  return `${theme.label(fieldName)}${theme.value(value)}`;
}

/**
 * @brief Formats one pre-rendered status-bar field value.
 * @details Preserves the accent-colored field label while allowing callers to
 * provide a custom styled value such as the context-usage bar. Runtime is O(n)
 * in combined text length. No external state is mutated.
 * @param[in] theme {StatusThemeAdapter} Normalized status theme.
 * @param[in] fieldName {string} Field label emitted before the colon.
 * @param[in] renderedValue {string} Pre-rendered field value.
 * @return {string} Rendered status-field fragment.
 */
function formatRenderedStatusField(
  theme: StatusThemeAdapter,
  fieldName: string,
  renderedValue: string,
): string {
  return `${theme.label(fieldName)}${renderedValue}`;
}

/**
 * @brief Separates the request token from the workflow state inside the `status` field value.
 * @details Supplies the documented ` ➔ ` arrow joining `<request>` and `<state>` so every rendered `status` value shares one separator token, including one space before and after the arrow per REQ-632. Access complexity is O(1). No external state is mutated.
 * @satisfies REQ-632
 */
const PI_USEREQ_STATUS_REQUEST_STATE_SEPARATOR = " ➔ ";

/**
 * @brief Formats the rendered workflow-state value for the `status` field.
 * @details Uses the standard warning-colored value renderer for neutral states, emits a blinking `error`-colored value for `status:error`, and emits the identical blinking `error`-colored value for `status:warning` so orchestration warnings match the documented error styling. When an active orchestration request token exists, the value renders as `<request> ➔ <state>` joined by `PI_USEREQ_STATUS_REQUEST_STATE_SEPARATOR`, which carries one space before and after the arrow; otherwise it renders the bare `<state>`, so the bootstrap `idle` state stays request-less while `done` renders through the non-error value convention. Runtime is O(n) in text length. No external state is mutated.
 * @param[in] theme {StatusThemeAdapter} Normalized status theme.
 * @param[in] workflowState {PiUsereqWorkflowState} Current workflow state.
 * @param[in] workflowRequest {string | undefined} Active orchestration request token without the `req-` prefix.
 * @return {string} Rendered workflow-state value.
 * @satisfies REQ-112, REQ-223, REQ-590, REQ-632, REQ-633, REQ-638
 */
function formatWorkflowStateValue(
  theme: StatusThemeAdapter,
  workflowState: PiUsereqWorkflowState,
  workflowRequest: string | undefined,
): string {
  const valueText = workflowRequest !== undefined
    ? `${workflowRequest}${PI_USEREQ_STATUS_REQUEST_STATE_SEPARATOR}${workflowState}`
    : workflowState;
  if (workflowState === "error" || workflowState === "warning") {
    return theme.colorize("error", `\u001b[5m${valueText}\u001b[25m`);
  }
  return theme.value(valueText);
}

/**
 * @brief Resolves the active runtime sound level used by status and notify flows.
 * @details Prefers the mutable runtime sound state, then falls back to the cached persisted boot value, and finally defaults to `none` before `session_start` loads configuration. Runtime is O(1). No external state is mutated.
 * @param[in] state {PiUsereqStatusState} Mutable status state snapshot.
 * @param[in] config {UseReqConfig | undefined} Cached project configuration.
 * @return {PiNotifySoundLevel} Active runtime sound level.
 * @satisfies REQ-180, REQ-285
 */
function resolvePiUsereqRuntimeSoundLevel(
  state: PiUsereqStatusState,
  config: UseReqConfig | undefined,
): PiNotifySoundLevel {
  return state.runtimeSoundLevel ?? config?.["notify-sound"] ?? "none";
}

/**
 * @brief Formats the runtime extension identity prefix for the status bar.
 * @details Reads cached installation package metadata and renders the package name plus `v<version>` using the same accent-label and warning-value token split used by standard non-error status fields. Runtime is O(n) in rendered text length. No external state is mutated.
 * @param[in] theme {StatusThemeAdapter} Normalized status theme.
 * @return {string} Rendered extension identity prefix.
 * @satisfies REQ-112, REQ-120
 */
function formatExtensionIdentityStatusField(
  theme: StatusThemeAdapter,
): string {
  const metadata = getInstallationPackageMetadata();
  return `${theme.label(metadata.name)}${theme.value(`v${metadata.version}`)}`;
}

/**
 * @brief Builds the full single-line pi-usereq status-bar payload.
 * @details Renders the runtime extension identity prefix before status, then renders status, branch, context, elapsed, and sound fields with dim bullet separators, workflow-state highlighting, the `⎇ `-prefixed branch value, the documented icon-based context gauge, and the active runtime sound level instead of the persisted boot value. Runtime is O(1). No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] theme {StatusThemeAdapter} Normalized status theme.
 * @param[in] state {PiUsereqStatusState} Mutable status state snapshot.
 * @param[in] branchName {string} Active git branch name shown in the footer.
 * @param[in] nowMs {number} Current wall-clock time in milliseconds.
 * @return {string} Single-line status-bar text.
 * @satisfies REQ-109, REQ-112, REQ-120, REQ-121, REQ-123, REQ-124, REQ-125, REQ-126, REQ-127, REQ-128, REQ-156, REQ-159, REQ-180, REQ-222, REQ-223, REQ-233, REQ-283, REQ-284
 */
function buildPiUsereqStatusText(
  config: UseReqConfig,
  theme: StatusThemeAdapter,
  state: PiUsereqStatusState,
  branchName: string,
  nowMs: number,
): string {
  const elapsedText = formatElapsedStatusValue(state, nowMs);
  const soundText = resolvePiUsereqRuntimeSoundLevel(state, config);
  return [
    formatExtensionIdentityStatusField(theme),
    formatRenderedStatusField(
      theme,
      "status",
      formatWorkflowStateValue(theme, state.workflowState, state.workflowRequest),
    ),
    formatStatusField(theme, "branch", `${PI_USEREQ_STATUS_BRANCH_PREFIX}${branchName}`),
    formatRenderedStatusField(
      theme,
      "context",
      formatContextUsageBar(theme, state.contextUsage),
    ),
    formatStatusField(theme, "elapsed", elapsedText),
    formatStatusField(theme, "sound", soundText),
  ].join(theme.separator);
}

/**
 * @brief Stops the live elapsed-time ticker when it is active.
 * @details Clears the interval handle and resets the stored timer reference so
 * subsequent runs can reinitialize live status refreshes deterministically.
 * Runtime is O(1). Side effect: mutates `controller.tickHandle`.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
 * @return {void} No return value.
 */
function stopStatusTicker(controller: PiUsereqStatusController): void {
  if (controller.tickHandle !== undefined) {
    clearInterval(controller.tickHandle);
    controller.tickHandle = undefined;
  }
}

/**
 * @brief Synchronizes the live elapsed-time ticker with the in-flight orchestration.
 * @details Starts a 1-second render ticker while an orchestration is in flight
 * so `running_timer`, `context_timer`, and `session_timer` advance concurrently,
 * and stops the ticker once the orchestration reaches a terminal state or the
 * workflow state is otherwise not in flight, so a controller holding a stale
 * in-flight record under an adopted terminal state can never keep ticking. The
 * interval handle is unreferenced so a leaked ticker can never keep a host
 * process alive. Runtime is O(1). Side effects include interval creation,
 * interval disposal, and footer-status mutation on timer ticks.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
 * @return {void} No return value.
 * @satisfies REQ-123, REQ-803, REQ-808
 */
function syncPiUsereqStatusTicker(
  controller: PiUsereqStatusController,
): void {
  if (
    controller.state.orchestrationStartMs === undefined
    || !isPiUsereqWorkflowStateInFlight(controller.state.workflowState)
  ) {
    stopStatusTicker(controller);
    return;
  }
  if (controller.tickHandle !== undefined) {
    return;
  }
  const tickHandle = setInterval(() => {
    if (
      controller.state.orchestrationStartMs === undefined
      || !isPiUsereqWorkflowStateInFlight(controller.state.workflowState)
    ) {
      stopStatusTicker(controller);
      return;
    }
    if (!controller.latestContext || !controller.config) {
      return;
    }
    renderPiUsereqStatus(controller, controller.latestContext);
  }, 1000);
  (tickHandle as { unref?: () => void }).unref?.();
  controller.tickHandle = tickHandle;
}

/**
 * @brief Creates an empty pi-usereq status controller.
 * @details Initializes the mutable status snapshot, including empty prompt-request tracking, an undefined active orchestration request token for the request-less bootstrap `idle` state, and an unset runtime sound level that later loads from persisted config during `session_start`, and starts with no config, no context, and no live ticker. Runtime is O(1). No external state is mutated.
 * @return {PiUsereqStatusController} New status controller.
 * @satisfies DES-010
 */
export function createPiUsereqStatusController(): PiUsereqStatusController {
  return {
    config: undefined,
    latestContext: undefined,
    state: {
      workflowState: "idle",
      workflowRequest: undefined,
      contextUsage: undefined,
      orchestrationStartMs: undefined,
      runningFinalMs: 0,
      contextBaseMs: 0,
      sessionBaseMs: 0,
      endedOrchestrationElapsedMs: undefined,
      activeRunBelongsToPrompt: false,
      runtimeSoundLevel: undefined,
      pendingPromptRequest: undefined,
      activePromptRequest: undefined,
      pendingFinalizationOutcome: undefined,
      pendingFinalizationStatusMarker: undefined,
      pendingFinalizationBlockedMessage: undefined,
      pendingFinalizationReport: undefined,
      agentSettledEventSupported: undefined,
    },
    tickHandle: undefined,
  };
}

/**
 * @brief Stores the effective project configuration used by status rendering.
 * @details Replaces the controller's cached configuration so later status
 * renders reuse the latest docs, tests, source-path, and persisted pi-notify
 * values without reading from disk on every event, while leaving the active
 * runtime sound level in `controller.state`. Runtime is O(1). Side effect:
 * mutates `controller.config`.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {void} No return value.
 */
export function setPiUsereqStatusConfig(
  controller: PiUsereqStatusController,
  config: UseReqConfig,
): void {
  controller.config = config;
}

/**
 * @brief Returns the active runtime sound level tracked by the status controller.
 * @details Exposes the in-memory runtime sound state so shortcut handlers and prompt-end notification dispatch can stay decoupled from the persisted boot value stored in global configuration. Runtime is O(1). No external state is mutated.
 * @param[in] controller {PiUsereqStatusController} Mutable status controller.
 * @return {PiNotifySoundLevel} Active runtime sound level.
 * @satisfies REQ-180, REQ-285
 */
export function getPiUsereqRuntimeSoundLevel(
  controller: PiUsereqStatusController,
): PiNotifySoundLevel {
  return resolvePiUsereqRuntimeSoundLevel(controller.state, controller.config);
}

/**
 * @brief Stores one new runtime sound level and refreshes the status bar.
 * @details Mutates only the in-memory runtime sound state so shortcut-driven sound changes do not update persisted local or global configuration, then re-renders the footer when an active extension context is available. Runtime is O(1). Side effect: mutates `controller.state.runtimeSoundLevel` and may update `ctx.ui` status.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
 * @param[in] runtimeSoundLevel {PiNotifySoundLevel} Next active runtime sound level.
 * @param[in] ctx {ExtensionContext | undefined} Optional active extension context.
 * @return {void} No return value.
 * @satisfies REQ-180, REQ-286, REQ-287
 */
export function setPiUsereqRuntimeSoundLevel(
  controller: PiUsereqStatusController,
  runtimeSoundLevel: PiNotifySoundLevel,
  ctx?: ExtensionContext,
): void {
  controller.state.runtimeSoundLevel = runtimeSoundLevel;
  const renderContext = ctx ?? controller.latestContext;
  if (renderContext) {
    renderPiUsereqStatus(controller, renderContext);
  }
}

/**
 * @brief Renders the current pi-usereq status bar into the active UI context.
 * @details Updates the controller's latest context pointer, refreshes the live `getContextUsage()` snapshot for direct render call sites that do not pass through `updateExtensionStatus(...)`, and writes the single-line status text only when configuration is available, including the runtime extension identity prefix, active branch field, documented icon-based context gauge, and active runtime sound level. When pi has already invalidated the supplied context after session replacement or reload, the helper clears the stale cached context and returns without surfacing the stale-instance exception. Runtime is O(1) plus git execution for branch refresh. Side effect: mutates `controller.state.contextUsage` and `ctx.ui` status when the context is still active.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
 * @param[in] ctx {ExtensionContext} Active extension context.
 * @return {void} No return value.
 * @satisfies REQ-118, REQ-119, REQ-120, REQ-121, REQ-123, REQ-124, REQ-125, REQ-126, REQ-127, REQ-128, REQ-159, REQ-180, REQ-233, REQ-280, REQ-283, REQ-284
 */
export function renderPiUsereqStatus(
  controller: PiUsereqStatusController,
  ctx: ExtensionContext,
): void {
  controller.latestContext = ctx;
  if (!controller.config) {
    return;
  }
  try {
    refreshContextUsage(controller.state, ctx);
    const theme = createStatusThemeAdapter(ctx.ui.theme as RawStatusTheme);
    const branchName = resolveStatusBranchValue(ctx);
    ctx.ui.setStatus(
      "pi-usereq",
      buildPiUsereqStatusText(
        controller.config,
        theme,
        controller.state,
        branchName,
        Date.now(),
      ),
    );
  } catch (error) {
    if (isStaleExtensionContextError(error)) {
      if (controller.latestContext === ctx) {
        controller.latestContext = undefined;
      }
      return;
    }
    throw error;
  }
}

/**
 * @brief Transitions the prompt-orchestration workflow state and refreshes the status bar.
 * @details Mutates the tracked workflow state after driving the elapsed-timer lifecycle across the transition (orchestration start restarts `running_timer` from zero and applies the empty-context `context_timer` reset; orchestration end freezes `running_timer` and accumulates the executed duration into `context_timer` plus `session_timer`), synchronizes the live ticker with the resulting in-flight state, preserves the latest extension context when available, and re-renders the single-line footer immediately so internal command transitions and pi lifecycle transitions stay visible to the user. Runtime is O(1). Side effect: mutates workflow state, elapsed-timer state, and may update `ctx.ui` status.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
 * @param[in] workflowState {PiUsereqWorkflowState} Next workflow state.
 * @param[in] ctx {ExtensionContext | undefined} Optional active extension context.
 * @return {void} No return value.
 * @satisfies REQ-159, REQ-221, REQ-222, REQ-223, REQ-803, REQ-804, REQ-805, REQ-806
 */
export function setPiUsereqWorkflowState(
  controller: PiUsereqStatusController,
  workflowState: PiUsereqWorkflowState,
  ctx?: ExtensionContext,
): void {
  const previousWorkflowState = controller.state.workflowState;
  applyOrchestrationElapsedLifecycle(controller, previousWorkflowState, workflowState, ctx);
  controller.state.workflowState = workflowState;
  persistPromptCommandState(controller.state);
  syncPiUsereqStatusTicker(controller);
  const renderContext = ctx ?? controller.latestContext;
  if (renderContext) {
    renderPiUsereqStatus(controller, renderContext);
  }
}

/**
 * @brief Stores the active orchestration request token and refreshes the status bar.
 * @details Records the processed slash-command name without the `req-` prefix in the process-scoped runtime state before the orchestration enters `checking` or `running`, then re-renders the single-line footer so the `<request> ➔ <state>` status value becomes visible immediately. Runtime is O(1). Side effect: mutates workflow request state and may update `ctx.ui` status.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
 * @param[in] workflowRequest {string} Active request token without the `req-` prefix.
 * @param[in] ctx {ExtensionContext | undefined} Optional active extension context.
 * @return {void} No return value.
 * @satisfies REQ-630, REQ-631, REQ-637
 */
export function setPiUsereqWorkflowRequest(
  controller: PiUsereqStatusController,
  workflowRequest: string,
  ctx?: ExtensionContext,
): void {
  controller.state.workflowRequest = workflowRequest;
  persistPromptCommandState(controller.state);
  const renderContext = ctx ?? controller.latestContext;
  if (renderContext) {
    renderPiUsereqStatus(controller, renderContext);
  }
}

/**
 * @brief Resynchronizes one stale idle controller from the persisted terminal workflow state.
 * @details Extension runtimes are rebound by every pi session replacement (`switchSession`, `/new`, `/resume`, `/fork`, `/reload`), and the replacement instance receives `session_start` synchronously during the switch. When the switch happens inside prompt-orchestration closure, the process-scoped persistence still holds the non-terminal in-flight state of the initiating instance, so the replacement controller skips both restore branches (the session-scoped plan restore and the terminal-state restore) and stays parked on the bootstrap `idle` state even after the initiating instance persists its terminal `done`, `warning`, or `error` transition. This helper adopts that authoritative persisted terminal state into a controller that still reports `idle`, updating the request token and refreshing the status bar, so command-side gates observe the completed agentic flow that exists in context. Terminal adoption additionally freezes a stale in-flight elapsed record through `freezeAdoptedTerminalOrchestrationElapsed(...)` so the adopted controller renders frozen timers and never keeps a live ticker. Every legitimate idle boundary keeps the persisted store non-terminal (fresh bootstrap default, `clearPersistedPromptCommandRuntimeState` after `/req-reset`, and the `session_start` `startup|reload` reset whose hook-end persist overwrites the store), so the adoption can never resurrect a reset state. The mutation is intentionally persist-free because the process-scoped store already holds exactly the adopted facts; the next intercepted hook mirrors the healed controller back unchanged. Runtime is O(1) plus one optional status render. No external state is mutated.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller whose stale idle state is healed in place.
 * @param[in] ctx {ExtensionContext | undefined} Optional active extension context used for the status-bar refresh; defaults to the controller's latest cached context.
 * @return {boolean} `true` when a persisted terminal state was adopted; `false` when the controller was not `idle` or the persisted state was not terminal.
 * @note Complexity: O(1) plus one optional status render.
 * @satisfies REQ-222, REQ-279, REQ-629, REQ-633, REQ-656, REQ-663
 */
export function resynchronizePersistedTerminalWorkflowState(
  controller: PiUsereqStatusController,
  ctx?: ExtensionContext,
): boolean {
  if (controller.state.workflowState !== "idle") {
    return false;
  }
  const terminalState = readPersistedPromptCommandTerminalState();
  if (terminalState === undefined) {
    return false;
  }
  controller.state.workflowState = terminalState.workflowState;
  controller.state.workflowRequest = terminalState.workflowRequest;
  freezeAdoptedTerminalOrchestrationElapsed(controller);
  const renderContext = ctx ?? controller.latestContext;
  if (renderContext) {
    renderPiUsereqStatus(controller, renderContext);
  }
  return true;
}

/**
 * @brief Updates mutable status state for one intercepted lifecycle hook.
 * @details Refreshes stored context usage on every hook, restores persisted elapsed-timer facts during `session_start`, records the one-shot `/new` empty-context reset fact consumed by the next orchestration-start `context_timer` decision, and closes an in-flight orchestration for `startup|reload` by freezing `running_timer` and absorbing its duration into `context_timer` plus `session_timer`, loads the active runtime sound level from persisted config during `session_start`, restores persisted prompt-command metadata when the active session matches a forked execution session, restores the persisted terminal workflow state plus active request for non-reset `session_start` reasons and resets workflow state to `idle` only for `startup|reload`, resynchronizes a stale idle replacement controller from the persisted terminal transition on every non-`session_start` hook so terminal transitions persisted by the initiating instance after the replacement bound stay visible, reconciles that rebound controller's stale in-flight elapsed timers by adopting the persisted frozen timer facts whenever the process-scoped store reports the orchestration closed so live ticking stops at the orchestration end and the accumulated durations stay intact for the next orchestration, and freezes a terminal-adopted controller's stale in-flight elapsed record at the `session_start` terminal restore so adopted terminal states never keep ticking, clears the deferred terminal finalization outcome whenever session resets clear prompt-request metadata, records whether the in-flight run belongs to the active prompt request, and promotes the pending prompt-request metadata into the active run on `agent_start` while preserving an already-promoted active request across pi-host agent-run restarts such as overflow compact-and-retry recovery, persists the in-flight agent-run ownership into the process-scoped store, captures the orchestration elapsed at `agent_end` or `agent_settled` (recovering the orchestration start and prompt association from the process-scoped store when the in-memory timer was cleared mid-run) for `%%TIME%%` substitution, closes an unpreserved in-flight orchestration at `session_shutdown` before resetting in-flight workflow states to `idle`, preserves in-memory prompt-command state plus process-scoped persistence across switch-triggered `session_shutdown`, keeps terminal `done|warning|error` states across shutdown, tolerates stale post-replacement render contexts, synchronizes the live ticker with the in-flight orchestration, and re-renders the status bar with the runtime extension identity prefix when configuration is available. Runtime is O(1). Side effects include in-memory state mutation, interval scheduling, process-scoped persistence mutation, and footer-status updates.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
 * @param[in] hookName {PiUsereqStatusHookName} Intercepted hook name.
 * @param[in] event {unknown} Hook payload forwarded from the wrapper.
 * @param[in] ctx {ExtensionContext} Active extension context.
 * @return {void} No return value.
 * @satisfies REQ-009, REQ-117, REQ-118, REQ-119, REQ-123, REQ-124, REQ-125, REQ-159, REQ-169, REQ-187, REQ-217, REQ-221, REQ-278, REQ-279, REQ-280, REQ-285, REQ-421, REQ-461, REQ-803, REQ-804, REQ-807, REQ-808, REQ-809
 */
export function updateExtensionStatus(
  controller: PiUsereqStatusController,
  hookName: PiUsereqStatusHookName,
  event: unknown,
  ctx: ExtensionContext,
): void {
  controller.latestContext = ctx;
  refreshContextUsage(controller.state, ctx);
  const nowMs = Date.now();
  const currentSessionFile = getContextSessionFile(ctx);

  if (hookName === "session_start") {
    if (isSessionStartReasonStartup(event)) {
      // Pi client start anchors every elapsed timer to zero and fires exactly once per host
      // process, so re-establishing the fresh store there is a production no-op that keeps
      // `session_timer` correctly rooted at the client-start boundary.
      resetPiUsereqElapsedTimerState(controller.state);
    } else {
      restorePersistedElapsedState(controller.state);
      if (shouldCloseInFlightOrchestrationOnSessionStart(event)) {
        // Hard orchestration boundary: `reload` tears down any in-flight orchestration, so its
        // duration is frozen into `running_timer` and absorbed into the context plus session
        // accumulators instead of ticking forever.
        closeInFlightOrchestration(controller.state, nowMs);
      }
      if (isSessionStartReasonNewSession(event)) {
        // REQ-805/REQ-806: the `/new` replacement starts a brand-new empty context, so the next
        // orchestration must restart `context_timer` from zero even when the command-time
        // session-entry probe cannot report the fresh-session emptiness. The fact is a
        // decision input only: no accumulator is mutated here, preserving REQ-809.
        markPendingEmptyContextReset();
      }
    }
    controller.state.runtimeSoundLevel = controller.config?.["notify-sound"]
      ?? controller.state.runtimeSoundLevel
      ?? "none";
    const shouldResetWorkflowState = shouldResetWorkflowStateOnSessionStart(event);
    if (shouldResetWorkflowState) {
      controller.state.workflowState = "idle";
      controller.state.workflowRequest = undefined;
    } else {
      const terminalState = readPersistedPromptCommandTerminalState();
      if (terminalState !== undefined && controller.state.workflowState === "idle") {
        controller.state.workflowState = terminalState.workflowState;
        controller.state.workflowRequest = terminalState.workflowRequest;
        freezeAdoptedTerminalOrchestrationElapsed(controller);
      }
    }
    controller.state.endedOrchestrationElapsedMs = undefined;
    if (shouldResetWorkflowState || controller.state.workflowState === "idle") {
      controller.state.pendingPromptRequest = undefined;
      controller.state.activePromptRequest = undefined;
      controller.state.pendingFinalizationOutcome = undefined;
      controller.state.pendingFinalizationStatusMarker = undefined;
      controller.state.pendingFinalizationBlockedMessage = undefined;
      controller.state.pendingFinalizationReport = undefined;
    }
    if (shouldResetWorkflowState) {
      // The persisted finalization snapshot shares the process-lifetime semantics of the
      // captured Next-Workflow array: only the idle-reset bootstrap boundaries drop it, so
      // one extension rebind between the final `agent_end` and `agent_settled` can still
      // recover the recorded terminal facts after the prompt-state restore below.
      clearPersistedPromptCommandFinalizationSnapshot();
    }
  }

  restorePersistedPromptCommandState(controller.state, currentSessionFile);
  if (hookName !== "session_start") {
    // A replacement runtime bound while an orchestration was in flight keeps ticking its
    // stale in-memory start after the initiating runtime closed the orchestration in the
    // process-scoped store; adopt the persisted frozen timer facts first so live ticking
    // stops at the orchestration end and the hook-end persist keeps the frozen store values.
    reconcileReboundOrchestrationElapsedState(controller);
    // A replacement runtime bound while the persisted state was still in flight missed the
    // one-shot terminal restore inside session_start handling; adopt the persisted terminal
    // transition on the next intercepted hook so post-switch terminal transitions stay
    // visible to the replacement runtime and its hook-end persist keeps the terminal facts.
    resynchronizePersistedTerminalWorkflowState(controller);
  }
  const preservePromptCommandStateOnShutdown = hookName === "session_shutdown"
    && shouldPreservePromptCommandStateOnShutdown(controller.state);

  if (hookName === "agent_start") {
    // Promote only when a pending request exists: the pi host restarts the agent run for
    // overflow compact-and-retry recovery (agent_end -> session_before_compact ->
    // session_compact -> agent_start -> retried provider request) while the originating
    // prompt-command orchestration stays in flight. Overwriting the already-promoted
    // active request with an undefined pending request would drop the run from controller
    // state and process-scoped persistence, silencing every retried before_provider_request
    // capture (REQ-421) and the later matched-success or matched-failure closure handling.
    const pendingPromptRequest = controller.state.pendingPromptRequest;
    if (pendingPromptRequest !== undefined) {
      controller.state.activePromptRequest = pendingPromptRequest;
      controller.state.pendingPromptRequest = undefined;
    }
    // The in-flight run belongs to the active prompt request when this start promoted a
    // pending request, or when an already-promoted request still owns an open prompt
    // workflow (`running`, or `merging` while matched-success finalization waits for
    // `agent_settled`). Error-retained requests park the workflow in `error` and must
    // never reclaim ownership of later unrelated agent runs.
    controller.state.activeRunBelongsToPrompt = pendingPromptRequest !== undefined
      || (controller.state.activePromptRequest !== undefined
        && (controller.state.activeRunBelongsToPrompt
          || controller.state.workflowState === "running"
          || controller.state.workflowState === "merging"));
    persistActiveRunOwnership(controller.state);
  }

  if (hookName === "agent_end" || hookName === "agent_settled") {
    // Recover the orchestration start and prompt association from the process-scoped store
    // when the in-memory timer was cleared between `agent_start` and this terminal hook
    // (mid-run rebind or fault-injected state loss), so the terminal agent event reports the
    // ended run's own orchestration elapsed for `%%TIME%%` substitution instead of a
    // previous orchestration's counter or a fabricated zero. The ownership flag travels
    // with the same store, so a recovered run can never borrow another run's prompt
    // association.
    const persistedElapsedStore = getPiUsereqStatusPersistenceStore();
    const orchestrationStartMs = controller.state.orchestrationStartMs
      ?? persistedElapsedStore.orchestrationStartMs;
    const runBelongsToPrompt = controller.state.activeRunBelongsToPrompt
      || persistedElapsedStore.activeRunBelongsToPrompt === true;
    if (orchestrationStartMs === undefined) {
      // No recoverable orchestration exists for this terminal event: mark the elapsed
      // unknown so downstream notification gates never substitute a previous
      // orchestration's counter or a fabricated zero.
      controller.state.endedOrchestrationElapsedMs = undefined;
    } else {
      controller.state.endedOrchestrationElapsedMs = Math.max(0, nowMs - orchestrationStartMs);
    }
    // Retain the ended run's ownership flag for the post-update notification gate; the next
    // `agent_start` recomputes it for the next run.
    controller.state.activeRunBelongsToPrompt = runBelongsToPrompt;
    clearPersistedActiveRunOwnership();
  }

  if (hookName === "session_shutdown") {
    controller.state.activeRunBelongsToPrompt = false;
    controller.state.endedOrchestrationElapsedMs = undefined;
    if (!preservePromptCommandStateOnShutdown) {
      controller.state.pendingPromptRequest = undefined;
      controller.state.activePromptRequest = undefined;
      controller.state.pendingFinalizationOutcome = undefined;
      controller.state.pendingFinalizationStatusMarker = undefined;
      controller.state.pendingFinalizationBlockedMessage = undefined;
      controller.state.pendingFinalizationReport = undefined;
      clearPersistedPromptCommandFinalizationSnapshot();
      if (
        controller.state.workflowState === "checking"
        || controller.state.workflowState === "running"
        || controller.state.workflowState === "merging"
      ) {
        // The shutdown tears down an unpreserved in-flight orchestration: freeze
        // `running_timer` and absorb the executed duration into the context plus session
        // accumulators before the workflow state resets to `idle`.
        closeInFlightOrchestration(controller.state, nowMs);
        controller.state.workflowState = "idle";
        controller.state.workflowRequest = undefined;
      }
    }
  }

  persistElapsedState(controller.state);
  if (!preservePromptCommandStateOnShutdown) {
    persistPromptCommandState(controller.state);
  }
  syncPiUsereqStatusTicker(controller);
  renderPiUsereqStatus(controller, ctx);
}

/**
 * @brief Disposes the pi-usereq status controller.
 * @details Stops the live ticker, clears the cached context pointer, and leaves
 * the last captured status snapshot available for inspection until the
 * controller object itself is discarded. Runtime is O(1). Side effects are
 * limited to interval disposal and in-memory state mutation.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
 * @return {void} No return value.
 */
export function disposePiUsereqStatusController(
  controller: PiUsereqStatusController,
): void {
  stopStatusTicker(controller);
  controller.latestContext = undefined;
}
