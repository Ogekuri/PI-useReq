/**
 * @file
 * @brief Tracks pi-usereq extension status state and renders status-bar telemetry.
 * @details Centralizes hook interception, context-usage snapshots, run timing,
 * and deterministic status-bar formatting for the pi-usereq extension. Runtime
 * is O(1) per event plus interval-driven re-renders while a prompt remains
 * active. Side effects are limited to in-memory state mutation and interval
 * scheduling through exported controller helpers.
 */

import type {
  AgentEndEvent,
  ContextUsage,
  ExtensionContext,
  ThemeColor,
} from "@mariozechner/pi-coding-agent";
import type { UseReqConfig } from "./config.js";
import type { PromptCommandExecutionPlan } from "./prompt-command-runtime.js";
import {
  restorePersistedPromptCommandRuntimeStateForSession,
  writePersistedPromptCommandRuntimeState,
} from "./prompt-command-state.js";

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
  "before_agent_start",
  "agent_start",
  "agent_end",
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
 * @details Narrows workflow tracking to the documented `idle`, `checking`, `running`, `merging`, and `error` states reused by prompt-command gating, prompt-end orchestration, and status rendering. Compile-time only and introduces no runtime cost.
 */
export type PiUsereqWorkflowState = "idle" | "checking" | "running" | "merging" | "error";

/**
 * @brief Stores the mutable runtime facts displayed by the status bar.
 * @details Persists the prompt-orchestration workflow state, the latest context-usage snapshot, the active run start timestamp, the most recent normally completed run duration, the accumulated duration of all normally completed runs, and prompt-request metadata carried from command dispatch into the next runtime execution. Runtime state is mutated in-place by controller helpers. Compile-time only and introduces no runtime cost.
 */
export interface PiUsereqStatusState {
  workflowState: PiUsereqWorkflowState;
  contextUsage: ContextUsage | undefined;
  runStartTimeMs: number | undefined;
  lastRunDurationMs: number | undefined;
  totalRunDurationMs: number | undefined;
  pendingPromptRequest: PiUsereqPromptRequest | undefined;
  activePromptRequest: PiUsereqPromptRequest | undefined;
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
 * @details Preserves only the latest completed duration and accumulated completed runtime so `/new`, `/resume`, and `/fork` can restore elapsed counters after the extension runtime is rebound. Compile-time only and introduces no runtime cost.
 */
interface PiUsereqStatusPersistenceStore {
  lastRunDurationMs: number | undefined;
  totalRunDurationMs: number | undefined;
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
    lastRunDurationMs: undefined,
    totalRunDurationMs: undefined,
  };
  return globalState[PI_USEREQ_STATUS_PERSISTENCE_KEY]!;
}

/**
 * @brief Restores persisted elapsed counters into one mutable status snapshot.
 * @details Copies the process-scoped last-run and accumulated completed durations into the supplied controller state so rebinding events can continue showing prior counters. Runtime is O(1). Side effect: mutates `state`.
 * @param[in,out] state {PiUsereqStatusState} Mutable status state.
 * @return {void} No return value.
 */
function restorePersistedElapsedState(state: PiUsereqStatusState): void {
  const store = getPiUsereqStatusPersistenceStore();
  state.lastRunDurationMs = store.lastRunDurationMs;
  state.totalRunDurationMs = store.totalRunDurationMs;
}

/**
 * @brief Persists elapsed counters from one mutable status snapshot.
 * @details Copies the current last-run and accumulated completed durations into the process-scoped store so later extension instances can restore them after session replacement. Runtime is O(1). Side effect: mutates internal process-scoped state.
 * @param[in] state {PiUsereqStatusState} Mutable status state snapshot.
 * @return {void} No return value.
 */
function persistElapsedState(state: PiUsereqStatusState): void {
  const store = getPiUsereqStatusPersistenceStore();
  store.lastRunDurationMs = state.lastRunDurationMs;
  store.totalRunDurationMs = state.totalRunDurationMs;
}

/**
 * @brief Mirrors one controller prompt state into the process-scoped persistence store.
 * @details Persists the current workflow state plus the pending and active prompt execution plans so prompt orchestration can survive session replacement. Runtime is O(1). Side effect: mutates process-scoped prompt-command persistence state.
 * @param[in] state {PiUsereqStatusState} Current controller state snapshot.
 * @return {void} No return value.
 */
function persistPromptCommandState(state: PiUsereqStatusState): void {
  writePersistedPromptCommandRuntimeState({
    workflowState: state.workflowState,
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
 * @details Rehydrates workflow state plus pending or active prompt execution plans only when the current session file targets the persisted execution session created for prompt orchestration. Runtime is O(1). Side effect: mutates `state` when persisted prompt state is available.
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
 * @brief Resets the in-memory and persisted elapsed counters.
 * @details Clears both completed-duration fields in the supplied state and mirrors that cleared snapshot into the process-scoped store. Runtime is O(1). Side effects include mutable state reset and process-scoped persistence update.
 * @param[in,out] state {PiUsereqStatusState} Mutable status state.
 * @return {void} No return value.
 * @satisfies REQ-217
 */
function resetElapsedState(state: PiUsereqStatusState): void {
  state.lastRunDurationMs = undefined;
  state.totalRunDurationMs = undefined;
  persistElapsedState(state);
}

/**
 * @brief Detects whether a `session_start` event must reset elapsed counters.
 * @details Treats `startup` and `reload` as hard-reset boundaries while preserving counters for `new`, `resume`, and `fork`. Runtime is O(1). No external state is mutated.
 * @param[in] event {unknown} Session-start payload.
 * @return {boolean} `true` when elapsed counters must reset.
 * @satisfies REQ-217
 */
function shouldResetElapsedStateOnSessionStart(event: unknown): boolean {
  const reason = (event as { reason?: unknown }).reason;
  return reason === "startup" || reason === "reload";
}

/**
 * @brief Detects whether a `session_start` event must reset the workflow state to `idle`.
 * @details Treats `startup`, `new`, and `reload` as workflow-reset boundaries so prompt-orchestration state never leaks across boot, explicit session replacement, or extension reload. Runtime is O(1). No external state is mutated.
 * @param[in] event {unknown} Session-start payload.
 * @return {boolean} `true` when workflow state must reset to `idle`.
 * @satisfies REQ-009, REQ-221
 */
function shouldResetWorkflowStateOnSessionStart(event: unknown): boolean {
  const reason = (event as { reason?: unknown }).reason;
  return reason === "startup" || reason === "new" || reason === "reload";
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
 * @details Maps context usage to one fixed-width icon band so footer rendering
 * remains compact and deterministic. Unavailable usage degrades to the `0%`
 * icon. Runtime is O(1). No external state is mutated.
 * @param[in] contextUsage {ContextUsage | undefined} Normalized context snapshot.
 * @return {string} Fixed-width gauge icon text.
 * @satisfies REQ-121, REQ-122
 */
function resolveContextUsageIconText(
  contextUsage: ContextUsage | undefined,
): string {
  const percent = contextUsage?.percent;
  if (percent === undefined || percent === null || percent <= 0) {
    return "▕_▏";
  }
  if (percent <= 25) {
    return "▕▂▏";
  }
  if (percent <= 50) {
    return "▕▄▏";
  }
  if (percent <= 90) {
    return "▕▆▏";
  }
  return "▕█▏";
}

/**
 * @brief Formats one icon-based context-usage gauge.
 * @details Renders the documented `warning`-colored icon bands for `0-90%`, applies terminal blink control to the `warning`-colored `>90-100%` icon, and applies terminal blink control to the `error`-colored overflow icon so unsupported terminals degrade to non-blinking colored text automatically. Runtime is O(1). No external state is mutated.
 * @param[in] theme {StatusThemeAdapter} Normalized status theme.
 * @param[in] contextUsage {ContextUsage | undefined} Normalized context snapshot.
 * @return {string} Rendered fixed-width gauge icon.
 * @satisfies REQ-121, REQ-122, REQ-126, REQ-127, REQ-128, REQ-233
 */
function formatContextUsageBar(
  theme: StatusThemeAdapter,
  contextUsage: ContextUsage | undefined,
): string {
  const percent = contextUsage?.percent ?? 0;
  if (percent > 100) {
    return theme.colorize("error", "\u001b[5m▕█▏\u001b[25m");
  }
  if (percent > 90) {
    return theme.colorize("warning", "\u001b[5m▕█▏\u001b[25m");
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
 * @brief Formats one optional completed-duration value.
 * @details Returns the canonical unset placeholder `--:--` until the supplied
 * timer receives a normally completed prompt duration, then delegates to
 * `formatStatusDuration(...)`. Runtime is O(1). No external state is mutated.
 * @param[in] durationMs {number | undefined} Optional completed-duration value.
 * @return {string} Rendered duration or unset placeholder.
 * @satisfies REQ-124
 */
function formatCompletedStatusDuration(
  durationMs: number | undefined,
): string {
  return durationMs === undefined ? "--:--" : formatStatusDuration(durationMs);
}

/**
 * @brief Formats the consolidated `elapsed` status-bar value.
 * @details Emits the active prompt segment `⏱︎ <active>`, the latest normally
 * completed segment `⚑ <last>`, and the accumulated successful-runtime segment
 * `⌛︎<total>` with fixed spacing. Runtime is O(1). No external state is
 * mutated.
 * @param[in] state {PiUsereqStatusState} Mutable status state snapshot.
 * @param[in] nowMs {number} Current wall-clock time in milliseconds.
 * @return {string} Consolidated `elapsed` field value.
 * @satisfies REQ-123, REQ-124, REQ-125, REQ-159
 */
function formatElapsedStatusValue(
  state: PiUsereqStatusState,
  nowMs: number,
): string {
  const activeText = state.runStartTimeMs === undefined
    ? "--:--"
    : formatStatusDuration(nowMs - state.runStartTimeMs);
  const lastText = formatCompletedStatusDuration(state.lastRunDurationMs);
  const totalText = formatCompletedStatusDuration(state.totalRunDurationMs);
  return `⏱︎ ${activeText} ⚑ ${lastText} ⌛︎${totalText}`;
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
 * @brief Formats the rendered workflow-state value for the `status` field.
 * @details Uses the standard warning-colored value renderer for non-error states and emits a blinking `error`-colored value for `status:error` so the footer highlights orchestration failures immediately. Runtime is O(n) in text length. No external state is mutated.
 * @param[in] theme {StatusThemeAdapter} Normalized status theme.
 * @param[in] workflowState {PiUsereqWorkflowState} Current workflow state.
 * @return {string} Rendered workflow-state value.
 * @satisfies REQ-112, REQ-223
 */
function formatWorkflowStateValue(
  theme: StatusThemeAdapter,
  workflowState: PiUsereqWorkflowState,
): string {
  if (workflowState === "error") {
    return theme.colorize("error", "\u001b[5merror\u001b[25m");
  }
  return theme.value(workflowState);
}

/**
 * @brief Detects whether an agent run ended through abort semantics.
 * @details Treats any assistant message whose `stopReason` equals `aborted` as
 * an escape-triggered termination that must not overwrite the `last` timer.
 * Runtime is O(n) in message count. No external state is mutated.
 * @param[in] messages {AgentEndEvent["messages"]} Messages emitted by `agent_end`.
 * @return {boolean} `true` when the run ended in aborted state.
 * @satisfies REQ-125
 */
function didAgentEndAbort(messages: AgentEndEvent["messages"]): boolean {
  return messages.some((message) =>
    typeof message === "object"
      && message !== null
      && (message as { role?: unknown }).role === "assistant"
      && (message as { stopReason?: unknown }).stopReason === "aborted",
  );
}

/**
 * @brief Builds the full single-line pi-usereq status-bar payload.
 * @details Renders status, context, elapsed, and sound fields in the canonical order with dim bullet separators, workflow-state highlighting, and the documented icon-based context gauge. Runtime is O(1). No external state is mutated.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] theme {StatusThemeAdapter} Normalized status theme.
 * @param[in] state {PiUsereqStatusState} Mutable status state snapshot.
 * @param[in] nowMs {number} Current wall-clock time in milliseconds.
 * @return {string} Single-line status-bar text.
 * @satisfies REQ-109, REQ-112, REQ-120, REQ-121, REQ-123, REQ-124, REQ-125, REQ-126, REQ-127, REQ-128, REQ-156, REQ-159, REQ-180, REQ-222, REQ-223
 */
function buildPiUsereqStatusText(
  config: UseReqConfig,
  theme: StatusThemeAdapter,
  state: PiUsereqStatusState,
  nowMs: number,
): string {
  const elapsedText = formatElapsedStatusValue(state, nowMs);
  const soundText = config["notify-sound"];
  return [
    formatRenderedStatusField(
      theme,
      "status",
      formatWorkflowStateValue(theme, state.workflowState),
    ),
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
 * @brief Synchronizes the live elapsed-time ticker with the current run state.
 * @details Starts a 1-second render ticker while a run is active and stops the
 * ticker when the run returns to idle. Runtime is O(1). Side effects include
 * interval creation, interval disposal, and footer-status mutation on timer
 * ticks.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
 * @return {void} No return value.
 * @satisfies REQ-123
 */
function syncPiUsereqStatusTicker(
  controller: PiUsereqStatusController,
): void {
  if (controller.state.runStartTimeMs === undefined) {
    stopStatusTicker(controller);
    return;
  }
  if (controller.tickHandle !== undefined) {
    return;
  }
  controller.tickHandle = setInterval(() => {
    if (!controller.latestContext || !controller.config) {
      return;
    }
    renderPiUsereqStatus(controller, controller.latestContext);
  }, 1000);
}

/**
 * @brief Creates an empty pi-usereq status controller.
 * @details Initializes the mutable status snapshot, including empty prompt-request tracking, and starts with no config, no context, and no live ticker. Runtime is O(1). No external state is mutated.
 * @return {PiUsereqStatusController} New status controller.
 * @satisfies DES-010
 */
export function createPiUsereqStatusController(): PiUsereqStatusController {
  return {
    config: undefined,
    latestContext: undefined,
    state: {
      workflowState: "idle",
      contextUsage: undefined,
      runStartTimeMs: undefined,
      lastRunDurationMs: undefined,
      totalRunDurationMs: undefined,
      pendingPromptRequest: undefined,
      activePromptRequest: undefined,
    },
    tickHandle: undefined,
  };
}

/**
 * @brief Stores the effective project configuration used by status rendering.
 * @details Replaces the controller's cached configuration so later status
 * renders reuse the latest docs, tests, source-path, and pi-notify values
 * without reading from disk on every event. Runtime is O(1). Side effect:
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
 * @brief Renders the current pi-usereq status bar into the active UI context.
 * @details Updates the controller's latest context pointer and writes the single-line status text only when configuration is available, including the documented icon-based context gauge. When pi has already invalidated the supplied context after session replacement or reload, the helper clears the stale cached context and returns without surfacing the stale-instance exception. Runtime is O(1). Side effect: mutates `ctx.ui` status when the context is still active.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
 * @param[in] ctx {ExtensionContext} Active extension context.
 * @return {void} No return value.
 * @satisfies REQ-120, REQ-121, REQ-123, REQ-124, REQ-125, REQ-126, REQ-127, REQ-128, REQ-159, REQ-180, REQ-280
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
    const theme = createStatusThemeAdapter(ctx.ui.theme as RawStatusTheme);
    ctx.ui.setStatus(
      "pi-usereq",
      buildPiUsereqStatusText(
        controller.config,
        theme,
        controller.state,
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
 * @details Mutates the tracked workflow state, preserves the latest extension context when available, and re-renders the single-line footer immediately so internal command transitions and pi lifecycle transitions stay visible to the user. Runtime is O(1). Side effect: mutates workflow state and may update `ctx.ui` status.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
 * @param[in] workflowState {PiUsereqWorkflowState} Next workflow state.
 * @param[in] ctx {ExtensionContext | undefined} Optional active extension context.
 * @return {void} No return value.
 * @satisfies REQ-221, REQ-222, REQ-223
 */
export function setPiUsereqWorkflowState(
  controller: PiUsereqStatusController,
  workflowState: PiUsereqWorkflowState,
  ctx?: ExtensionContext,
): void {
  controller.state.workflowState = workflowState;
  persistPromptCommandState(controller.state);
  const renderContext = ctx ?? controller.latestContext;
  if (renderContext) {
    renderPiUsereqStatus(controller, renderContext);
  }
}

/**
 * @brief Updates mutable status state for one intercepted lifecycle hook.
 * @details Refreshes stored context usage on every hook, resets or restores persisted elapsed counters during `session_start`, restores persisted prompt-command metadata when the active session matches a forked execution session, resynchronizes that metadata on later lifecycle hooks so post-switch workflow transitions performed by the initiating command handler become visible to the replacement-session runtime, resets workflow state to `idle` for documented session-start reasons, starts run timing on `agent_start`, promotes pending prompt-request metadata into the active run, captures non-aborted run duration on `agent_end`, accumulates successful runtime into `Σ`, preserves in-memory prompt-command state plus process-scoped persistence across switch-triggered `session_shutdown`, tolerates stale post-replacement render contexts, synchronizes the live ticker, and re-renders the status bar when configuration is available. Runtime is O(n) in `agent_end` message count and otherwise O(1). Side effects include in-memory state mutation, interval scheduling, process-scoped persistence mutation, and footer-status updates.
 * @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
 * @param[in] hookName {PiUsereqStatusHookName} Intercepted hook name.
 * @param[in] event {unknown} Hook payload forwarded from the wrapper.
 * @param[in] ctx {ExtensionContext} Active extension context.
 * @return {void} No return value.
 * @satisfies REQ-009, REQ-117, REQ-118, REQ-119, REQ-123, REQ-124, REQ-125, REQ-159, REQ-169, REQ-217, REQ-221, REQ-278, REQ-279, REQ-280
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
    if (shouldResetElapsedStateOnSessionStart(event)) {
      resetElapsedState(controller.state);
    } else {
      restorePersistedElapsedState(controller.state);
    }
    const shouldResetWorkflowState = shouldResetWorkflowStateOnSessionStart(event);
    if (shouldResetWorkflowState) {
      controller.state.workflowState = "idle";
    }
    controller.state.runStartTimeMs = undefined;
    if (shouldResetWorkflowState || controller.state.workflowState === "idle") {
      controller.state.pendingPromptRequest = undefined;
      controller.state.activePromptRequest = undefined;
    }
  }

  restorePersistedPromptCommandState(controller.state, currentSessionFile);
  const preservePromptCommandStateOnShutdown = hookName === "session_shutdown"
    && shouldPreservePromptCommandStateOnShutdown(controller.state);

  if (hookName === "agent_start") {
    controller.state.runStartTimeMs = nowMs;
    controller.state.activePromptRequest = controller.state.pendingPromptRequest;
    controller.state.pendingPromptRequest = undefined;
  }

  if (hookName === "agent_end" && controller.state.runStartTimeMs !== undefined) {
    const durationMs = nowMs - controller.state.runStartTimeMs;
    if (!didAgentEndAbort((event as AgentEndEvent).messages ?? [])) {
      controller.state.lastRunDurationMs = durationMs;
      controller.state.totalRunDurationMs = controller.state.totalRunDurationMs === undefined
        ? durationMs
        : controller.state.totalRunDurationMs + durationMs;
    }
    controller.state.runStartTimeMs = undefined;
  }

  if (hookName === "session_shutdown") {
    controller.state.runStartTimeMs = undefined;
    if (!preservePromptCommandStateOnShutdown) {
      controller.state.pendingPromptRequest = undefined;
      controller.state.activePromptRequest = undefined;
      controller.state.workflowState = "idle";
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
